import type { Db } from "mongodb";

import type { GameItem } from "./gameplay.ts";
import { getUnexpiredItemFilter } from "./item-expiration.ts";
import { getDisplayedLegendaryEffect, getLegendaryNumberParameter } from "./legendary-attributes.ts";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import { checkItemForHallOfFameStatus } from "./hall-of-fame.ts";

type DisposalPlayer = {
  _id: string;
  active: boolean;
  screen_name: string;
  test_account?: boolean;
  profile: { bank_balance: number };
};

// Only disposal handlers may bypass capacity; ordinary acquisitions still need space.
export async function acquireForDisposal(database: Db, item: GameItem): Promise<GameItem> {
  if (item.status !== "for_sale" && item.status !== "unclaimed") return item;
  const purchasing = item.status === "for_sale";
  const [discount, rollCount] = purchasing
    ? await Promise.all([
        getDisplayedLegendaryEffect(database, item.owner, "DEALER_DISCOUNT"),
        getDisplayedLegendaryEffect(database, item.owner, "DEALER_PURCHASE_ROLL_COUNT_SET"),
      ])
    : [null, null];
  const amount = purchasing
    ? Math.floor(item.values.dealer * getLegendaryNumberParameter(discount, "cost_multiplier", 1))
    : 0;
  const now = new Date();
  const increments = {
    "profile.playthrough_stats.items_collected": 1,
    ...(purchasing ? {
      "profile.bank_balance": -amount,
      "profile.playthrough_stats.money_spent": amount,
    } : {}),
  };
  const player = await database.collection<DisposalPlayer>("players").findOneAndUpdate(
    {
      _id: item.owner, active: true,
      ...(purchasing ? { "profile.bank_balance": { $gte: amount } } : {}),
    },
    { $inc: increments, $set: { "profile.last_activity": now.toISOString() } },
    { returnDocument: "after" },
  );
  if (!player) throw new Error("The artwork could not be collected or purchased. Check your account and bank balance.");
  const setter: Partial<GameItem> = {
    status: "claimed", date_received: now.toISOString(),
    ...(rollCount ? { roll_count: Math.floor(getLegendaryNumberParameter(rollCount, "roll_count", -20)) } : {}),
  };
  try {
    const changed = await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: item.owner, status: item.status, ...getUnexpiredItemFilter(now) },
      { $set: setter, $unset: { expires_at: "" } },
    );
    if (changed.modifiedCount !== 1) throw new Error("This offer changed or expired before it could be acquired.");
  } catch (error) {
    const refund = await database.collection<DisposalPlayer>("players").updateOne(
      { _id: item.owner },
      { $inc: Object.fromEntries(Object.entries(increments).map(([key, value]) => [key, -value])) },
    );
    if (refund.modifiedCount !== 1) throw new Error("The acquisition failed and its account changes could not be refunded.");
    throw error;
  }
  const acquired = { ...item, ...setter };
  delete acquired.expires_at;
  await recordEconomyMetricsSafely(database, [
    ...(purchasing ? [{
      amount, currency: "money" as const, direction: "spent" as const, source: "dealer-purchase",
    }] : []),
    {
      amount: item.values.actual, currency: "items", direction: "acquired",
      source: purchasing ? "item-purchase" : "item-claim",
    },
  ]);
  await checkItemForHallOfFameStatus(database, acquired, player).catch((error) => {
    console.error(`Unable to review acquired item ${item._id} for Hall of Fame`, error);
  });
  return acquired;
}

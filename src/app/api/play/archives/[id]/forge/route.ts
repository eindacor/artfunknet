import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";

import type { PlayerArtworkArchive } from "@/server/archive-gameplay";
import {
  BASE_FORGERY_QUALITY,
  calculateForgeCostForSelection,
  validateForgerySelection,
} from "@/server/forgery-gameplay";
import {
  calculateItemValues,
  getGeneratedItemCondition,
  isSeasonalArtwork,
  getItemAttributes,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import {
  getArtworkEffect,
  getDisplayedArtworkEffect,
} from "@/server/artwork-effects";
import { getGameplaySettings } from "@/server/game-settings";
import { checkItemForHallOfFameStatus } from "@/server/hall-of-fame";
import { getRerollCost } from "@/server/item-reroll";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  MASTERPIECE_EFFECT_CODES,
  rollEffectChance,
} from "@/server/masterpiece-effects";

type Player = {
  _id: string;
  active: boolean;
  screen_name: string;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    inventory_cap: number;
    expansion_slots?: number;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as {
    modifiers?: unknown;
    artStyle?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json(
      { error: "Choose valid archived forgery properties." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const [player, archive, settings, metadata, attributes] = await Promise.all([
    database.collection<Player>("players").findOne({ _id: auth.session.playerId, active: true }),
    database.collection<PlayerArtworkArchive>("player_artwork_archives").findOne({ _id: id, owner: auth.session.playerId }),
    getGameplaySettings(database),
    database.collection<{ _id: string; loot_data: LootData }>("metadata").findOne({ _id: "loot-data" }),
    database.collection<ItemAttribute>("attributes").find({ active: true }).toArray(),
  ]);
  if (!player || !archive) {
    return NextResponse.json(
      { error: "The archive is no longer available." },
      { status: 404 },
    );
  }
  if (!metadata) {
    return NextResponse.json({ error: "Loot metadata is unavailable." }, { status: 500 });
  }
  let selection;
  try {
    selection = validateForgerySelection(archive, body.modifiers, body.artStyle);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid forgery selection." }, { status: 400 });
  }
  const selected = new Set(selection.modifiers);

  const [artwork, inventoryCount, forgeryCopyEffect] = await Promise.all([
    database.collection<Artwork>("artworks").findOne({ _id: archive.artwork_id, active: true }),
    database.collection<GameItem>("items").countDocuments({
      owner: player._id,
      status: { $in: ["claimed", "displayed", "auctioned"] },
      original: { $ne: true },
      vintage: { $ne: true },
    }),
    getDisplayedArtworkEffect(
      database,
      player._id,
      MASTERPIECE_EFFECT_CODES.forgeryCopy,
    ),
  ]);
  if (!artwork) return NextResponse.json({ error: "The archived artwork is unavailable." }, { status: 404 });
  const capacity =
    player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
  if (inventoryCount >= capacity && !selected.has("vintage")) {
    return NextResponse.json({ error: "Your inventory is currently full." }, { status: 409 });
  }
  const copyFits =
    selected.has("vintage") || inventoryCount + 1 < capacity;

  const unlocked = selected.has("unlocked");
  const artworkEffect = await getArtworkEffect(database, artwork);
  const itemAttributes = getItemAttributes(
    artwork,
    unlocked,
    attributes,
    artworkEffect,
  );
  const mint =
    selected.has("mint") ||
    artworkEffect?.code === MASTERPIECE_EFFECT_CODES.preservationMint;
  const timestamp = new Date().toISOString();
  const base = {
    _id: randomUUID(),
    artwork_id: artwork._id,
    condition: getGeneratedItemCondition(mint, 0),
    mint,
    mint_value_multiplier: mint ? settings.active.mintValueMultiplier : 1,
    attributes: itemAttributes,
    ...(selection.artStyle === "museum" ? {} : { card_renderer: selection.artStyle }),
    owner: player._id,
    transaction_history: [{
      type: "generation" as const,
      from_owner: null,
      to_owner: player._id,
      occurred_at: timestamp,
      source: "forgery",
    }],
    status: "claimed" as const,
    source: "forgery",
    date_created: timestamp,
    date_received: timestamp,
    level: 1,
    roll_count: 0,
    reroll_spent: 0,
    foil: selected.has("foil"),
    unlocked,
    seasonal:
      selected.has("seasonal") || isSeasonalArtwork(metadata.loot_data, artwork),
    lottery: selected.has("lottery") ? 1 : 0,
    original: false,
    patreon: false,
    vintage: selected.has("vintage"),
    authenticity: {
      forgery: true,
      forgery_quality: BASE_FORGERY_QUALITY,
      liable: player._id,
      liability_pending: false,
      identified: true,
      fee: 0,
      original_owner: player._id,
    },
    tags: [],
    misprint: false,
    permanent: false,
    repairing: false,
    debug: settings.debugEnabled,
  };
  const values = calculateItemValues(base, artwork, metadata.loot_data);
  const cost = calculateForgeCostForSelection({
    artwork,
    lootData: metadata.loot_data,
    mintValueMultiplier: settings.active.mintValueMultiplier,
    modifiers: selection.modifiers,
    seasonal: base.seasonal,
  });
  const item: GameItem = {
    ...base,
    odds: "forged",
    values,
    reroll_cost: getRerollCost(base, artwork.rarity, metadata.loot_data),
  };
  if (player.profile.bank_balance < cost) {
    return NextResponse.json({ error: `You need $${cost.toLocaleString()} to forge this artwork.` }, { status: 409 });
  }

  let charged = false;
  let forgedItems: GameItem[] = [];
  try {
    const charge = await database.collection<Player>("players").updateOne(
      { _id: player._id, active: true, "profile.bank_balance": { $gte: cost } },
      {
        $inc: {
          "profile.bank_balance": -cost,
          "profile.playthrough_stats.items_collected": 1,
          "profile.playthrough_stats.money_spent": cost,
        },
        $set: { "profile.last_activity": timestamp },
      },
    );
    if (charge.modifiedCount !== 1) throw new Error("The forging cost could not be charged.");
    charged = true;
    const itemsToInsert = [item];
    if (copyFits && rollEffectChance(forgeryCopyEffect)) {
      itemsToInsert.push({
        ...structuredClone(item),
        _id: randomUUID(),
        date_created: new Date().toISOString(),
        date_received: new Date().toISOString(),
      });
    }
    await database.collection<GameItem>("items").insertMany(itemsToInsert);
    forgedItems = itemsToInsert;
    if (itemsToInsert.length > 1) {
      await database.collection<Player>("players").updateOne(
        { _id: player._id },
        { $inc: { "profile.playthrough_stats.items_collected": 1 } },
      );
    }
  } catch (error) {
    if (charged) {
      await database.collection<Player>("players").updateOne(
        { _id: player._id },
        {
          $inc: {
            "profile.bank_balance": cost,
            "profile.playthrough_stats.items_collected": -1,
            "profile.playthrough_stats.money_spent": -cost,
          },
        },
      );
    }
    console.error("Unable to forge archived artwork", error);
    return NextResponse.json({ error: "The forgery could not be completed." }, { status: 500 });
  }
  await recordEconomyMetricsSafely(database, {
    amount: cost,
    currency: "money",
    direction: "spent",
    source: "forge",
  });
  await Promise.all(
    forgedItems.map((forgedItem) =>
      checkItemForHallOfFameStatus(database, forgedItem, player).catch(
        (error) => {
          console.error(
            `Unable to submit forged item ${forgedItem._id} for Hall of Fame review`,
            error,
          );
        },
      ),
    ),
  );
  return NextResponse.json({
    status: "ok",
    cost,
    message:
      forgedItems.length > 1
        ? `${artwork.title} was forged for $${cost.toLocaleString()}, and the effect created a second copy.`
        : `${artwork.title} was forged for $${cost.toLocaleString()}.`,
  });
}

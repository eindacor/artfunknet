import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import type { PlayerArtworkArchive } from "@/server/archive-gameplay";
import {
  BASE_FORGERY_QUALITY,
  calculateForgeCost,
  getForgeryValueEstimate,
  validateForgerySelection,
} from "@/server/forgery-gameplay";
import {
  calculateItemValues,
  getGeneratedItemCondition,
  isSeasonalArtwork,
  rollAttributeValue,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import { getRerollCost } from "@/server/item-reroll";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
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

  const [artwork, inventoryCount] = await Promise.all([
    database.collection<Artwork>("artworks").findOne({ _id: archive.artwork_id, active: true }),
    database.collection<GameItem>("items").countDocuments({
      owner: player._id,
      status: { $in: ["claimed", "displayed", "auctioned"] },
      original: { $ne: true },
      vintage: { $ne: true },
    }),
  ]);
  if (!artwork) return NextResponse.json({ error: "The archived artwork is unavailable." }, { status: 404 });
  const capacity =
    player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
  if (inventoryCount >= capacity && !selected.has("vintage")) {
    return NextResponse.json({ error: "Your inventory is currently full." }, { status: 409 });
  }

  const unlocked = selected.has("unlocked");
  const itemAttributes = createForgeryAttributes(artwork, unlocked, attributes);
  const mint = selected.has("mint");
  const timestamp = new Date().toISOString();
  const base = {
    _id: randomUUID(),
    artwork_id: artwork._id,
    condition: getGeneratedItemCondition(mint, 0),
    mint,
    mint_value_multiplier: mint ? settings.active.mintValueMultiplier : 1,
    attributes: itemAttributes,
    active_unique_attribute: artwork.unique_attributes?.[0],
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
  const estimatedValues = calculateItemValues(
    getForgeryValueEstimate(base),
    artwork,
    metadata.loot_data,
  );
  const cost = calculateForgeCost(estimatedValues.actual);
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
  try {
    const charge = await database.collection<Player>("players").updateOne(
      { _id: player._id, active: true, "profile.bank_balance": { $gte: cost } },
      { $inc: { "profile.bank_balance": -cost }, $set: { "profile.last_activity": timestamp } },
    );
    if (charge.modifiedCount !== 1) throw new Error("The forging cost could not be charged.");
    charged = true;
    await database.collection<GameItem>("items").insertOne(item);
  } catch (error) {
    if (charged) {
      await database.collection<Player>("players").updateOne({ _id: player._id }, { $inc: { "profile.bank_balance": cost } });
    }
    console.error("Unable to forge archived artwork", error);
    return NextResponse.json({ error: "The forgery could not be completed." }, { status: 500 });
  }
  return NextResponse.json({
    status: "ok",
    cost,
    message: `${artwork.title} was forged for $${cost.toLocaleString()}.`,
  });
}

function createForgeryAttributes(
  artwork: Artwork,
  unlocked: boolean,
  all: ItemAttribute[],
): GameItem["attributes"] {
  const remaining = [...all];
  const result: GameItem["attributes"] = { locked: [], unlocked: [], special: [] };
  for (const id of artwork.special_attributes ?? []) {
    const index = remaining.findIndex((attribute) => attribute._id === id);
    if (index >= 0) result.special.push({ ...remaining.splice(index, 1)[0], value: rollAttributeValue(0.8) });
  }
  const take = (minimum: number) => {
    if (remaining.length === 0) throw new Error("There are not enough active attributes to forge this artwork.");
    const [attribute] = remaining.splice(Math.floor(Math.random() * remaining.length), 1);
    return { ...attribute, value: rollAttributeValue(minimum) };
  };
  if (artwork.rarity !== "common" && !unlocked) result.locked.push(take(0.5));
  const count = artwork.rarity === "common" || !unlocked ? 1 : 2;
  for (let index = 0; index < count; index += 1) result.unlocked.push(take(0));
  return result;
}

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getGameplaySettings } from "@/server/game-settings";
import {
  calculateItemValues,
  getItemAttributes,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import { getRerollCost } from "@/server/item-reroll";
import {
  ensureRaffleState,
  generateRafflePrize,
  RAFFLE_MAX_POTENCY,
  RAFFLE_OWNER_ID,
  RAFFLE_STATE_ID,
  type RaffleState,
} from "@/server/raffle-gameplay";
import { getDatabase } from "@/server/mongodb";

type RaffleRewardRequest = {
  itemId?: unknown;
  artworkId?: unknown;
  condition?: unknown;
  foil?: unknown;
  itemLevel?: unknown;
  potency?: unknown;
  mint?: unknown;
  seasonal?: unknown;
  unlocked?: unknown;
};

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as RaffleRewardRequest;
  if (
    typeof body.itemId !== "string" ||
    typeof body.artworkId !== "string" ||
    typeof body.condition !== "number" ||
    body.condition < 0 ||
    body.condition > 1 ||
    typeof body.itemLevel !== "number" ||
    !Number.isInteger(body.itemLevel) ||
    body.itemLevel < 1 ||
    body.itemLevel > 100 ||
    typeof body.potency !== "number" ||
    !Number.isInteger(body.potency) ||
    body.potency < 1 ||
    body.potency > RAFFLE_MAX_POTENCY ||
    typeof body.foil !== "boolean" ||
    typeof body.unlocked !== "boolean" ||
    typeof body.mint !== "boolean" ||
    typeof body.seasonal !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Provide valid raffle prize properties." },
      { status: 400 },
    );
  }
  const potency = body.potency;

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const state = await ensureRaffleState(database, settings.active);
  if (
    !state.prizes.some((prize) => prize.item_id === body.itemId) ||
    (state.draw_lock &&
      new Date(state.draw_lock.expires_at).getTime() > Date.now())
  ) {
    return NextResponse.json(
      { error: "That raffle prize is unavailable during the drawing." },
      { status: 409 },
    );
  }
  const [item, artwork, metadata, attributes] = await Promise.all([
    database.collection<GameItem>("items").findOne({
      _id: body.itemId,
      owner: RAFFLE_OWNER_ID,
    }),
    database.collection<Artwork>("artworks").findOne({
      _id: body.artworkId,
      active: true,
    }),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    database
      .collection<ItemAttribute>("attributes")
      .find({ active: true })
      .toArray(),
  ]);
  if (!item || !artwork || !metadata || attributes.length === 0) {
    return NextResponse.json(
      { error: "Raffle prize data is unavailable." },
      { status: 404 },
    );
  }

  const regenerateAttributes =
    item.artwork_id !== artwork._id || item.unlocked !== body.unlocked;
  const nextItem: GameItem = {
    ...item,
    artwork_id: artwork._id,
    condition: body.mint ? 1 : body.condition,
    mint: body.mint,
    mint_value_multiplier: body.mint
      ? settings.active.mintValueMultiplier
      : 1,
    foil: body.foil,
    unlocked: body.unlocked,
    seasonal: body.seasonal,
    lottery: body.potency,
    level: body.itemLevel,
    attributes: regenerateAttributes
      ? getItemAttributes(artwork, body.unlocked, attributes)
      : item.attributes,
    active_unique_attribute: artwork.unique_attributes?.[0],
    artwork_overrides:
      item.artwork_id === artwork._id ? item.artwork_overrides : undefined,
    misprint: item.artwork_id === artwork._id ? item.misprint : false,
  };
  nextItem.values = calculateItemValues(
    nextItem,
    { ...artwork, ...nextItem.artwork_overrides },
    metadata.loot_data,
  );
  nextItem.reroll_cost = getRerollCost(
    nextItem,
    artwork.rarity,
    metadata.loot_data,
  );

  const updated = await database.collection<GameItem>("items").replaceOne(
    { _id: item._id, owner: RAFFLE_OWNER_ID },
    nextItem,
  );
  if (updated.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The raffle prize changed before it could be updated." },
      { status: 409 },
    );
  }
  const prizes = state.prizes.map((prize) =>
    prize.item_id === item._id
      ? { ...prize, potency }
      : prize,
  );
  const stateUpdated = await database.collection<RaffleState>("metadata").updateOne(
    {
      _id: RAFFLE_STATE_ID,
      prizes: state.prizes,
      draw_lock: { $exists: false },
    },
    {
      $set: {
        prizes,
        updated_at: new Date().toISOString(),
        updated_by: auth.session.email,
      },
    },
  );
  if (stateUpdated.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The raffle drawing started before the update completed." },
      { status: 409 },
    );
  }
  return NextResponse.json({
    status: "ok",
    message: "Raffle prize properties updated.",
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as { itemId?: unknown };
  if (typeof body.itemId !== "string") {
    return NextResponse.json(
      { error: "Choose a raffle prize to replace." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const state = await ensureRaffleState(database, settings.active);
  if (!state.prizes.some((prize) => prize.item_id === body.itemId)) {
    return NextResponse.json(
      { error: "That raffle prize is no longer available." },
      { status: 409 },
    );
  }
  const reward = await generateRafflePrize(database, settings.active);
  const prizes = state.prizes.map((prize) =>
    prize.item_id === body.itemId
      ? { item_id: reward._id, potency: 1 }
      : prize,
  );
  const replaced = await database.collection<RaffleState>("metadata").updateOne(
    { _id: RAFFLE_STATE_ID, prizes: state.prizes },
    {
      $set: {
        prizes,
        updated_at: new Date().toISOString(),
        updated_by: auth.session.email,
      },
    },
  );
  if (replaced.modifiedCount !== 1) {
    await database.collection<GameItem>("items").deleteOne({ _id: reward._id });
    return NextResponse.json(
      { error: "The raffle prize changed before it could be regenerated." },
      { status: 409 },
    );
  }
  await Promise.all([
    database.collection<GameItem>("items").deleteOne({
      _id: body.itemId,
      owner: RAFFLE_OWNER_ID,
    }),
    database.collection("raffle_entries").deleteMany({ item_id: body.itemId }),
  ]);
  return NextResponse.json({
    status: "ok",
    message: "A new raffle prize was generated.",
  });
}

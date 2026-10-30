import type { AnyBulkWriteOperation, Db } from "mongodb";

import type { ArtworkEffect } from "./artwork-effects.ts";
import {
  getCardRendererSettings,
  getCardStyleProbabilities,
} from "./card-renderer-settings.ts";
import { getGameplaySettings, type GameplayConfig } from "./game-settings.ts";
import {
  ARTWORK_RARITIES,
  getRarityMap,
  PLAYER_LEVEL_MAX,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import { MASTERPIECE_EFFECT_CODES } from "./masterpiece-effects.ts";
import { formatItemDropChance } from "./item-drop-chance-format.ts";

type DropChanceItem = Pick<
  GameItem,
  "foil" | "unlocked" | "mint" | "seasonal" | "card_renderer"
> & { odds?: string };

export type ItemDropChanceContext = {
  rarity: Record<ArtworkRarity, number>;
  artworkCounts: Record<ArtworkRarity, number>;
  foil: number;
  unlocked: number;
  mint: number;
  artStyle: number;
  styles: Readonly<Record<string, number>>;
  guaranteedMintEffectIds: ReadonlySet<string>;
};

export function createItemDropChanceContext(
  config: GameplayConfig,
  lootData: LootData,
  artworks: readonly Pick<Artwork, "rarity" | "active">[],
  activeRendererIds: readonly string[],
  effects: readonly Pick<ArtworkEffect, "_id" | "active" | "code" | "effect_type">[] = [],
): ItemDropChanceContext {
  const artworkCounts = Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [rarity, 0]),
  ) as Record<ArtworkRarity, number>;
  for (const artwork of artworks) {
    if (artwork.active) artworkCounts[artwork.rarity] += 1;
  }
  return {
    rarity: getRarityMap(PLAYER_LEVEL_MAX, lootData, config.rarityWeights),
    artworkCounts,
    foil: config.foilProbability,
    unlocked: config.unlockedProbability,
    mint: config.mintProbability,
    artStyle: config.cardRendererProbability,
    styles: getCardStyleProbabilities(activeRendererIds, config.cardStyleWeights),
    guaranteedMintEffectIds: new Set(
      effects
        .filter((effect) =>
          effect.active &&
          effect.effect_type === "masterpiece" &&
          effect.code === MASTERPIECE_EFFECT_CODES.preservationMint,
        )
        .map((effect) => effect._id),
    ),
  };
}

export async function getItemDropChanceContext(
  database: Db,
): Promise<ItemDropChanceContext> {
  const [settings, metadata, artworks, renderers, effects] = await Promise.all([
    getGameplaySettings(database),
    database.collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    database.collection<Artwork>("artworks")
      .find({ active: true })
      .project<Pick<Artwork, "rarity" | "active">>({ rarity: 1, active: 1 })
      .toArray(),
    getCardRendererSettings(database),
    database.collection<ArtworkEffect>("artwork_effects")
      .find({
        active: true,
        effect_type: "masterpiece",
        code: MASTERPIECE_EFFECT_CODES.preservationMint,
      })
      .toArray(),
  ]);
  if (!metadata) throw new Error("Loot metadata is not configured.");
  return createItemDropChanceContext(
    settings.active,
    metadata.loot_data,
    artworks,
    renderers.activeRendererIds,
    effects,
  );
}

export function calculateItemDropChance(
  item: DropChanceItem,
  artwork: Pick<Artwork, "rarity" | "effect_id">,
  context: ItemDropChanceContext,
): { drop_chance_coefficient: number; odds: string } {
  let coefficient = context.rarity[artwork.rarity];
  if (item.seasonal) {
    const count = context.artworkCounts[artwork.rarity];
    coefficient *= count > 0 ? 1 / count : 0;
  }
  if (item.foil) coefficient *= context.foil;
  if (item.unlocked) coefficient *= context.unlocked;
  const guaranteedMint =
    artwork.rarity === "masterpiece" &&
    artwork.effect_id !== undefined &&
    context.guaranteedMintEffectIds.has(artwork.effect_id);
  if (
    item.card_renderer &&
    item.card_renderer !== "museum" &&
    (item.mint || !guaranteedMint)
  ) {
    coefficient *= context.artStyle;
    if (item.mint) coefficient *= context.styles[item.card_renderer] ?? 0;
  }
  if (item.mint && !guaranteedMint) coefficient *= context.mint;
  return {
    drop_chance_coefficient: coefficient,
    odds: formatItemDropChance(coefficient, item.odds),
  };
}

export async function getItemDropChanceUpdate(
  database: Db,
  item: DropChanceItem,
  artwork: Pick<Artwork, "rarity" | "effect_id">,
) {
  return calculateItemDropChance(item, artwork, await getItemDropChanceContext(database));
}

export async function backfillItemDropChances(database: Db) {
  const context = await getItemDropChanceContext(database);
  const artworks = await database.collection<Artwork>("artworks")
    .find({})
    .project<Pick<Artwork, "_id" | "rarity" | "effect_id">>({
      rarity: 1,
      effect_id: 1,
    })
    .toArray();
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));
  const items = database.collection<GameItem>("items");
  let operations: AnyBulkWriteOperation<GameItem>[] = [];
  let updated = 0;
  for await (const item of items.find({}).project<GameItem>({
    artwork_id: 1,
    foil: 1,
    unlocked: 1,
    mint: 1,
    seasonal: 1,
    card_renderer: 1,
    odds: 1,
    drop_chance_coefficient: 1,
  })) {
    const artwork = artworkById.get(item.artwork_id);
    if (!artwork) {
      throw new Error(`Item ${item._id} references missing artwork ${item.artwork_id}.`);
    }
    const chance = calculateItemDropChance(item, artwork, context);
    if (
      item.drop_chance_coefficient === chance.drop_chance_coefficient &&
      item.odds === chance.odds
    ) continue;
    operations.push({
      updateOne: { filter: { _id: item._id }, update: { $set: chance } },
    });
    if (operations.length === 500) {
      updated += (await items.bulkWrite(operations)).modifiedCount;
      operations = [];
    }
  }
  if (operations.length > 0) {
    updated += (await items.bulkWrite(operations)).modifiedCount;
  }
  return { updated };
}

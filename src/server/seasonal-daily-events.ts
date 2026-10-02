import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import {
  DAILY_EVENT_NOON_HOUR,
  getDailyEventWeekKey,
  getNextDailyEventAt,
  isDailyEventDay,
} from "./daily-event-time.ts";
import {
  ARTWORK_RARITIES,
  generateDailyDrop,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import {
  getFeaturedCrateGenerationMap,
} from "./crate-gameplay.ts";
import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "./game-settings.ts";
import { getCrateItemExpiration } from "./item-expiration.ts";
import type { HydratedGameItem } from "./item-artwork.ts";

export const FRIDAY_DAY_INDEX = 5;
export const THURSDAY_DAY_INDEX = 4;
const FRIDAY_CRATE_ITEM_COUNT = 20;
const FRIDAY_CLAIM_STALE_MS = 10 * 60 * 1000;

type SeasonalRotationState = {
  next_rotation_at: string;
  remaining_by_rarity: Record<ArtworkRarity, string[]>;
  renderer_by_artwork_id: Record<string, string>;
  rotation_key: string;
};

type LootMetadata = {
  _id: "loot-data";
  loot_data: LootData;
  daily_events?: {
    seasonal?: SeasonalRotationState;
  };
};

type FridayClaim = {
  _id: string;
  player_id: string;
  week_key: string;
  claimed_at: string;
  generation_source: string;
  item_ids: string[];
  status: "generating" | "completed";
};

export type SeasonalEventView = {
  nextRotationAt: string;
  items: HydratedGameItem[];
};

export type FridayCrateView = {
  availableToday: boolean;
  claimed: boolean;
  weekKey: string;
  itemCount: number;
};

export async function getSeasonalEventView(
  database: Db,
  now = new Date(),
): Promise<SeasonalEventView> {
  const metadata = await settleSeasonalRotationIfDue(database, now);
  const state = metadata.daily_events?.seasonal;
  if (!state) throw new Error("Seasonal event state is unavailable.");
  const rotationKey = state.rotation_key;
  const artworkIds = ARTWORK_RARITIES.flatMap(
    (rarity) => metadata.loot_data.seasonal_items[rarity] ?? [],
  );
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .project<Artwork>({ market_data: 0 })
    .toArray();
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));
  return {
    nextRotationAt: state.next_rotation_at,
    items: artworkIds.flatMap((artworkId) => {
      const artwork = artworkById.get(artworkId);
      if (!artwork) return [];
      return [
        createSeasonalPreviewItem(
          artwork,
          "museum",
          rotationKey,
        ),
      ];
    }),
  };
}

export async function settleSeasonalRotationIfDue(
  database: Db,
  now = new Date(),
): Promise<LootMetadata> {
  const metadata = await ensureSeasonalEventState(database, now);
  const state = metadata.daily_events?.seasonal;
  if (!state || state.next_rotation_at > now.toISOString()) return metadata;

  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ active: true, rarity: { $in: [...ARTWORK_RARITIES] } })
    .project<Artwork>({ market_data: 0 })
    .toArray();
  const nextSelections = {} as LootData["seasonal_items"];
  const nextRemaining = {} as Record<ArtworkRarity, string[]>;
  for (const rarity of ARTWORK_RARITIES) {
    const candidates = artworks
      .filter((artwork) => artwork.rarity === rarity)
      .map((artwork) => artwork._id);
    const current = metadata.loot_data.seasonal_items[rarity]?.[0] ?? null;
    const selection = selectFairSeasonalArtwork(
      candidates,
      state.remaining_by_rarity[rarity] ?? [],
      current,
    );
    nextSelections[rarity] = selection.selected ? [selection.selected] : [];
    nextRemaining[rarity] = selection.remaining;
  }
  const nextRenderers = Object.fromEntries(
    Object.values(nextSelections)
      .flat()
      .map((artworkId) => [artworkId, "museum"]),
  );
  const nextRotationAt = getNextDailyEventAt(
    THURSDAY_DAY_INDEX,
    DAILY_EVENT_NOON_HOUR,
    new Date(now.getTime() + 1000),
  ).toISOString();
  const nextState: SeasonalRotationState = {
    next_rotation_at: nextRotationAt,
    remaining_by_rarity: nextRemaining,
    renderer_by_artwork_id: nextRenderers,
    rotation_key: now.toISOString(),
  };
  const updated = await database.collection<LootMetadata>("metadata").findOneAndUpdate(
    {
      _id: "loot-data",
      "daily_events.seasonal.next_rotation_at": state.next_rotation_at,
    },
    {
      $set: {
        "loot_data.seasonal_items": nextSelections,
        "daily_events.seasonal": nextState,
      },
    },
    { returnDocument: "after" },
  );
  const latestMetadata =
    updated ??
    (await database
      .collection<LootMetadata>("metadata")
      .findOne({ _id: "loot-data" }));
  if (!latestMetadata) throw new Error("Loot metadata is unavailable.");
  return latestMetadata;
}

export async function rotateSeasonalArtworkNow(
  database: Db,
  now = new Date(),
): Promise<LootMetadata> {
  const metadata = await ensureSeasonalEventState(database, now);
  const state = metadata.daily_events?.seasonal;
  if (!state) throw new Error("Seasonal event state is unavailable.");
  const dueAt = new Date(now.getTime() - 1).toISOString();
  await database.collection<LootMetadata>("metadata").updateOne(
    {
      _id: "loot-data",
      "daily_events.seasonal.next_rotation_at": state.next_rotation_at,
    },
    { $set: { "daily_events.seasonal.next_rotation_at": dueAt } },
  );
  return settleSeasonalRotationIfDue(database, now);
}

export function selectFairSeasonalArtwork(
  candidateIds: readonly string[],
  remainingIds: readonly string[],
  currentId: string | null,
  random: () => number = Math.random,
): { selected: string | null; remaining: string[] } {
  const candidateSet = new Set(candidateIds);
  let pool = remainingIds.filter(
    (id) => candidateSet.has(id) && id !== currentId,
  );
  if (pool.length === 0) {
    pool = shuffle(
      candidateIds.filter(
        (id) => id !== currentId || candidateIds.length === 1,
      ),
      random,
    );
  }
  const [selected = null, ...remaining] = pool;
  return { selected, remaining };
}

export async function getFridayCrateView(
  database: Db,
  playerId: string,
  now = new Date(),
  availableTodayOverride?: boolean,
): Promise<FridayCrateView> {
  const weekKey = getDailyEventWeekKey(now);
  const claimId = getFridayClaimId(playerId, weekKey);
  await reconcileFridayClaim(database, claimId, now);
  const claim = await database
    .collection<FridayClaim>("daily_event_claims")
    .findOne({ _id: claimId });
  return {
    availableToday:
      availableTodayOverride ?? isDailyEventDay(FRIDAY_DAY_INDEX, now),
    claimed: claim?.status === "completed",
    weekKey,
    itemCount: FRIDAY_CRATE_ITEM_COUNT,
  };
}

export async function claimFridayCrate(
  database: Db,
  playerId: string,
  playerLevel: number,
  now = new Date(),
  availableTodayOverride?: boolean,
): Promise<GameItem[]> {
  if (!(availableTodayOverride ?? isDailyEventDay(FRIDAY_DAY_INDEX, now))) {
    throw new Error("The free Ultimate crate is available on Fridays.");
  }
  const weekKey = getDailyEventWeekKey(now);
  const claimId = getFridayClaimId(playerId, weekKey);
  await reconcileFridayClaim(database, claimId, now);
  const source = `daily-event:friday-crate:${weekKey}:${randomUUID()}`;
  const claim: FridayClaim = {
    _id: claimId,
    player_id: playerId,
    week_key: weekKey,
    claimed_at: now.toISOString(),
    generation_source: source,
    item_ids: [],
    status: "generating",
  };
  try {
    await database.collection<FridayClaim>("daily_event_claims").insertOne(claim);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      const existing = await database
        .collection<FridayClaim>("daily_event_claims")
        .findOne({ _id: claimId });
      throw new Error(
        existing?.status === "generating"
          ? "This week's free Ultimate crate is still being prepared."
          : "You already opened this week's free Ultimate crate.",
      );
    }
    throw error;
  }

  const settings = await getGameplaySettings(database);
  try {
    const items = await generateDailyDrop(database, playerId, playerLevel, {
      now,
      itemCount: FRIDAY_CRATE_ITEM_COUNT,
      generationMap: {
        ...getGameplayGenerationMap(settings.active),
        ...getFeaturedCrateGenerationMap("ultimate", settings.active),
      },
      mintValueMultiplier: settings.active.mintValueMultiplier,
      debug: settings.debugEnabled,
      source,
      expiresAt: getCrateItemExpiration(now),
    });
    const completed = await database
      .collection<FridayClaim>("daily_event_claims")
      .updateOne(
        { _id: claimId, status: "generating" },
        {
          $set: {
            status: "completed",
            item_ids: items.map((item) => item._id),
          },
        },
      );
    if (completed.modifiedCount !== 1) {
      throw new Error("The Friday crate claim changed before it completed.");
    }
    return items;
  } catch (error) {
    await Promise.allSettled([
      database.collection<GameItem>("items").deleteMany({ owner: playerId, source }),
      database
        .collection<FridayClaim>("daily_event_claims")
        .deleteOne({ _id: claimId, status: "generating" }),
    ]);
    throw error;
  }
}

async function ensureSeasonalEventState(
  database: Db,
  now: Date,
): Promise<LootMetadata> {
  let metadata = await database
    .collection<LootMetadata>("metadata")
    .findOne({ _id: "loot-data" });
  if (!metadata) throw new Error("Loot metadata is unavailable.");
  if (metadata.daily_events?.seasonal) return metadata;
  const artworkIds = ARTWORK_RARITIES.flatMap(
    (rarity) => metadata!.loot_data.seasonal_items[rarity] ?? [],
  );
  const rendererByArtworkId = Object.fromEntries(
    artworkIds.map((artworkId) => [artworkId, "museum"]),
  );
  const state: SeasonalRotationState = {
    next_rotation_at: getNextDailyEventAt(
      THURSDAY_DAY_INDEX,
      DAILY_EVENT_NOON_HOUR,
      now,
    ).toISOString(),
    remaining_by_rarity: ARTWORK_RARITIES.reduce(
      (result, rarity) => {
        result[rarity] = [];
        return result;
      },
      {} as Record<ArtworkRarity, string[]>,
    ),
    renderer_by_artwork_id: rendererByArtworkId,
    rotation_key: now.toISOString(),
  };
  metadata =
    (await database.collection<LootMetadata>("metadata").findOneAndUpdate(
      { _id: "loot-data", "daily_events.seasonal": { $exists: false } },
      { $set: { "daily_events.seasonal": state } },
      { returnDocument: "after" },
    )) ?? metadata;
  return metadata;
}

function createSeasonalPreviewItem(
  artwork: Artwork,
  cardRenderer: string,
  rotationKey: string,
): HydratedGameItem {
  const timestamp = new Date(0).toISOString();
  return {
    _id: `seasonal:${rotationKey}:${artwork._id}`,
    artwork_id: artwork._id,
    artwork,
    condition: 1,
    mint: false,
    mint_value_multiplier: 1,
    attributes: { locked: [], unlocked: [], special: [] },
    card_renderer: cardRenderer,
    owner: "system:seasonal-event",
    transaction_history: [],
    status: "claimed",
    source: "seasonal event preview",
    date_created: timestamp,
    date_received: timestamp,
    level: 1,
    roll_count: 0,
    reroll_spent: 0,
    foil: false,
    unlocked: false,
    seasonal: true,
    lottery: 0,
    original: false,
    patreon: false,
    vintage: false,
    authenticity: {
      forgery: false,
      forgery_quality: 0,
      liable: "system:seasonal-event",
      liability_pending: false,
      identified: true,
      fee: 0,
      original_owner: "system:seasonal-event",
    },
    tags: [],
    misprint: false,
    permanent: true,
    repairing: false,
    debug: false,
    odds: "Seasonal event preview",
    values: {
      sell: 0,
      purchase: 0,
      actual: 0,
      auction_min: 0,
      collector: 0,
      dealer: 0,
    },
    reroll_cost: 0,
  };
}

function getFridayClaimId(playerId: string, weekKey: string): string {
  return `friday-crate:${weekKey}:${playerId}`;
}

async function reconcileFridayClaim(
  database: Db,
  claimId: string,
  now: Date,
): Promise<void> {
  const claims = database.collection<FridayClaim>("daily_event_claims");
  const claim = await claims.findOne({ _id: claimId, status: "generating" });
  if (
    !claim ||
    new Date(claim.claimed_at).getTime() >
      now.getTime() - FRIDAY_CLAIM_STALE_MS
  ) {
    return;
  }
  const items = await database
    .collection<GameItem>("items")
    .find({
      owner: claim.player_id,
      source: claim.generation_source,
    })
    .project<Pick<GameItem, "_id">>({ _id: 1 })
    .toArray();
  if (items.length === FRIDAY_CRATE_ITEM_COUNT) {
    await claims.updateOne(
      { _id: claim._id, status: "generating" },
      {
        $set: {
          status: "completed",
          item_ids: items.map((item) => item._id),
        },
      },
    );
    return;
  }
  await Promise.all([
    database.collection<GameItem>("items").deleteMany({
      owner: claim.player_id,
      source: claim.generation_source,
    }),
    claims.deleteOne({ _id: claim._id, status: "generating" }),
  ]);
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

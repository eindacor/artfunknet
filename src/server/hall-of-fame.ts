import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import type {
  Artwork,
  ArtworkRarity,
  GameItem,
} from "./gameplay.ts";
import type { HydratedGameItem } from "./item-artwork.ts";
import { createPlayerNotification } from "./player-notifications.ts";

export const HALL_OF_FAME_OWNER_ID = "artfunkel inc.";

export type HallOfFameItemSnapshot = GameItem & {
  artwork?: Artwork;
  artwork_title?: string;
  artist_name?: string;
};

export type HallOfFameRecord = {
  _id: string;
  item_id: string;
  item_snapshot: HallOfFameItemSnapshot;
  title: string;
  description: string;
  created_at: string;
  qualifier_id?: string;
  player_id?: string;
  player_screen_name?: string;
};

export type HallOfFameSubmission = {
  _id: string;
  item_id: string;
  item_snapshot: HallOfFameItemSnapshot;
  title: string;
  description: string;
  submitted_at: string;
  qualifier_id: string;
  player_id: string;
  player_screen_name: string;
};

export type HallOfFameDisplayRecord = HallOfFameRecord & {
  item: HydratedGameItem;
  item_is_live: boolean;
};

export type QualifierQuery = {
  rarity?: ArtworkRarity;
  mint?: boolean;
  foil?: boolean;
  unlocked?: boolean;
  seasonal?: boolean;
  original?: boolean;
  lottery?: number;
  minActualValue?: number;
};

export type HallOfFameQualifier = {
  id: string;
  title: string;
  description: string;
  query: QualifierQuery;
};

export const DEFAULT_HOF_QUALIFIERS: HallOfFameQualifier[] = [
  // Masterpiece Milestones
  {
    id: "first-mint-masterpiece",
    title: "First Mint Masterpiece",
    description: "The first mint condition masterpiece found in the game.",
    query: { rarity: "masterpiece", mint: true },
  },
  {
    id: "first-foil-masterpiece",
    title: "First Foil Masterpiece",
    description: "The first foil masterpiece found in the game.",
    query: { rarity: "masterpiece", foil: true },
  },
  {
    id: "first-unlocked-masterpiece",
    title: "First Unlocked Masterpiece",
    description: "The first unlocked masterpiece found in the game.",
    query: { rarity: "masterpiece", unlocked: true },
  },
  {
    id: "first-seasonal-masterpiece",
    title: "First Seasonal Masterpiece",
    description: "The first seasonal masterpiece found in the game.",
    query: { rarity: "masterpiece", seasonal: true },
  },
  {
    id: "first-mint-foil-masterpiece",
    title: "First Mint Foil Masterpiece",
    description: "The first mint condition foil masterpiece in the game.",
    query: { rarity: "masterpiece", mint: true, foil: true },
  },
  {
    id: "first-mint-unlocked-masterpiece",
    title: "First Mint Unlocked Masterpiece",
    description: "The first mint condition unlocked masterpiece in the game.",
    query: { rarity: "masterpiece", mint: true, unlocked: true },
  },
  {
    id: "first-foil-unlocked-masterpiece",
    title: "First Foil Unlocked Masterpiece",
    description: "The first foil unlocked masterpiece in the game.",
    query: { rarity: "masterpiece", foil: true, unlocked: true },
  },
  {
    id: "first-mint-foil-unlocked-masterpiece",
    title: "First Ultimate Masterpiece",
    description: "The first mint, foil, and unlocked masterpiece in the game.",
    query: { rarity: "masterpiece", mint: true, foil: true, unlocked: true },
  },

  // General Attribute Milestones
  {
    id: "first-foil-unlocked-legendary",
    title: "First Foil Unlocked Legendary",
    description: "The first legendary item to be foil and unlocked.",
    query: { rarity: "legendary", foil: true, unlocked: true },
  },
  {
    id: "first-unlocked-foil",
    title: "First Unlocked Foil",
    description: "The first item of any rarity to be foil and unlocked.",
    query: { foil: true, unlocked: true },
  },
  {
    id: "first-seasonal-item",
    title: "First Seasonal Artwork",
    description: "The first seasonal artwork claimed in the game.",
    query: { seasonal: true },
  },
  {
    id: "first-original-artwork",
    title: "First Original Masterpiece",
    description: "The first original masterpiece artwork acquired by a player.",
    query: { original: true },
  },

  // Value Ceilings
  {
    id: "first-10m-valuation",
    title: "First 10M Valuation",
    description: "The first item claimed with an actual value exceeding $10,000,000.",
    query: { minActualValue: 10_000_000 },
  },
  {
    id: "first-100m-valuation",
    title: "First 100M Valuation",
    description: "The first item claimed with an actual value exceeding $100,000,000.",
    query: { minActualValue: 100_000_000 },
  },
  {
    id: "first-1b-valuation",
    title: "First Billion Dollar Artwork",
    description: "The first item claimed with an actual value exceeding $1,000,000,000.",
    query: { minActualValue: 1_000_000_000 },
  },

  // Lottery Tier Milestones (1 through 10)
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `first-lottery-tier-${index + 1}`,
    title: `First Tier ${index + 1} Lottery Winner`,
    description: `The first item claimed from Tier ${index + 1} of the weekly lottery.`,
    query: { lottery: index + 1 },
  })),
];

const registeredQualifiers: Map<string, HallOfFameQualifier> = new Map();

for (const qualifier of DEFAULT_HOF_QUALIFIERS) {
  registeredQualifiers.set(qualifier.id, qualifier);
}

export function registerHallOfFameQualifier(
  title: string,
  description: string,
  query: QualifierQuery,
): HallOfFameQualifier {
  const id = `qualifier-${randomUUID()}`;
  const qualifier: HallOfFameQualifier = { id, title, description, query };
  registeredQualifiers.set(id, qualifier);
  return qualifier;
}

export function itemMatchesQualifierQuery(
  item: GameItem,
  artworkRarity?: ArtworkRarity,
  query?: QualifierQuery,
): boolean {
  if (!query) return false;
  if (query.rarity && artworkRarity !== query.rarity) return false;
  if (query.mint !== undefined && item.mint !== query.mint) return false;
  if (query.foil !== undefined && item.foil !== query.foil) return false;
  if (query.unlocked !== undefined && item.unlocked !== query.unlocked) return false;
  if (query.seasonal !== undefined && item.seasonal !== query.seasonal) return false;
  if (query.original !== undefined && item.original !== query.original) return false;
  if (query.lottery !== undefined && item.lottery !== query.lottery) return false;
  if (
    query.minActualValue !== undefined &&
    (item.values?.actual ?? 0) < query.minActualValue
  ) {
    return false;
  }
  return true;
}

export function getMatchingHallOfFameQualifiers(
  item: GameItem,
  artworkRarity?: ArtworkRarity,
): HallOfFameQualifier[] {
  return [...registeredQualifiers.values()].filter((qualifier) =>
    itemMatchesQualifierQuery(item, artworkRarity, qualifier.query),
  );
}

export function getHallOfFameQualifier(
  qualifierId: string,
): HallOfFameQualifier | undefined {
  return registeredQualifiers.get(qualifierId);
}

export async function checkItemForHallOfFameStatus(
  database: Db,
  item: GameItem,
  player: { _id: string; test_account?: boolean; screen_name: string },
): Promise<HallOfFameSubmission[]> {
  if (
    !item ||
    !["claimed", "displayed", "auctioned", "collector_pending"].includes(
      item.status,
    )
  ) {
    return [];
  }

  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: item.artwork_id });
  if (!artwork) return [];

  const [existingRecords, pendingSubmissions] = await Promise.all([
    database
      .collection<HallOfFameRecord>("hall_of_fame")
      .find({
        $or: [
          { qualifier_id: { $exists: true } },
          { item_id: item._id },
        ],
      })
      .project<{ item_id: string; qualifier_id?: string }>({
        item_id: 1,
        qualifier_id: 1,
      })
      .toArray(),
    database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .find()
      .project<{ item_id: string; qualifier_id: string }>({
        item_id: 1,
        qualifier_id: 1,
      })
      .toArray(),
  ]);
  const unavailableQualifierIds = new Set([
    ...existingRecords.map((record) => record.qualifier_id).filter(Boolean),
    ...pendingSubmissions.map((submission) => submission.qualifier_id),
  ]);

  const submissions: HallOfFameSubmission[] = [];
  for (const qualifier of getMatchingHallOfFameQualifiers(
    item,
    artwork.rarity,
  )) {
    if (unavailableQualifierIds.has(qualifier.id)) continue;

    const snapshotArtwork = { ...artwork, ...item.artwork_overrides };
    const submission: HallOfFameSubmission = {
      _id: qualifier.id,
      item_id: item._id,
      item_snapshot: {
        ...item,
        artwork: snapshotArtwork,
        artwork_title: snapshotArtwork.title,
        artist_name: snapshotArtwork.artist,
      },
      title: qualifier.title,
      description: qualifier.description,
      submitted_at: new Date().toISOString(),
      qualifier_id: qualifier.id,
      player_id: player._id,
      player_screen_name: player.screen_name,
    };

    const inserted = await database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .updateOne(
        { _id: submission._id },
        { $setOnInsert: submission },
        { upsert: true },
      );
    if (inserted.upsertedCount === 1) {
      submissions.push(submission);
    }
  }

  if (submissions.length > 0) {
    const qualifierSummary =
      submissions.length === 1
        ? `"${submissions[0].title}"`
        : `${submissions.length} Hall of Fame achievements`;
    await createPlayerNotification(database, player._id, {
      kind: "success",
      message: `Your item "${artwork.title}" qualified for ${qualifierSummary} and was submitted for admin review.`,
    });
  }

  return submissions;
}

export async function getHallOfFameDisplayRecords(
  database: Db,
): Promise<HallOfFameDisplayRecord[]> {
  const records = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find()
    .sort({ created_at: -1 })
    .toArray();
  if (records.length === 0) return [];

  const liveItems = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: records.map((record) => record.item_id) } })
    .toArray();
  const liveItemById = new Map(liveItems.map((item) => [item._id, item]));
  const artworkIds = [
    ...new Set(
      records.map(
        (record) =>
          liveItemById.get(record.item_id)?.artwork_id ??
          record.item_snapshot.artwork_id,
      ),
    ),
  ];
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .toArray();
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));

  return records.flatMap((record) => {
    const liveItem = liveItemById.get(record.item_id);
    const sourceItem = liveItem ?? record.item_snapshot;
    const artwork =
      (liveItem ? undefined : record.item_snapshot.artwork) ??
      artworkById.get(sourceItem.artwork_id);
    if (!artwork) return [];
    return [
      {
        ...record,
        item: {
          ...sourceItem,
          artwork: { ...artwork, ...sourceItem.artwork_overrides },
        },
        item_is_live: Boolean(liveItem),
      },
    ];
  });
}

export async function transferIfHallOfFameItem(
  database: Db,
  item: Pick<GameItem, "_id" | "owner" | "status">,
): Promise<boolean> {
  const transferredIds = await transferHallOfFameItems(database, [item]);
  return transferredIds.has(item._id);
}

export async function transferHallOfFameItems(
  database: Db,
  items: Pick<GameItem, "_id" | "owner" | "status">[],
): Promise<Set<string>> {
  if (items.length === 0) return new Set();

  const records = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find({ item_id: { $in: items.map((item) => item._id) } })
    .project<Pick<HallOfFameRecord, "item_id" | "item_snapshot">>({
      item_id: 1,
      item_snapshot: 1,
    })
    .toArray();
  const hallOfFameItemIds = new Set(records.map((record) => record.item_id));
  if (hallOfFameItemIds.size === 0) return hallOfFameItemIds;
  const currentItems = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: [...hallOfFameItemIds] } })
    .toArray();
  const currentItemById = new Map(
    currentItems.map((currentItem) => [currentItem._id, currentItem]),
  );
  const artworkIds = [
    ...new Set(currentItems.map((currentItem) => currentItem.artwork_id)),
  ];
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .toArray();
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));
  const recordByItemId = new Map(
    records.map((record) => [record.item_id, record]),
  );

  const transferredAt = new Date().toISOString();
  for (const item of items) {
    if (!hallOfFameItemIds.has(item._id)) continue;
    const currentItem = currentItemById.get(item._id);
    if (
      !currentItem ||
      currentItem.owner !== item.owner ||
      currentItem.status !== item.status
    ) {
      throw new Error(
        `Hall of Fame item ${item._id} changed before it could be preserved.`,
      );
    }
    const record = recordByItemId.get(item._id);
    const artwork =
      artworkById.get(currentItem.artwork_id) ?? record?.item_snapshot.artwork;
    const snapshotArtwork = artwork
      ? { ...artwork, ...currentItem.artwork_overrides }
      : undefined;
    const snapshotSource = { ...currentItem };
    delete snapshotSource.vintage_operation_token;
    const itemSnapshot: HallOfFameItemSnapshot = {
      ...snapshotSource,
      ...(snapshotArtwork
        ? {
            artwork: snapshotArtwork,
            artwork_title: snapshotArtwork.title,
            artist_name: snapshotArtwork.artist,
          }
        : {
            artwork_title: record?.item_snapshot.artwork_title,
            artist_name: record?.item_snapshot.artist_name,
          }),
    };
    await database
      .collection<HallOfFameRecord>("hall_of_fame")
      .updateMany(
        { item_id: item._id },
        { $set: { item_snapshot: itemSnapshot } },
      );
    const result = await database.collection<GameItem>("items").updateOne(
      {
        _id: currentItem._id,
        owner: currentItem.owner,
        status: currentItem.status,
      },
      {
        $set: {
          owner: HALL_OF_FAME_OWNER_ID,
          status: "claimed",
        },
        $unset: {
          display_slot: "",
          time_displayed: "",
          expires_at: "",
          bulk_sale_operation: "",
          bulk_donation_operation: "",
        },
        $push: {
          transaction_history: {
            type: "transfer",
            from_owner: currentItem.owner,
            to_owner: HALL_OF_FAME_OWNER_ID,
            occurred_at: transferredAt,
            source: "hall of fame",
          },
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new Error(
        `Hall of Fame item ${item._id} changed before it could be preserved.`,
      );
    }
  }

  return hallOfFameItemIds;
}

export async function restoreTransferredHallOfFameItem(
  database: Db,
  item: GameItem,
): Promise<void> {
  const restored = await database.collection<GameItem>("items").replaceOne(
    { _id: item._id, owner: HALL_OF_FAME_OWNER_ID },
    item,
  );
  if (restored.modifiedCount !== 1) {
    throw new Error("The Hall of Fame item could not be restored.");
  }
}

export async function notifyHallOfFameInduction(
  database: Db,
  record: HallOfFameRecord,
): Promise<void> {
  if (!record.player_id) return;
  const artworkTitle =
    record.item_snapshot.artwork?.title ??
    record.item_snapshot.artwork_title ??
    "Artwork";
  await createPlayerNotification(database, record.player_id, {
    kind: "success",
    message: `Your item "${artworkTitle}" has been inducted into the Hall of Fame as "${record.title}".`,
    action: { href: "/play?section=history#hall-of-fame", label: "View Hall of Fame" },
  });
}

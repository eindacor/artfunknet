import type { AnyBulkWriteOperation, Db } from "mongodb";

import type { Auction } from "./auction-gameplay.ts";
import { getGameplaySettings } from "./game-settings.ts";
import type { Artwork, GameItem } from "./gameplay.ts";
import { getUnexpiredItemFilter } from "./item-expiration.ts";
import {
  isOfferRevealed,
  type OfferRevealThresholds,
} from "./offer-reveal.ts";

async function getRevealArtworkRarities(database: Db, artworkIds?: string[]) {
  if (artworkIds?.length === 0) return new Map<string, Artwork["rarity"]>();
  const artworks = await database.collection<Artwork>("artworks").find(
    { rarity: { $in: ["legendary", "masterpiece"] }, ...(artworkIds ? { _id: { $in: artworkIds } } : {}) },
    { projection: { _id: 1, rarity: 1 } },
  ).toArray();
  return new Map(artworks.map((artwork) => [artwork._id, artwork.rarity]));
}

export async function ensureItemRevealStates<T extends GameItem & { artwork?: { rarity: string } }>(
  database: Db,
  records: T[],
  thresholds: OfferRevealThresholds,
): Promise<T[]> {
  const artworkRarities = await getRevealArtworkRarities(
    database,
    [...new Set(records.filter((item) => !item.artwork && item.revealed !== true)
      .map((item) => item.artwork_id).filter(Boolean))],
  );
  const operations: AnyBulkWriteOperation<GameItem>[] = [];
  const result = records.map((item) => {
    const rarity = artworkRarities.get(item.artwork_id);
    const revealed = isOfferRevealed(
      rarity ? { ...item, artwork: { rarity } } : item,
      thresholds,
    );
    if (item.revealed === revealed) return item;
    operations.push({
      updateOne: {
        filter: {
          _id: item._id,
          owner: item.owner,
          status: item.status,
          revealed: revealed ? { $ne: true } : { $exists: false },
        },
        update: { $set: { revealed } },
      },
    });
    return { ...item, revealed };
  });
  for (let offset = 0; offset < operations.length; offset += 500) {
    await database.collection<GameItem>("items").bulkWrite(operations.slice(offset, offset + 500));
  }
  return result;
}

export async function revealPlayerItem(
  database: Db,
  playerId: string,
  itemId: string,
  now = new Date(),
): Promise<boolean> {
  const items = database.collection<GameItem>("items");
  const item = await items.findOne({ _id: itemId, ...getUnexpiredItemFilter(now) });
  if (!item) return false;

  if (item.owner !== playerId) {
    if (item.status !== "auctioned") return false;
    const player = await database.collection<{
      _id: string;
      profile?: { dismissed_private_auction_ids?: string[] };
    }>("players").findOne({ _id: playerId });
    const auction = await database.collection<Auction>("auctions").findOne({
      item_id: itemId,
      viewer: playerId,
      expiration: { $gt: now.toISOString() },
      settlement_status: { $ne: "settling" },
      _id: { $nin: player?.profile?.dismissed_private_auction_ids ?? [] },
    });
    if (!auction) return false;
  }

  const result = await items.updateOne(
    {
      _id: item._id,
      owner: item.owner,
      status: item.status,
      ...getUnexpiredItemFilter(new Date(Math.max(Date.now(), now.getTime()))),
    },
    { $set: { revealed: true } },
  );
  return result.matchedCount === 1;
}

export async function backfillItemRevealStates(database: Db) {
  const settings = await getGameplaySettings(database);
  const artworkRarities = await getRevealArtworkRarities(database);
  const items = database.collection<GameItem>("items");
  let operations: AnyBulkWriteOperation<GameItem>[] = [];
  let updated = 0;
  for await (const item of items.find({ revealed: { $exists: false } })) {
    const rarity = artworkRarities.get(item.artwork_id);
    operations.push({
      updateOne: {
        filter: { _id: item._id, revealed: { $exists: false } },
        update: {
          $set: {
            revealed: isOfferRevealed(
              rarity ? { ...item, artwork: { rarity } } : item,
              settings.active.offerRevealThresholds,
            ),
          },
        },
      },
    });
    if (operations.length === 500) {
      updated += (await items.bulkWrite(operations)).modifiedCount;
      operations = [];
    }
  }
  if (operations.length) updated += (await items.bulkWrite(operations)).modifiedCount;
  return { updated };
}

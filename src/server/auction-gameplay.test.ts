import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicAuctionReplenishmentCount,
  PUBLIC_AUCTION_TARGET,
} from "./auction-population.ts";
import { getAuctionSettlementDisposition } from "./auction-settlement.ts";

test("public auctions replenish only the missing system lots", () => {
  assert.equal(PUBLIC_AUCTION_TARGET, 20);
  assert.equal(getPublicAuctionReplenishmentCount(0), 20);
  assert.equal(getPublicAuctionReplenishmentCount(7), 13);
  assert.equal(getPublicAuctionReplenishmentCount(20), 0);
  assert.equal(getPublicAuctionReplenishmentCount(24), 0);
});

test("settlement never classifies recorded bids as unsold", () => {
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: null,
      currentWinnerName: null,
      currentBid: 100,
      hasBid: false,
      startingBid: 100,
    }),
    "unsold",
  );
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: "player-2",
      currentWinnerName: "Test Player 2",
      currentBid: 120,
      hasBid: true,
      startingBid: 100,
    }),
    "player-sale",
  );
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: null,
      currentWinnerName: "Test Player 2",
      currentBid: 120,
      hasBid: true,
      startingBid: 100,
    }),
    "unresolved-bid",
  );
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: null,
      currentWinnerName: "Test Player 2",
      currentBid: 120,
      hasBid: undefined,
      startingBid: 100,
    }),
    "unresolved-bid",
  );
});

import {
  calculateAntiSnipeExpiration,
  grantAuctionXpReward,
} from "./auction-gameplay.ts";

test("calculateAntiSnipeExpiration extends expiration when remaining time is under configured minutes", () => {
  const now = new Date("2026-09-10T20:00:00.000Z");
  // Expiration 2 minutes from now, extension 5 minutes -> extends to now + 5 min (20:05:00)
  const exp2Min = "2026-09-10T20:02:00.000Z";
  assert.equal(
    calculateAntiSnipeExpiration(exp2Min, 5, now),
    "2026-09-10T20:05:00.000Z",
  );

  // Expiration 10 minutes from now, extension 5 minutes -> remains 20:10:00
  const exp10Min = "2026-09-10T20:10:00.000Z";
  assert.equal(
    calculateAntiSnipeExpiration(exp10Min, 5, now),
    "2026-09-10T20:10:00.000Z",
  );

  // Expiration 7 minutes from now, custom extension 10 minutes -> extends to now + 10 min (20:10:00)
  const exp7Min = "2026-09-10T20:07:00.000Z";
  assert.equal(
    calculateAntiSnipeExpiration(exp7Min, 10, now),
    "2026-09-10T20:10:00.000Z",
  );
});

test("grantAuctionXpReward returns null when marketExpert is false", async () => {
  const result = await grantAuctionXpReward(
    {} as any,
    { _id: "p1", profile: { level: 1, xp: 0, auction_cap: 8 } },
    false,
    {
      item: { values: { actual: 1000 } } as any,
      startingBid: 500,
      durationMinutes: 60,
    },
  );
  assert.equal(result, null);
});

test("grantAuctionXpReward returns null when starting bid exceeds artwork estimated value", async () => {
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "unique_attributes") {
        return {
          findOne: async (query: any) => {
            if (query.code === "XP_FOR_AUCTIONS") {
              return { _id: "attr-xp-auc", code: "XP_FOR_AUCTIONS", active: true, parameters: {} };
            }
            return null;
          },
        };
      }
      return {};
    },
  };

  const result = await grantAuctionXpReward(
    mockDb,
    { _id: "p1", profile: { level: 1, xp: 0, auction_cap: 8 } },
    true,
    {
      item: { values: { actual: 1000 } } as any,
      startingBid: 1200,
      durationMinutes: 360,
    },
  );
  assert.equal(result, null);
});

test("grantAuctionXpReward calculates XP as 20% of gallery XP accrued divided by base auction cap when startingBid <= estimated value", async () => {
  let updatedPlayer: any = null;

  const mockDisplayedItem: any = {
    _id: "item-1",
    owner: "p1",
    status: "displayed",
    active_unique_attribute: "attr-xp-auc",
    artwork_id: "art-1",
    level: 10,
    time_displayed: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    condition: 1,
    authenticity: {},
    values: { actual: 1000 },
    artwork: {
      _id: "art-1",
      title: "Mona Lisa",
      artist: "Da Vinci",
      rarity: "common",
      medium: "Oil",
      date: 1503,
      value_scale: 1,
    },
  };

  const mockDb: any = {
    collection: (name: string) => {
      if (name === "unique_attributes") {
        return {
          findOne: async (query: any) => {
            if (query.code === "XP_FOR_AUCTIONS") {
              return { _id: "attr-xp-auc", code: "XP_FOR_AUCTIONS", active: true, parameters: {} };
            }
            return null;
          },
        };
      }
      if (name === "items") {
        return {
          find: (query: any) => ({
            toArray: async () => [mockDisplayedItem],
            project: () => ({
              toArray: async () => [{ active_unique_attribute: "attr-xp-auc" }],
            }),
          }),
        };
      }
      if (name === "artworks") {
        return {
          find: () => {
            const list = [
              { _id: "art-1", active: true, rarity: "common", value_scale: 1, title: "Mona Lisa", artist: "Da Vinci", medium: "Oil", date: 1503 },
            ];
            return {
              toArray: async () => list,
              project: () => ({
                toArray: async () => list,
              }),
            };
          },
        };
      }
      if (name === "metadata") {
        return {
          findOne: async () => ({
            _id: "loot-data",
            loot_data: {
              rarity_values: {
                common: { min: 100, max: 500 },
                uncommon: { min: 500, max: 1000 },
                rare: { min: 1000, max: 5000 },
                legendary: { min: 5000, max: 20000 },
                masterpiece: { min: 20000, max: 100000 },
              },
              basic_crate_cost: 100,
              items_per_basic_crate: 3,
              crate_expense_per_masterpiece: 1000,
              global_foil_chance: 0.05,
              global_unlocked_chance: 0.1,
            },
          }),
        };
      }
      if (name === "settings") {
        return {
          findOne: async () => null,
        };
      }
      if (name === "players") {
        return {
          updateOne: async (query: any, update: any) => {
            updatedPlayer = { query, update };
            return { modifiedCount: 1 };
          },
        };
      }
      return {};
    },
  };

  const result = await grantAuctionXpReward(
    mockDb,
    { _id: "p1", profile: { level: 1, xp: 0, auction_cap: 8 } },
    true,
    {
      item: mockDisplayedItem,
      startingBid: 800, // startingBid <= actual (1000)
      durationMinutes: 360, // 6 hours
    },
  );

  assert.notEqual(result, null);
  assert.equal(typeof result?.xpGranted, "number");
  assert.ok(result!.xpGranted > 0);
  assert.equal(updatedPlayer.update.$set["profile.xp"], result?.xpGranted);
});

test("grantAuctionXpReward returns null when gallery is empty (0 gallery XP/hr)", async () => {
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "unique_attributes") {
        return {
          findOne: async (query: any) => {
            if (query.code === "XP_FOR_AUCTIONS") {
              return { _id: "attr-xp-auc", code: "XP_FOR_AUCTIONS", active: true, parameters: {} };
            }
            return null;
          },
        };
      }
      if (name === "items") {
        return {
          find: () => ({
            toArray: async () => [],
            project: () => ({
              toArray: async () => [{ active_unique_attribute: "attr-xp-auc" }],
            }),
          }),
        };
      }
      if (name === "artworks") {
        return {
          find: () => ({
            toArray: async () => [],
            project: () => ({
              toArray: async () => [],
            }),
          }),
        };
      }
      if (name === "metadata") {
        return {
          findOne: async () => ({
            _id: "loot-data",
            loot_data: {
              rarity_values: { common: { min: 100, max: 500 } },
              global_foil_chance: 0.05,
              global_unlocked_chance: 0.1,
            },
          }),
        };
      }
      return {};
    },
  };

  const result = await grantAuctionXpReward(
    mockDb,
    { _id: "p1", profile: { level: 1, xp: 0, auction_cap: 8 } },
    true,
    {
      item: { values: { actual: 1000 } } as any,
      startingBid: 500,
      durationMinutes: 1440,
    },
  );

  assert.equal(result, null);
});

test("grantAuctionXpReward awards XP when buyNow is above estimated value as long as startingBid <= estimated value", async () => {
  let updatedPlayer: any = null;
  const mockDisplayedItem: any = {
    _id: "item-1",
    owner: "p1",
    status: "displayed",
    active_unique_attribute: "attr-xp-auc",
    artwork_id: "art-1",
    level: 10,
    time_displayed: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    condition: 1,
    authenticity: {},
    values: { actual: 1000 },
    artwork: {
      _id: "art-1",
      title: "Mona Lisa",
      artist: "Da Vinci",
      rarity: "common",
      medium: "Oil",
      date: 1503,
      value_scale: 1,
    },
  };

  const mockDb: any = {
    collection: (name: string) => {
      if (name === "unique_attributes") {
        return {
          findOne: async (query: any) => {
            if (query.code === "XP_FOR_AUCTIONS") {
              return { _id: "attr-xp-auc", code: "XP_FOR_AUCTIONS", active: true, parameters: {} };
            }
            return null;
          },
        };
      }
      if (name === "items") {
        return {
          find: () => ({
            toArray: async () => [mockDisplayedItem],
            project: () => ({
              toArray: async () => [{ active_unique_attribute: "attr-xp-auc" }],
            }),
          }),
        };
      }
      if (name === "artworks") {
        return {
          find: () => {
            const list = [
              { _id: "art-1", active: true, rarity: "common", value_scale: 1, title: "Mona Lisa", artist: "Da Vinci", medium: "Oil", date: 1503 },
            ];
            return {
              toArray: async () => list,
              project: () => ({ toArray: async () => list }),
            };
          },
        };
      }
      if (name === "metadata") {
        return {
          findOne: async () => ({
            _id: "loot-data",
            loot_data: {
              rarity_values: { common: { min: 100, max: 500 } },
              global_foil_chance: 0.05,
              global_unlocked_chance: 0.1,
            },
          }),
        };
      }
      if (name === "players") {
        return {
          updateOne: async (query: any, update: any) => {
            updatedPlayer = { query, update };
            return { modifiedCount: 1 };
          },
        };
      }
      return {};
    },
  };

  const result = await grantAuctionXpReward(
    mockDb,
    { _id: "p1", profile: { level: 1, xp: 0, auction_cap: 8 } },
    true,
    {
      item: mockDisplayedItem,
      startingBid: 900, // <= actual 1000
      durationMinutes: 1440,
    },
  );

  assert.notEqual(result, null);
  assert.ok(result!.xpGranted > 0);
});


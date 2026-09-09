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

import { grantAuctionXpReward } from "./auction-gameplay.ts";

test("grantAuctionXpReward returns null when marketExpert is false", async () => {
  const result = await grantAuctionXpReward(
    {} as any,
    { _id: "p1", profile: { level: 1, xp: 0 } },
    false,
  );
  assert.equal(result, null);
});

test("grantAuctionXpReward awards XP when marketExpert is true and XP_FOR_AUCTIONS is displayed", async () => {
  let updatedPlayer: any = null;
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "items") {
        return {
          find: () => ({
            project: () => ({
              toArray: async () => [{ active_unique_attribute: "attr-xp-auc" }],
            }),
          }),
        };
      }
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
    { _id: "p1", profile: { level: 1, xp: 0 } },
    true,
  );

  assert.notEqual(result, null);
  assert.equal(result?.xpGranted, 58);
  assert.equal(result?.bonusMoneyGranted, 0);
  assert.equal(updatedPlayer.update.$set["profile.xp"], 58);
});

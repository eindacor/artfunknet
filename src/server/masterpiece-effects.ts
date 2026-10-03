import type { Db } from "mongodb";

import {
  getArtworkEffectNumberParameter,
  getDisplayedArtworkEffects,
  type ArtworkEffect,
} from "./artwork-effects.ts";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import type { GameItem } from "./gameplay.ts";
import { createPlayerNotification } from "./player-notifications.ts";

export const MASTERPIECE_EFFECT_CODES = {
  forgeryCopy: "MP_FORGERY_COPY",
  historianArchive: "MP_HISTORIAN_ARCHIVE",
  preservationMint: "MP_PRESERVATION_MINT",
  perfectReroll: "MP_FREE_PERFECT_REROLL",
  forgeryReturn: "MP_FORGERY_RETURN",
  bankInterest: "MP_BANK_INTEREST",
  escrowInterest: "MP_ESCROW_INTEREST",
  collectorBuyout: "MP_COLLECTOR_BUYOUT",
  donorFoil: "MP_DONOR_FOIL",
  dealerUnlocked: "MP_DEALER_UNLOCKED",
  uncommonGalleryXp: "MP_UNCOMMON_GALLERY_XP",
  transferableAuction: "MP_TRANSFERABLE_AUCTION",
  commonSubstitution: "MP_COMMON_ATTRIBUTE_SUBSTITUTION",
  rareVisitorDouble: "MP_RARE_VISITOR_DOUBLE",
  auctionAuthentication: "MP_AUCTION_AUTHENTICATION_REFUND",
} as const;

type DailyInterestMarker = {
  date: string;
  effect_id: string;
  base: number;
  rate: number;
  amount: number;
};

type ArtworkEffectSettlement = {
  _id: string;
  player_id: string;
  effect_id: string;
  effect_code: string;
  settlement_date: string;
  status: "completed";
  created_at: Date;
  base: number;
  rate: number;
  amount: number;
  completed_at: Date;
};

export function rollEffectChance(
  effect: ArtworkEffect | null,
  parameter = "chance",
  fallback = 0,
  random: () => number = Math.random,
): boolean {
  const chance = Math.min(
    1,
    Math.max(0, getArtworkEffectNumberParameter(effect, parameter, fallback)),
  );
  return Boolean(effect) && random() < chance;
}

export function shouldApplyPerfectFirstReroll(
  effect: ArtworkEffect | null,
  item: Pick<GameItem, "reroll_spent" | "roll_count">,
): boolean {
  return (
    effect?.code === MASTERPIECE_EFFECT_CODES.perfectReroll &&
    (item.reroll_spent ?? 0) === 0 &&
    item.roll_count === 0
  );
}

export function getMasterpieceGalleryXpChunks(
  effect: ArtworkEffect | null,
  uncommonDisplayedCount: number,
): number {
  if (effect?.code !== MASTERPIECE_EFFECT_CODES.uncommonGalleryXp) return 0;
  return (
    Math.max(0, Math.floor(uncommonDisplayedCount)) *
    Math.max(0, getArtworkEffectNumberParameter(effect, "xp_chunks", 0.5))
  );
}

export function getVisitorGenerationPasses(
  hasRareDoubleEffect: boolean,
  appearsOnDisplayedRare: boolean,
): number {
  return hasRareDoubleEffect && appearsOnDisplayedRare ? 2 : 1;
}

export function getAuctionForgeryRefund(
  effect: ArtworkEffect | null,
  winningBid: number,
): number {
  if (effect?.code !== MASTERPIECE_EFFECT_CODES.auctionAuthentication) return 0;
  const rate = Math.min(
    1,
    Math.max(0, getArtworkEffectNumberParameter(effect, "refund_rate", 0.75)),
  );
  return Math.floor(Math.max(0, winningBid) * rate);
}

export function getTransferableAuctionCommissionCoefficient(
  effect: ArtworkEffect | null,
): number {
  if (effect?.code !== MASTERPIECE_EFFECT_CODES.transferableAuction) return 0;
  return Math.min(
    1,
    Math.max(
      0,
      getArtworkEffectNumberParameter(effect, "commission_rate", 0.1),
    ),
  );
}

export async function settleDailyMasterpieceInterest(
  database: Db,
  now = new Date(),
): Promise<{ settlements: number; awarded: number }> {
  const settlementDate = getNewYorkSettlementDate(now);
  if (!settlementDate) return { settlements: 0, awarded: 0 };
  const players = await database
    .collection<{ _id: string; active: boolean; profile: { bank_balance: number } }>(
      "players",
    )
    .find({ active: true })
    .project({ _id: 1, "profile.bank_balance": 1 })
    .toArray();
  let settlements = 0;
  let awarded = 0;

  for (const player of players) {
    const effects = await getDisplayedArtworkEffects(database, player._id, [
      MASTERPIECE_EFFECT_CODES.bankInterest,
      MASTERPIECE_EFFECT_CODES.escrowInterest,
    ]);
    for (const effect of effects) {
      const ledgerId = `${settlementDate}:${player._id}:${effect.code}`;
      const rate = Math.max(
        0,
        getArtworkEffectNumberParameter(
          effect,
          "rate",
          effect.code === MASTERPIECE_EFFECT_CODES.bankInterest ? 0.03 : 0.06,
        ),
      );
      const base =
        effect.code === MASTERPIECE_EFFECT_CODES.bankInterest
          ? Math.max(0, player.profile.bank_balance)
          : await getPlayerEscrow(database, player._id);
      const amount = Math.floor(base * rate);
      const markerPath = `profile.artwork_effect_settlements.${effect.code}`;
      const marker: DailyInterestMarker = {
        date: settlementDate,
        effect_id: effect._id,
        base,
        rate,
        amount,
      };
      const result = await database.collection("players").updateOne(
        {
          _id: player._id,
          active: true,
          [`${markerPath}.date`]: { $ne: settlementDate },
        },
        {
          $inc: { "profile.bank_balance": amount },
          $set: { [markerPath]: marker },
        },
      );
      const newlyApplied = result.modifiedCount === 1;
      let appliedMarker = marker;
      if (!newlyApplied) {
        const alreadyApplied = await database.collection("players").findOne(
          {
            _id: player._id,
            active: true,
            [`${markerPath}.date`]: settlementDate,
          },
          { projection: { [markerPath]: 1 } },
        ) as
          | {
              profile?: {
                artwork_effect_settlements?: Record<
                  string,
                  DailyInterestMarker
                >;
              };
            }
          | null;
        const storedMarker =
          alreadyApplied?.profile?.artwork_effect_settlements?.[effect.code];
        if (!storedMarker || storedMarker.date !== settlementDate) {
          throw new Error(`Player ${player._id} could not receive interest.`);
        }
        appliedMarker = storedMarker;
      }
      await database
        .collection<ArtworkEffectSettlement>("artwork_effect_settlements")
        .updateOne(
        { _id: ledgerId },
        {
          $setOnInsert: {
            player_id: player._id,
            effect_id: appliedMarker.effect_id,
            effect_code: effect.code,
            settlement_date: settlementDate,
            status: "completed",
            created_at: now,
            base: appliedMarker.base,
            rate: appliedMarker.rate,
            amount: appliedMarker.amount,
            completed_at: now,
          },
        },
        { upsert: true },
      );
      if (newlyApplied && amount > 0) {
        await recordEconomyMetricsSafely(database, {
          amount,
          currency: "money",
          direction: "earned",
          source:
            effect.code === MASTERPIECE_EFFECT_CODES.bankInterest
              ? "masterpiece-bank-interest"
              : "masterpiece-escrow-interest",
        });
        await createPlayerNotification(database, player._id, {
          kind: "success",
          message: `${effect.title} paid $${amount.toLocaleString()} in daily interest.`,
          dedupeUnread: false,
        }).catch((error) => {
          console.error(
            `Unable to notify player ${player._id} about masterpiece interest`,
            error,
          );
        });
      }
      if (newlyApplied) {
        settlements += 1;
        awarded += amount;
      }
    }
  }
  return { settlements, awarded };
}

export function getNewYorkSettlementDate(now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${value.year}-${value.month}-${value.day}`;
  if (Number(value.hour) >= 7) return date;
  const previous = new Date(`${date}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

async function getPlayerEscrow(database: Db, playerId: string): Promise<number> {
  const result = await database
    .collection("auctions")
    .aggregate<{ total: number }>([
      { $match: { current_winner_id: playerId, has_bid: true } },
      { $group: { _id: null, total: { $sum: "$current_bid" } } },
    ])
    .toArray();
  return Math.max(0, result[0]?.total ?? 0);
}

import type { Db } from "mongodb";

import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "./game-settings.ts";
import {
  generateDailyDrop,
  getVisitorRarityMap,
  type LootData,
} from "./gameplay.ts";
import {
  AUCTIONEER_BASE_PRIVATE_LOTS,
  AUCTION_HOUSE_OWNER_ID,
  createAuction,
  getAuctionViews,
  PRIVATE_AUCTION_DURATION_MINUTES,
  type Auction,
  type AuctionView,
} from "./auction-gameplay.ts";
import { hydrateGameItems } from "./item-artwork.ts";
import {
  ART_DONOR_ATTRIBUTE_ID,
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "./legendary-attributes.ts";
import { getDisplayedArtworkEffect } from "./artwork-effects.ts";
import {
  getTransferableAuctionCommissionCoefficient,
  MASTERPIECE_EFFECT_CODES,
} from "./masterpiece-effects.ts";
import { visitorUsesOwnGalleryBenefits, type GalleryNpc, type NpcQuality } from "./npc-gameplay.ts";

export type AuctioneerPlayer = {
  _id: string;
  profile: {
    level: number;
    market_expert?: { expiration?: string };
  };
};

export type AuctioneerInteractionResult = {
  message: string;
  interaction: {
    type: "auctioneer-access";
    npcName: string;
    quality: NpcQuality;
    auctionCount: number;
    auctions?: AuctionView[];
    expiration: string;
  };
  auctions: Auction[];
  priceMultiplier: number;
};

export const AUCTIONEER_MARKET_ACCESS_MINUTES: Record<
  NpcQuality,
  { initial: number; extension: number }
> = {
  bronze: { initial: 12, extension: 7 },
  silver: { initial: 13, extension: 8 },
  gold: { initial: 14, extension: 9 },
  platinum: { initial: 15, extension: 10 },
};

export const AUCTIONEER_HOME_ACCESS_MULTIPLIER = 2.5;

export function getAuctioneerMarketAccessMinutes(
  quality: NpcQuality,
  ownGalleryBenefits: boolean,
  extending: boolean,
): number {
  const minutes = AUCTIONEER_MARKET_ACCESS_MINUTES[quality][
    extending ? "extension" : "initial"
  ];
  return ownGalleryBenefits
    ? Math.floor(minutes * AUCTIONEER_HOME_ACCESS_MULTIPLIER)
    : minutes;
}

export async function processAuctioneerInteraction(
  database: Db,
  player: AuctioneerPlayer,
  npc: GalleryNpc,
  now: Date,
  random = Math.random,
): Promise<AuctioneerInteractionResult> {
  const generatedItemIds: string[] = [];
  const generatedAuctionIds: string[] = [];

  try {
    const ownGallery = await visitorUsesOwnGalleryBenefits(database, npc, player._id);
    const currentExpiration = new Date(
      (
        await database.collection<AuctioneerPlayer>("players").findOne(
          { _id: player._id },
          { projection: { "profile.market_expert.expiration": 1 } },
        )
      )?.profile.market_expert?.expiration ?? 0,
    );
    const extendingAccess = currentExpiration.getTime() > now.getTime();
    const accessMinutes = getAuctioneerMarketAccessMinutes(
      npc.quality,
      ownGallery,
      extendingAccess,
    );
    const marketExpertExpiration = extendingAccess
      ? new Date(currentExpiration.getTime() + accessMinutes * 60_000)
      : new Date(now.getTime() + accessMinutes * 60_000);

    const [
      settings,
      metadata,
      donorPair,
      auctionBuyNowEffect,
      transferableAuctionEffect,
    ] =
      await Promise.all([
        getGameplaySettings(database),
        database
          .collection<{ _id: string; loot_data: LootData }>("metadata")
          .findOne({ _id: "loot-data" }),
        ownGallery
          ? getDisplayedLegendaryEffect(
              database,
              player._id,
              "DONOR_AUCTIONEER_TRADE",
            )
          : Promise.resolve(null),
        ownGallery
          ? getDisplayedLegendaryEffect(
              database,
              player._id,
              "AUCTION_BUY_NOW",
            )
          : Promise.resolve(null),
        getDisplayedArtworkEffect(
          database,
          player._id,
          MASTERPIECE_EFFECT_CODES.transferableAuction,
        ),
      ]);
    if (!metadata) throw new Error("Loot metadata is not configured.");

    const donorPresent = donorPair && await database.collection<GalleryNpc>("npcs").findOne({
      owner_id: npc.owner_id,
      attribute_id: ART_DONOR_ATTRIBUTE_ID,
      expiration: { $gt: now },
    });
    const auctionCount =
      AUCTIONEER_BASE_PRIVATE_LOTS +
      (ownGallery ? 1 : 0) +
      (donorPresent
        ? Math.max(
            0,
            Math.floor(
              getLegendaryNumberParameter(
                donorPair,
                "auctioneer_item_delta",
                1,
              ),
            ),
          )
        : 0);
    const priceMultiplier = 4;
    const buyNowMultiplier = getLegendaryNumberParameter(
      auctionBuyNowEffect,
      "buy_now_multiplier",
      1.1,
    );
    const buyNowChance = Math.min(
      Math.max(
        getLegendaryNumberParameter(auctionBuyNowEffect, "chance", 0.5),
        0,
      ),
      1,
    );
    const generated = await generateDailyDrop(
      database,
      AUCTION_HOUSE_OWNER_ID,
      player.profile.level,
      {
        now,
        itemCount: auctionCount,
        generationMap: {
          ...getGameplayGenerationMap(settings.active),
          rarity: getVisitorRarityMap(
            player.profile.level,
            metadata.loot_data,
            settings.active.rarityWeights,
            settings.active.visitorRarityAmplifiers[npc.quality],
          ),
        },
        mintValueMultiplier: settings.active.mintValueMultiplier,
        debug: settings.debugEnabled,
        useRawRarityMap: true,
        source: "private auction",
        status: "auctioned",
      },
    );
    generatedItemIds.push(...generated.map((item) => item._id));
    const hydrated = await hydrateGameItems(database, generated);
    const createdAuctions: Auction[] = [];
    for (const item of hydrated) {
      const startingBid = Math.floor(item.values.actual * priceMultiplier);
      const buyNow = auctionBuyNowEffect && random() < buyNowChance
        ? Math.max(startingBid + 1, Math.ceil(startingBid * buyNowMultiplier))
        : null;
      const auction = await createAuction(database, item, {
        sellerId: null,
        sellerName: "Auction House",
        viewer: player._id,
        startingBid,
        buyNow,
        commission: transferableAuctionEffect
          ? {
              player_id: player._id,
              coefficient:
                getTransferableAuctionCommissionCoefficient(
                  transferableAuctionEffect,
                ),
            }
          : null,
        durationMinutes: PRIVATE_AUCTION_DURATION_MINUTES,
        now,
      });
      generatedAuctionIds.push(auction._id);
      createdAuctions.push(auction);
    }
    await database.collection<AuctioneerPlayer>("players").updateOne(
      { _id: player._id },
      {
        $set: {
          "profile.market_expert.expiration":
            marketExpertExpiration.toISOString(),
        },
      },
    );
    const message =
      `The ${npc.quality} Auctioneer ${extendingAccess ? "extended" : "activated"} market analysis ${extendingAccess ? "by" : "for"} ${accessMinutes} minutes, until ${marketExpertExpiration.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, ` +
      `and gave you a five-minute preview of ${auctionCount} ten-minute private ${auctionCount === 1 ? "lot" : "lots"} before their final five minutes in the expert market.`;

    const { auctions: privateAuctionViews } = await getAuctionViews(
      database,
      player._id,
      {
        auctionIds: generatedAuctionIds,
        pageSize: generatedAuctionIds.length,
      },
    );

    return {
      message,
      interaction: {
        type: "auctioneer-access",
        npcName: npc.npc_name,
        quality: npc.quality,
        auctionCount,
        auctions: privateAuctionViews,
        expiration: marketExpertExpiration.toISOString(),
      },
      auctions: createdAuctions,
      priceMultiplier,
    };
  } catch (error) {
    await Promise.all([
      generatedAuctionIds.length
        ? database.collection<{ _id: string }>("auctions").deleteMany({
            _id: { $in: generatedAuctionIds },
          })
        : Promise.resolve(),
      generatedItemIds.length
        ? database.collection<{ _id: string }>("items").deleteMany({
            _id: { $in: generatedItemIds },
          })
        : Promise.resolve(),
      database
        .collection<GalleryNpc>("npcs")
        .updateOne({ _id: npc._id }, { $pull: { players_met: player._id } }),
      database.collection<{ _id: string }>("players").updateOne(
        { _id: player._id },
        { $inc: { [`profile.npcs_met.${npc.quality}`]: -1 } },
      ),
    ]);
    throw error;
  }
}

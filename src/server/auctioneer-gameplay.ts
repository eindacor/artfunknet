import type { Db } from "mongodb";

import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "./game-settings.ts";
import {
  amplifyRarityMap,
  generateDailyDrop,
  getRarityMap,
  type LootData,
} from "./gameplay.ts";
import {
  AUCTIONEER_BASE_PRIVATE_LOTS,
  AUCTION_HOUSE_OWNER_ID,
  createAuction,
  PRIVATE_AUCTION_DURATION_MINUTES,
  type Auction,
} from "./auction-gameplay.ts";
import { hydrateGameItems } from "./item-artwork.ts";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "./legendary-attributes.ts";
import type { GalleryNpc, NpcQuality } from "./npc-gameplay.ts";

export const NPC_RARITY_AMPLIFIERS: Record<NpcQuality, number> = {
  bronze: 0.5,
  silver: 0.6,
  gold: 0.7,
  platinum: 0.8,
};

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
    expiration: string;
  };
  auctions: Auction[];
  priceMultiplier: number;
};

export async function processAuctioneerInteraction(
  database: Db,
  player: AuctioneerPlayer,
  npc: GalleryNpc,
  now: Date,
): Promise<AuctioneerInteractionResult> {
  const generatedItemIds: string[] = [];
  const generatedAuctionIds: string[] = [];

  try {
    const ownGallery = npc.owner_id === player._id;
    const qualityBonus: Record<NpcQuality, number> = {
      bronze: 2,
      silver: 3,
      gold: 4,
      platinum: 5,
    };
    const currentExpiration = new Date(
      (
        await database.collection<AuctioneerPlayer>("players").findOne(
          { _id: player._id },
          { projection: { "profile.market_expert.expiration": 1 } },
        )
      )?.profile.market_expert?.expiration ?? 0,
    );
    const baseMinutes = 10 + qualityBonus[npc.quality];
    const extensionMinutes = 5 + qualityBonus[npc.quality];
    const durationMinutes = ownGallery
      ? Math.floor(baseMinutes * 2.5)
      : baseMinutes;
    const extension = ownGallery
      ? Math.floor(extensionMinutes * 2.5)
      : extensionMinutes;
    const marketExpertExpiration =
      currentExpiration.getTime() > now.getTime()
        ? new Date(currentExpiration.getTime() + extension * 60_000)
        : new Date(now.getTime() + durationMinutes * 60_000);

    const [settings, metadata, donorPair, privatePriceReduction] =
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
              "PRIVATE_AUCTION_PRICE_REDUCTION",
            )
          : Promise.resolve(null),
      ]);
    if (!metadata) throw new Error("Loot metadata is not configured.");

    const auctionCount =
      AUCTIONEER_BASE_PRIVATE_LOTS +
      (ownGallery ? 1 : 0) +
      Math.max(
        0,
        Math.floor(
          getLegendaryNumberParameter(
            donorPair,
            "auctioneer_item_delta",
            donorPair ? 1 : 0,
          ),
        ),
      );
    const priceMultiplier = getLegendaryNumberParameter(
      privatePriceReduction,
      "price_multiplier",
      privatePriceReduction ? 2.5 : 4,
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
          rarity: amplifyRarityMap(
            getRarityMap(player.profile.level, metadata.loot_data),
            NPC_RARITY_AMPLIFIERS[npc.quality],
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
      const auction = await createAuction(database, item, {
        sellerId: null,
        sellerName: "Auction House",
        viewer: player._id,
        startingBid: Math.floor(item.values.actual * priceMultiplier),
        buyNow: null,
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
      `The Auctioneer activated market analysis until ${marketExpertExpiration.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ` +
      `and opened ${auctionCount} private ${auctionCount === 1 ? "lot" : "lots"} for you.`;

    return {
      message,
      interaction: {
        type: "auctioneer-access",
        npcName: npc.npc_name,
        quality: npc.quality,
        auctionCount,
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

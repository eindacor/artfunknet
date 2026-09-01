import { NextResponse } from "next/server";

import { getGameplaySettings } from "@/server/game-settings";
import {
  calculateCollectorReward,
  COLLECTOR_MEETING_LIMITS,
  getCollectorForgeryHeat,
} from "@/server/collector-gameplay";
import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
} from "@/server/collection-gameplay";
import {
  amplifyRarityMap,
  generateDailyDrop,
  getRarityMap,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import {
  ART_COLLECTOR_ATTRIBUTE_ID,
  ART_DEALER_ATTRIBUTE_ID,
  ART_DONOR_ATTRIBUTE_ID,
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
  MARKET_EXPERT_ATTRIBUTE_ID,
} from "@/server/legendary-attributes";
import {
  NPC_QUALITIES,
  type GalleryNpc,
  type NpcQuality,
} from "@/server/npc-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  grantStandardNpcReward,
  isStandardRewardNpc,
} from "@/server/standard-npc-reward-service";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    xp: number;
    lottery_tickets: number;
    npcs_met?: Partial<Record<NpcQuality, number>>;
    level: number;
  };
};

const NPC_RARITY_AMPLIFIERS: Record<NpcQuality, number> = {
  bronze: 0.5,
  silver: 0.6,
  gold: 0.7,
  platinum: 0.8,
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const now = new Date();
  const [player, npc] = await Promise.all([
    database
      .collection<Player>("players")
      .findOne({ _id: auth.session.playerId, active: true }),
    database
      .collection<GalleryNpc>("npcs")
      .findOne({ _id: id, expiration: { $gt: now } }),
  ]);
  if (!player || !npc || !NPC_QUALITIES.includes(npc.quality)) {
    return NextResponse.json(
      { error: "This visitor is no longer available." },
      { status: 404 },
    );
  }

  const meetings = player.profile.npcs_met?.[npc.quality] ?? 0;
  if (meetings >= COLLECTOR_MEETING_LIMITS[npc.quality]) {
    return NextResponse.json(
      { error: `${npc.quality} visitor limit reached.` },
      { status: 409 },
    );
  }

  const result = await database.collection<GalleryNpc>("npcs").updateOne(
    {
      _id: npc._id,
      expiration: { $gt: now },
      players_met: { $ne: player._id },
    },
    { $addToSet: { players_met: player._id } },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "You have already met this visitor." },
      { status: 409 },
    );
  }

  const playerResult = await database.collection<Player>("players").updateOne(
    { _id: player._id },
    {
      $inc: { [`profile.npcs_met.${npc.quality}`]: 1 },
      $set: { "profile.last_activity": now.toISOString() },
    },
  );
  if (playerResult.modifiedCount !== 1) {
    await database
      .collection<GalleryNpc>("npcs")
      .updateOne({ _id: npc._id }, { $pull: { players_met: player._id } });
    return NextResponse.json(
      { error: "The visitor interaction could not be recorded." },
      { status: 500 },
    );
  }

  if (isStandardRewardNpc(npc.attribute_id)) {
    try {
      const interaction = await grantStandardNpcReward(
        database,
        player,
        npc,
        now,
      );
      return NextResponse.json({ status: "ok", interaction });
    } catch (error) {
      await Promise.all([
        database
          .collection<GalleryNpc>("npcs")
          .updateOne({ _id: npc._id }, { $pull: { players_met: player._id } }),
        database.collection<Player>("players").updateOne(
          { _id: player._id },
          { $inc: { [`profile.npcs_met.${npc.quality}`]: -1 } },
        ),
      ]);
      console.error("Unable to grant standard NPC reward", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The visitor reward could not be applied.",
        },
        { status: 500 },
      );
    }
  }

  if (npc.attribute_id === ART_DONOR_ATTRIBUTE_ID) {
    try {
      const settings = await getGameplaySettings(database);
      const metadata = await database
        .collection<{ _id: string; loot_data: LootData }>("metadata")
        .findOne({ _id: "loot-data" });
      if (!metadata) throw new Error("Loot metadata is not configured.");

      const ownGallery = npc.owner_id === player._id;
      const [additionalOfferEffect, conditionEffect, levelEffect, tradeEffect] =
        ownGallery
          ? await Promise.all([
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "BONUS_DEALER_DONOR",
              ),
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "DONOR_CONDITION_MIN",
              ),
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "DONOR_LEVEL_MIN",
              ),
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "DONOR_AUCTIONEER_TRADE",
              ),
            ])
          : [null, null, null, null];
      const marketExpertPresent =
        tradeEffect &&
        (await database.collection("npcs").findOne({
          owner_id: player._id,
          attribute_id: MARKET_EXPERT_ATTRIBUTE_ID,
          expiration: { $gt: now },
        }));
      const offerCount = Math.max(
        0,
        1 +
          (ownGallery ? 1 : 0) +
          Math.floor(
            getLegendaryNumberParameter(
              additionalOfferEffect,
              "additional_items",
              additionalOfferEffect ? 1 : 0,
            ),
          ) +
          (marketExpertPresent
            ? Math.floor(
                getLegendaryNumberParameter(
                  tradeEffect,
                  "donor_item_delta",
                  -1,
                ),
              )
            : 0),
      );
      const conditionMinimum = getLegendaryNumberParameter(
        conditionEffect,
        "condition_minimum",
        0,
      );
      const itemLevel = Math.max(
        1,
        Math.floor(
          getLegendaryNumberParameter(levelEffect, "level_minimum", 1),
        ),
      );
      // TODO AI: DONOR_QUEST_ITEM_CHANCE should replace one random offer with
      // an active quest target once quests are ported.
      const ownedArtworkIds = new Set(
        (
          await database
            .collection<GameItem>("items")
            .find({
              owner: player._id,
              status: { $in: ["claimed", "displayed"] },
            })
            .project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 })
            .toArray()
        ).map((item) => item.artwork_id),
      );
      const generated = await generateDailyDrop(
        database,
        player._id,
        player.profile.level,
        {
          now,
          itemCount: offerCount,
          rarityWeights: amplifyRarityMap(
            getRarityMap(player.profile.level, metadata.loot_data),
            NPC_RARITY_AMPLIFIERS[npc.quality],
          ),
          foilProbability: settings.active.foilProbability,
          unlockedProbability: settings.active.unlockedProbability,
          debug: settings.debugEnabled,
          useRawRarityMap: true,
          source: "art donor",
          itemLevel,
          conditionMinimum,
        },
      );
      const offers = await hydrateGameItems(database, generated);

      return NextResponse.json({
        status: "ok",
        message: `${npc.npc_name} offered you ${offers.length} ${offers.length === 1 ? "artwork" : "artworks"}.`,
        interaction: {
          type: "art-donor-offer",
          npcName: npc.npc_name,
          quality: npc.quality,
          items: offers.map((item) => ({
            ...item,
            alreadyOwned: ownedArtworkIds.has(item.artwork_id),
          })),
        },
      });
    } catch (error) {
      await Promise.all([
        database
          .collection<GalleryNpc>("npcs")
          .updateOne({ _id: npc._id }, { $pull: { players_met: player._id } }),
        database.collection<Player>("players").updateOne(
          { _id: player._id },
          { $inc: { [`profile.npcs_met.${npc.quality}`]: -1 } },
        ),
      ]);
      console.error("Unable to generate Art Donor offers", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The Art Donor interaction failed.",
        },
        { status: 500 },
      );
    }
  }

  if (npc.attribute_id === ART_DEALER_ATTRIBUTE_ID) {
      try {
        const settings = await getGameplaySettings(database);
        const metadata = await database
          .collection<{ _id: string; loot_data: LootData }>("metadata")
          .findOne({ _id: "loot-data" });
        if (!metadata) throw new Error("Loot metadata is not configured.");

        const ownGallery = npc.owner_id === player._id;
        const [
          additionalOfferEffect,
          conditionBonusEffect,
          levelEffect,
        ] = ownGallery
          ? await Promise.all([
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "BONUS_DEALER_DONOR",
              ),
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "DISPLAY_CONDITION_DEALER_BOOST",
              ),
              getDisplayedLegendaryEffect(
                database,
                player._id,
                "DEALER_LEVEL_MIN",
              ),
            ])
          : [null, null, null];
        const discountEffect = await getDisplayedLegendaryEffect(
          database,
          player._id,
          "DEALER_DISCOUNT",
        );
        const conditionMinimum = getLegendaryNumberParameter(
          conditionBonusEffect,
          "condition_minimum",
          0.7,
        );
        const displayedBelowMinimum = conditionBonusEffect
          ? await database.collection<GameItem>("items").countDocuments({
              owner: player._id,
              status: "displayed",
              condition: { $lt: conditionMinimum },
            })
          : 1;
        const offerCount =
          2 +
          (ownGallery ? 1 : 0) +
          Math.floor(
            getLegendaryNumberParameter(
              additionalOfferEffect,
              "additional_items",
              additionalOfferEffect ? 1 : 0,
            ),
          ) +
          (conditionBonusEffect && displayedBelowMinimum === 0 ? 1 : 0);
        const itemLevel = Math.max(
          1,
          Math.floor(
            getLegendaryNumberParameter(levelEffect, "level_minimum", 1),
          ),
        );
        const priceMultiplier = getLegendaryNumberParameter(
          discountEffect,
          "cost_multiplier",
          1,
        );
        // TODO AI: AUCTION_COUNT_DEALER_BONUS and DEALER_QUEST_ITEM_CHANCE
        // should modify this offer set after auctions and quests are ported.
        const ownedArtworkIds = new Set(
          (
            await database
              .collection<GameItem>("items")
              .find({
                owner: player._id,
                status: { $in: ["claimed", "displayed"] },
              })
              .project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 })
              .toArray()
          ).map((item) => item.artwork_id),
        );
        const generated = await generateDailyDrop(
          database,
          player._id,
          player.profile.level,
          {
            now,
            itemCount: offerCount,
            rarityWeights: amplifyRarityMap(
              getRarityMap(player.profile.level, metadata.loot_data),
              NPC_RARITY_AMPLIFIERS[npc.quality],
            ),
            foilProbability: settings.active.foilProbability,
            unlockedProbability: settings.active.unlockedProbability,
            debug: settings.debugEnabled,
            useRawRarityMap: true,
            source: "art dealer",
            itemLevel,
            status: "for_sale",
          },
        );
        const offers = await hydrateGameItems(database, generated);

        return NextResponse.json({
          status: "ok",
          message: `${npc.npc_name} offered you ${offers.length} ${offers.length === 1 ? "artwork" : "artworks"} for sale.`,
          interaction: {
            type: "art-dealer-offer",
            npcName: npc.npc_name,
            quality: npc.quality,
            items: offers.map((item) => ({
              ...item,
              alreadyOwned: ownedArtworkIds.has(item.artwork_id),
              price: Math.floor(item.values.dealer * priceMultiplier),
            })),
          },
        });
      } catch (error) {
        await Promise.all([
          database
            .collection<GalleryNpc>("npcs")
            .updateOne({ _id: npc._id }, { $pull: { players_met: player._id } }),
          database.collection<Player>("players").updateOne(
            { _id: player._id },
            { $inc: { [`profile.npcs_met.${npc.quality}`]: -1 } },
          ),
        ]);
        console.error("Unable to generate Art Dealer offers", error);
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "The Art Dealer interaction failed.",
          },
          { status: 500 },
        );
      }
  }

  if (npc.attribute_id === ART_COLLECTOR_ATTRIBUTE_ID) {
    const generatedOfferIds: string[] = [];
    let reservedTarget: GameItem | null = null;
    let removedTarget: GameItem | null = null;

    try {
      const ownGallery = npc.owner_id === player._id;
      const [
        goodConditionEffect,
        rollCountEffect,
        xpRewardEffect,
        keepItemEffect,
        saleOfferEffect,
        forgeryReductionEffect,
      ] = ownGallery
        ? await Promise.all([
            getDisplayedLegendaryEffect(
              database,
              player._id,
              "GOOD_CONDITION_COLLECTOR_BONUS",
            ),
            getDisplayedLegendaryEffect(
              database,
              player._id,
              "ART_COLLECTOR_ROLL_COUNT_BONUS",
            ),
            getDisplayedLegendaryEffect(
              database,
              player._id,
              "ART_COLLECTOR_XP_REWARD",
            ),
            getDisplayedLegendaryEffect(
              database,
              player._id,
              "COLLECTOR_DOES_NOT_COLLECT",
            ),
            getDisplayedLegendaryEffect(
              database,
              player._id,
              "COLLECTOR_FOR_SALE_OFFER",
            ),
            getDisplayedLegendaryEffect(
              database,
              player._id,
              "COLLECTOR_FORGERY_HEAT_REDUCTION",
            ),
          ])
        : [null, null, null, null, null, null];

      if (saleOfferEffect) {
        const [settings, metadata] = await Promise.all([
          getGameplaySettings(database),
          database
            .collection<{ _id: string; loot_data: LootData }>("metadata")
            .findOne({ _id: "loot-data" }),
        ]);
        if (!metadata) throw new Error("Loot metadata is not configured.");

        const generated = await generateDailyDrop(
          database,
          player._id,
          player.profile.level,
          {
            now,
            itemCount: Math.max(
              0,
              Math.floor(
                getLegendaryNumberParameter(
                  saleOfferEffect,
                  "additional_items",
                  2,
                ),
              ),
            ),
            rarityWeights: amplifyRarityMap(
              getRarityMap(player.profile.level, metadata.loot_data),
              NPC_RARITY_AMPLIFIERS[npc.quality],
            ),
            foilProbability: settings.active.foilProbability,
            unlockedProbability: settings.active.unlockedProbability,
            debug: settings.debugEnabled,
            useRawRarityMap: true,
            source: "art collector",
            status: "for_sale",
          },
        );
        generatedOfferIds.push(...generated.map((item) => item._id));
      }

      // TODO AI: ART_COLLECTOR_AUCTION_BONUS and COLLECTOR_QUEST_ITEM should
      // add their side rewards once auctions and quests are ported.
      const candidates = await database
        .collection<GameItem>("items")
        .aggregate<GameItem>([
          {
            $match: {
              owner: player._id,
              status: "claimed",
              tags: "for sale",
            },
          },
          { $sample: { size: 1 } },
        ])
        .toArray();
      const target = candidates[0];
      if (!target) {
        return NextResponse.json({
          status: "ok",
          message:
            'A collector wanders into your gallery, but can\'t find anything you\'re willing to sell. The two of you share a deep conversation about butterflies instead. To do business with collectors in the future, try adding the "for sale" tag to items in your inventory.',
        });
      }

      const reservation = await database.collection<GameItem>("items").updateOne(
        {
          _id: target._id,
          owner: player._id,
          status: "claimed",
          tags: "for sale",
        },
        { $set: { status: "collector_pending" } },
      );
      if (reservation.modifiedCount !== 1) {
        throw new Error("That artwork is no longer available to the Collector.");
      }
      reservedTarget = target;

      const [hydratedTarget] = await hydrateGameItems(database, [target]);
      if (!hydratedTarget) throw new Error("The Collector artwork is unavailable.");

      const forgeryCaught =
        target.authenticity.forgery &&
        Math.random() <
          getCollectorForgeryHeat(
            hydratedTarget,
            Boolean(forgeryReductionEffect),
          );
      if (forgeryCaught) {
        const identified = await database.collection<GameItem>("items").updateOne(
          { _id: target._id, owner: player._id, status: "collector_pending" },
          {
            $set: {
              status: "claimed",
              "authenticity.liability_pending": false,
              "authenticity.liable": player._id,
              "authenticity.identified": true,
              "authenticity.forgery_quality": Math.max(
                0.1,
                target.authenticity.forgery_quality - 0.1,
              ),
            },
          },
        );
        if (identified.modifiedCount !== 1) {
          throw new Error("The forged artwork could not be identified.");
        }
        reservedTarget = null;
        // TODO AI: Apply the legacy temporary visitor reputation penalty once
        // the reputation and visitor-ignore systems are ported.
        return NextResponse.json({
          status: "ok",
          message:
            "You have met a collector, who has identified an item you're selling to be a forgery!",
          interaction: {
            type: "art-collector-result",
            npcName: npc.npc_name,
            quality: npc.quality,
            item: hydratedTarget,
            forgeryCaught: true,
            keptItem: true,
            rewardType: null,
            rewardAmount: 0,
            bonusOffers: generatedOfferIds.length,
          },
        });
      }

      const enthusiastPresent =
        xpRewardEffect &&
        (await database.collection<GalleryNpc>("npcs").findOne({
          owner_id: player._id,
          npc_name: "Art Enthusiast",
          expiration: { $gt: now },
        }));
      const currentPlayer = await database
        .collection<Player>("players")
        .findOne({ _id: player._id, active: true });
      if (!currentPlayer) throw new Error("The player account is unavailable.");

      const reward = calculateCollectorReward({
        item: target,
        quality: npc.quality,
        ownGallery,
        goodConditionBonus: Boolean(goodConditionEffect),
        rollCountBonus: Boolean(rollCountEffect),
        xpOffer: Boolean(enthusiastPresent),
        xpChunk: getXpChunk(currentPlayer.profile.level),
      });
      const keepChance = getLegendaryNumberParameter(
        keepItemEffect,
        "keep_chance",
        keepItemEffect ? 0.15 : 0,
      );
      const keptItem = Boolean(keepItemEffect) && Math.random() < keepChance;

      if (keptItem) {
        const restored = await database.collection<GameItem>("items").updateOne(
          {
            _id: target._id,
            owner: player._id,
            status: "collector_pending",
          },
          { $set: { status: "claimed" } },
        );
        if (restored.modifiedCount !== 1) {
          throw new Error("The Collector could not release the artwork.");
        }
        reservedTarget = null;
      } else {
        const removed = await database.collection<GameItem>("items").deleteOne({
          _id: target._id,
          owner: player._id,
          status: "collector_pending",
        });
        if (removed.deletedCount !== 1) {
          throw new Error("The Collector could not collect the artwork.");
        }
        removedTarget = target;
        reservedTarget = null;
      }

      let rewardResult;
      if (reward.type === "xp") {
        const xpResult = applyXp(
          currentPlayer.profile.level,
          currentPlayer.profile.xp,
          reward.amount,
        );
        const moneyForXpEffect = await getDisplayedLegendaryEffect(
          database,
          player._id,
          "MONEY_FOR_XP",
        );
        const bonusMoney = Math.floor(
          reward.amount *
            getLegendaryNumberParameter(
              moneyForXpEffect,
              "money_per_xp",
              moneyForXpEffect ? 2 : 0,
            ),
        );
        rewardResult = await database.collection<Player>("players").updateOne(
          {
            _id: player._id,
            active: true,
            "profile.level": currentPlayer.profile.level,
            "profile.xp": currentPlayer.profile.xp,
          },
          {
            $set: {
              "profile.level": xpResult.level,
              "profile.xp": xpResult.xp,
              ...Object.fromEntries(
                Object.entries(getCapsForLevel(xpResult.level)).map(
                  ([key, value]) => [`profile.${key}`, value],
                ),
              ),
            },
            $inc: {
              "profile.lottery_tickets": xpResult.lotteryTickets,
              "profile.bank_balance": bonusMoney,
            },
          },
        );
      } else {
        rewardResult = await database.collection<Player>("players").updateOne(
          { _id: player._id, active: true },
          { $inc: { "profile.bank_balance": reward.amount } },
        );
      }
      if (rewardResult.modifiedCount !== 1) {
        throw new Error("The Collector reward could not be applied.");
      }

      return NextResponse.json({
        status: "ok",
        message: keptItem
          ? `${npc.npc_name} rewarded you and let you keep the artwork.`
          : `${npc.npc_name} collected your artwork.`,
        interaction: {
          type: "art-collector-result",
          npcName: npc.npc_name,
          quality: npc.quality,
          item: hydratedTarget,
          forgeryCaught: false,
          keptItem,
          rewardType: reward.type,
          rewardAmount: reward.amount,
          bonusOffers: generatedOfferIds.length,
        },
      });
    } catch (error) {
      const cleanup: Promise<unknown>[] = [
        database
          .collection<GalleryNpc>("npcs")
          .updateOne({ _id: npc._id }, { $pull: { players_met: player._id } }),
        database.collection<Player>("players").updateOne(
          { _id: player._id },
          { $inc: { [`profile.npcs_met.${npc.quality}`]: -1 } },
        ),
      ];
      if (generatedOfferIds.length > 0) {
        cleanup.push(
          database.collection<GameItem>("items").deleteMany({
            _id: { $in: generatedOfferIds },
            owner: player._id,
            status: "for_sale",
            source: "art collector",
          }),
        );
      }
      if (reservedTarget) {
        cleanup.push(
          database.collection<GameItem>("items").updateOne(
            {
              _id: reservedTarget._id,
              owner: player._id,
              status: "collector_pending",
            },
            { $set: { status: "claimed" } },
          ),
        );
      } else if (removedTarget) {
        cleanup.push(
          database.collection<GameItem>("items").insertOne({
            ...removedTarget,
            status: "claimed",
          }),
        );
      }
      await Promise.all(cleanup);
      console.error("Unable to complete Art Collector interaction", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The Art Collector interaction failed.",
        },
        { status: 500 },
      );
    }
  }

  // TODO AI: When the Art Expert roll-count reduction interaction is ported,
  // its legendary bonus should also reroll one random attribute for free.
  return NextResponse.json({
    status: "ok",
    message: `You met ${npc.npc_name}. Their full interaction will be added as NPC rewards are ported.`,
  });
}

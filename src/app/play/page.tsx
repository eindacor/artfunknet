import { notFound, redirect } from "next/navigation";

import { getCardStyleInventory } from "@/components/item-cards/catalog";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import {
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  type PlayerArtworkArchive,
} from "@/server/archive-gameplay";
import { ensureArchiveStorage } from "@/server/archive-storage";
import { getArtHistorianQuestViews } from "@/server/art-historian-gameplay";
import {
  calculateGalleryRates,
  getXpGoal,
  settleGalleryEarnings,
} from "@/server/collection-gameplay";
import {
  getPurchasableCrateOffers,
  getVisibleCrateOffers,
} from "@/server/crate-gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import {
  getAuthenticationPermission,
  getPlayerFacingRedemptionPermission,
  sanitizePlayerFacingAuthenticity,
  settlePendingForgeryLiability,
} from "@/server/forgery-gameplay";
import { getDatabase } from "@/server/mongodb";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import type { GameItem, ItemAttribute, LootData } from "@/server/gameplay";
import {
  hydrateGameItems,
  hydratePlayerArtworkArchives,
} from "@/server/item-artwork";
import { getPlayerFacingArchivePermission } from "@/server/item-permissions";
import { PRESERVATIONIST_ATTRIBUTE_ID } from "@/server/item-leveling";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getSeasonalArtworkSelections } from "@/server/seasonal-artwork";
import {
  ensureRaffleState,
  settleRaffleIfDue,
  type RaffleEntry,
  type RaffleState,
} from "@/server/raffle-gameplay";
import {
  getGalleryNpcs,
  refreshNpcSpawns,
  type NpcQuality,
} from "@/server/npc-gameplay";
import { ensurePlayerKarma, normalizeKarmaBalance } from "@/server/karma";
import {
  createPlayerNotification,
  getPlayerNotifications,
} from "@/server/player-notifications";
import { getPlayerAuctionEscrow } from "@/server/auction-gameplay";
import { getPublicItemView } from "@/server/public-showcase";
import { settlePlayerItemRepairs } from "@/server/preservationist-gameplay";
import { getAdminSession, requirePlayer } from "@/server/session";

import GameDashboard from "./game-dashboard";
import PlayerHeader from "./player-header";

type Player = {
  _id: string;
  active: boolean;
  email: string;
  screen_name: string;
  test_account?: boolean;
  oauth_screen_name_pending?: boolean;
  patreon?: {
    is_supporter?: boolean;
    tier_name?: string | null;
  };
  profile: {
    bank_balance: number;
    level: number;
    xp: number;
    lottery_tickets: number;
    entry_fee: string;
    last_drop: string;
    inventory_cap: number;
    expansion_slots?: number;
    display_cap: number;
    pc_cap?: number;
    repairing_cap?: number;
    auction_cap: number;
    completed_quests?: number;
    karma?: number;
    tutorial_data: {
      current_tutorial?: string;
      step: number;
    };
    card_style_consumables?: Record<string, number>;
    npcs_met?: Partial<Record<NpcQuality, number>>;
    market_expert?: { expiration?: string };
  };
};

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string | string[] }>;
}) {
  const [session, query] = await Promise.all([
    requirePlayer(),
    searchParams,
  ]);
  const linkedItemId =
    typeof query.item === "string" ? query.item.trim() : "";
  const database = await getDatabase();
  const playerStatus = await database
    .collection<
      Pick<Player, "_id" | "active" | "oauth_screen_name_pending">
    >("players")
    .findOne({ _id: session.playerId });
  if (!playerStatus) {
    notFound();
  }
  if (playerStatus.active !== true) {
    return (
      <main className="deactivated-account-message">
        this account has been de-activated
      </main>
    );
  }
  if (playerStatus.oauth_screen_name_pending === true) {
    redirect("/play/onboarding");
  }
  await ensurePlayerKarma(database, session.playerId);
  await removeExpiredTransientItems(database);
  await ensureArchiveStorage(database);
  await settlePendingForgeryLiability(database, session.playerId);
  const settings = await getGameplaySettings(database);
  const cardRendererSettings = await getCardRendererSettings(database);
  const config = settings.active;
  const lootMetadata = await database
    .collection<{ _id: string; loot_data: LootData }>("metadata")
    .findOne({ _id: "loot-data" });
  if (!lootMetadata) {
    throw new Error("Loot metadata is unavailable.");
  }
  let raffleState: RaffleState;
  try {
    raffleState = await settleRaffleIfDue(database, config);
  } catch (error) {
    console.error("Unable to settle scheduled lottery drawing", error);
    raffleState = await ensureRaffleState(database, config);
  }
  try {
    const repairSettlement = await settlePlayerItemRepairs(
      database,
      session.playerId,
      config,
      new Date(),
    );
    if (repairSettlement.completedItems > 0) {
      await createPlayerNotification(database, session.playerId, {
        kind: "success",
        message: `${repairSettlement.completedItems} ${
          repairSettlement.completedItems === 1 ? "repair" : "repairs"
        } completed${
          repairSettlement.karma > 0
            ? ` and generated ${repairSettlement.karma.toLocaleString()} Karma`
            : ""
        }.`,
        dedupeUnread: false,
      });
    }
  } catch (error) {
    console.error("Unable to settle player item repairs", error);
  }
  await settleGalleryEarnings(
    database,
    session.playerId,
    config,
    new Date(),
  );
  const galleryMetadata = await refreshGalleryMetadata(
    database,
    session.playerId,
  );
  const player = await database
    .collection<Player>("players")
    .findOne({ _id: session.playerId, active: true });

  if (!player) {
    notFound();
  }
  const linkedItem = linkedItemId
    ? await getPublicItemView(database, linkedItemId, player._id)
    : null;
  const adminSession = player.test_account ? await getAdminSession() : null;
  const impersonating = Boolean(adminSession && player.test_account);
  const [raffleRewardDocuments, raffleEntries] = await Promise.all([
    database
      .collection<GameItem>("items")
      .find({
        _id: { $in: raffleState.prizes.map((prize) => prize.item_id) },
      })
      .toArray(),
    database
      .collection<RaffleEntry>("raffle_entries")
      .find({ player_id: player._id })
      .toArray(),
  ]);
  const raffleRewards = await hydrateGameItems(
    database,
    raffleRewardDocuments.map((item) =>
      sanitizePlayerFacingAuthenticity(item, true),
    ),
  );
  const raffleRewardById = new Map(
    raffleRewards.map((item) => [item._id, item]),
  );
  const raffleTotals = await database
    .collection<RaffleEntry>("raffle_entries")
    .aggregate<{ _id: string; total: number }>([
      {
        $match: {
          item_id: {
            $in: raffleState.prizes.map((prize) => prize.item_id),
          },
        },
      },
      { $group: { _id: "$item_id", total: { $sum: "$tickets" } } },
    ])
    .toArray();
  const raffleTotalByItem = new Map(
    raffleTotals.map((total) => [total._id, total.total]),
  );
  const raffleEntryByItem = new Map(
    raffleEntries.map((entry) => [entry.item_id, entry.tickets]),
  );
  const rafflePrizes = raffleState.prizes.map((prize) => {
    const item = raffleRewardById.get(prize.item_id);
    if (!item) {
      throw new Error(`Lottery item ${prize.item_id} is unavailable.`);
    }
    return {
      item: JSON.parse(JSON.stringify(item)),
      potency: prize.potency,
      allocatedTickets: raffleEntryByItem.get(prize.item_id) ?? 0,
      totalTickets: raffleTotalByItem.get(prize.item_id) ?? 0,
    };
  });
  const crateOffers = getVisibleCrateOffers(
    await getPurchasableCrateOffers(
      database,
      player.profile.level,
      config,
      player.test_account === true,
    ),
    player.profile.level,
  ).map((offer) => ({
    id: offer.id,
    name: offer.name,
    quality: offer.quality,
    description: offer.description,
    highlights: offer.highlights,
    itemCount: offer.itemCount,
    cost: offer.cost,
    levelRequirement: offer.levelRequirement,
  }));

  const consignedAuctions = await database
    .collection<{ item_id: string }>("auctions")
    .find({ seller_id: player._id })
    .project<{ item_id: string }>({ item_id: 1 })
    .toArray();
  const consignedItemIds = consignedAuctions.map((auction) => auction.item_id);
  const rawItems = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      $or: [
        { status: { $in: ["unclaimed", "for_sale", "claimed", "displayed"] } },
        { _id: { $in: consignedItemIds }, status: "auctioned" },
      ],
    })
    .sort({ date_created: -1 })
    .toArray();
  const inventorySlotsUsed = await database
    .collection<GameItem>("items")
    .countDocuments({
      owner: player._id,
      $or: [
        { status: { $in: ["claimed", "displayed"] } },
        { _id: { $in: consignedItemIds }, status: "auctioned" },
      ],
      original: { $ne: true },
      vintage: { $ne: true },
    });
  const rawArchives = await database
    .collection<PlayerArtworkArchive>("player_artwork_archives")
    .find({ owner: player._id })
    .sort({ updated_at: -1 })
    .toArray();
  const archiveByArtwork = new Map(
    rawArchives.map((archive) => [archive.artwork_id, archive]),
  );
  const items = (await hydrateGameItems(database, rawItems)).map((item) => {
    const archive = archiveByArtwork.get(item.artwork_id);
    const archivedCategories = archive
      ? getArchiveRecordModifiers(archive)
      : [];
    const archivedArtStyles = archive
      ? getArchiveRecordArtStyles(archive)
      : [];
    const archivePermission = getPlayerFacingArchivePermission(
      item,
      archivedCategories,
      archivedArtStyles,
    );
    return {
      ...item,
      archivePermission,
      authenticationPermission: getAuthenticationPermission(item, player._id),
      redemptionPermission: getPlayerFacingRedemptionPermission(
        item,
        player._id,
      ),
      archivedArtStyles,
      archivedCategories,
    };
  });
  const archives = await hydratePlayerArtworkArchives(database, rawArchives);
  const displayedItems = items.filter((item) => item.status === "displayed");
  const galleryRates = await calculateGalleryRates(
    database,
    player.profile.level,
    displayedItems,
    new Date(),
    config,
  );
  await refreshNpcSpawns(database, new Date(), config.npcSpawnIntervalMinutes);
  const legendaryAttributeIds = [
    ...new Set(
      [
        ...items.flatMap((item) => item.artwork.unique_attributes ?? []),
        ...(linkedItem?.item.artwork.unique_attributes ?? []),
      ],
    ),
  ];
  const [
    npcs,
    notifications,
    npcSpawnAttributes,
    legendaryAttributes,
    quests,
    auctionEscrow,
  ] =
    await Promise.all([
    getGalleryNpcs(database, player._id),
    getPlayerNotifications(database, player._id),
    impersonating
      ? database
          .collection<ItemAttribute>("attributes")
          .find({ active: true })
          .sort({ npc_name: 1 })
          .toArray()
      : Promise.resolve([]),
    getLegendaryAttributes(database, legendaryAttributeIds),
    getArtHistorianQuestViews(database, player._id),
    getPlayerAuctionEscrow(database, player._id),
  ]);
  const displayedLegendaryIds = new Set(
    displayedItems
      .map((item) => item.active_unique_attribute)
      .filter((id): id is string => Boolean(id)),
  );
  const rerollDiscount = legendaryAttributes.find(
    (attribute) =>
      displayedLegendaryIds.has(attribute._id) &&
      attribute.active &&
      attribute.code === "REROLL_DISCOUNT",
  );
  const rerollCostMultiplier =
    typeof rerollDiscount?.parameters.cost_multiplier === "number"
      ? rerollDiscount.parameters.cost_multiplier
      : 1;
  const levelUpDiscount = legendaryAttributes.find(
    (attribute) =>
      displayedLegendaryIds.has(attribute._id) &&
      attribute.active &&
      attribute.code === "LEVEL_UP_COST_REDUCTION",
  );
  const levelUpDiscountAvailable = Boolean(
    levelUpDiscount &&
      npcs.some(
        (npc) => npc.attribute_id === PRESERVATIONIST_ATTRIBUTE_ID,
      ),
  );
  const levelUpConditionMinimum =
    typeof levelUpDiscount?.parameters.condition_minimum === "number"
      ? levelUpDiscount.parameters.condition_minimum
      : 0.8;
  const dealerDiscount = legendaryAttributes.find(
    (attribute) =>
      displayedLegendaryIds.has(attribute._id) &&
      attribute.active &&
      attribute.code === "DEALER_DISCOUNT",
  );
  const dealerPriceMultiplier =
    typeof dealerDiscount?.parameters.cost_multiplier === "number"
      ? dealerDiscount.parameters.cost_multiplier
      : 1;
  const canRerollDisplayed = false;

  return (
    <div className="game-shell">
      <PlayerHeader
        auctionEscrow={auctionEscrow}
        bankBalance={player.profile.bank_balance}
        initialNotifications={notifications}
        impersonating={impersonating}
      />
      <GameDashboard
        archiveArtStyleIds={cardRendererSettings.activeRendererIds.filter(
          (rendererId) => rendererId !== "museum",
        )}
        archives={JSON.parse(JSON.stringify(archives))}
        forgePricing={{
          lootData: JSON.parse(JSON.stringify(lootMetadata.loot_data)),
          mintValueMultiplier: config.mintValueMultiplier,
          seasonalArtworkIds: Object.values(
            getSeasonalArtworkSelections(lootMetadata.loot_data),
          ).filter((artworkId): artworkId is string => Boolean(artworkId)),
        }}
        crateOffers={crateOffers}
        raffle={{
          availableTickets: player.profile.lottery_tickets,
          nextDrawAt: raffleState.next_draw_at,
          previousWinners: raffleState.previous_winners,
          prizes: rafflePrizes,
        }}
        dailyDropCooldownMinutes={config.dailyDropCooldownMinutes}
        dailyDropCount={config.dailyDropCount}
        debugEnabled={settings.debugEnabled}
        dealerPriceMultiplier={dealerPriceMultiplier}
        items={items.map((item) => ({
          ...JSON.parse(JSON.stringify(sanitizePlayerFacingAuthenticity(item))),
          reroll_cost: Math.max(
            0,
            Math.floor(item.reroll_cost * rerollCostMultiplier),
          ),
        }))}
        galleryRates={galleryRates}
        galleryMetadata={
          galleryMetadata
            ? JSON.parse(JSON.stringify(galleryMetadata))
            : null
        }
        impersonating={impersonating}
        canRerollDisplayed={canRerollDisplayed}
        levelUpDiscountAvailable={levelUpDiscountAvailable}
        levelUpConditionMinimum={levelUpConditionMinimum}
        legendaryAttributes={legendaryAttributes.map((attribute) => ({
          id: attribute._id,
          title: attribute.title,
          description: attribute.description,
          flavorText: attribute.flavor_text,
          code: attribute.code,
          active: attribute.active,
        }))}
        npcSpawnOptions={npcSpawnAttributes.map((attribute) => ({
          id: attribute._id,
          icon: attribute.icon,
          name: attribute.npc_name,
        }))}
        npcSpawnIntervalMinutes={config.npcSpawnIntervalMinutes}
        npcs={npcs.map((npc) => ({
          ...JSON.parse(JSON.stringify(npc)),
          alreadyMet: npc.players_met.includes(player._id),
        }))}
        quests={quests}
        playerId={player._id}
        marketExpertExpiration={
          player.profile.market_expert?.expiration ?? null
        }
        linkedItem={
          linkedItem
            ? JSON.parse(JSON.stringify(linkedItem))
            : null
        }
        player={{
          screenName: player.screen_name,
          bankBalance: player.profile.bank_balance,
          level: player.profile.level,
          isMaxLevel: player.profile.level >= 50,
          xp: player.profile.xp,
          raffleTickets: player.profile.lottery_tickets,
          inventoryCap:
            player.profile.inventory_cap +
            (player.profile.expansion_slots ?? 0),
          inventorySlotsUsed,
          lastDrop: player.profile.last_drop,
          displayCap: player.profile.display_cap,
          repairingCap: player.profile.repairing_cap ?? 4,
          xpGoal: getXpGoal(player.profile.level),
          npcsMet: player.profile.npcs_met ?? {},
          karma: normalizeKarmaBalance(player.profile.karma),
          cardStyleInventory: getCardStyleInventory(
            player.profile.card_style_consumables,
          ),
          completedQuests: player.profile.completed_quests ?? 0,
        }}
      />
    </div>
  );
}

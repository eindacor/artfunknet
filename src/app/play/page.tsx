import { notFound } from "next/navigation";

import { getCardStyleInventory } from "@/components/item-cards/catalog";
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
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import type { GameItem, ItemAttribute } from "@/server/gameplay";
import {
  hydrateGameItems,
  hydratePlayerArtworkArchives,
} from "@/server/item-artwork";
import { getArchivePermission } from "@/server/item-permissions";
import { PRESERVATIONIST_ATTRIBUTE_ID } from "@/server/item-leveling";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import {
  getGalleryNpcs,
  refreshNpcSpawns,
  type NpcQuality,
} from "@/server/npc-gameplay";
import {
  createPlayerNotification,
  getPlayerNotifications,
} from "@/server/player-notifications";
import { settlePlayerItemRepairs } from "@/server/preservationist-gameplay";
import { getAdminSession, requirePlayer } from "@/server/session";

import GameDashboard from "./game-dashboard";
import PlayerHeader from "./player-header";

type Player = {
  _id: string;
  email: string;
  screen_name: string;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    level: number;
    xp: number;
    lottery_tickets: number;
    entry_fee: string;
    last_drop: string;
    inventory_cap: number;
    expansion_slots?: number;
    vintage_count?: number;
    display_cap: number;
    pc_cap?: number;
    repairing_cap?: number;
    auction_cap: number;
    completed_quests?: number;
    knowledge: Record<string, number>;
    tutorial_data: {
      current_tutorial?: string;
      step: number;
    };
    card_style_consumables?: Record<string, number>;
    npcs_met?: Partial<Record<NpcQuality, number>>;
  };
};

export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const session = await requirePlayer();
  const database = await getDatabase();
  await ensureArchiveStorage(database);
  const settings = await getGameplaySettings(database);
  const config = settings.active;
  try {
    const repairSettlement = await settlePlayerItemRepairs(
      database,
      session.playerId,
      new Date(),
    );
    if (repairSettlement.completedItems > 0) {
      const knowledgeSummary = Object.entries(
        repairSettlement.knowledge,
      ).flatMap(([type, amount]) =>
        amount > 0
          ? [`${amount} ${type.replaceAll("_", " ")}`]
          : [],
      ).join(", ");
      await createPlayerNotification(database, session.playerId, {
        kind: "success",
        message: `${repairSettlement.completedItems} ${
          repairSettlement.completedItems === 1 ? "repair" : "repairs"
        } completed${
          knowledgeSummary ? ` and generated ${knowledgeSummary}` : ""
        }.`,
        dedupeUnread: false,
      });
    }
  } catch (error) {
    console.error("Unable to settle player item repairs", error);
  }
  const payout = await settleGalleryEarnings(
    database,
    session.playerId,
    config,
    new Date(),
  );
  if (payout.intervals > 0 && (payout.money > 0 || payout.xp > 0)) {
    await createPlayerNotification(database, session.playerId, {
      kind: "success",
      message: `Gallery earnings: +$${payout.money.toLocaleString()} and +${payout.xp.toLocaleString()}xp.`,
      dedupeUnread: false,
    });
  }
  const player = await database
    .collection<Player>("players")
    .findOne({ _id: session.playerId });

  if (!player) {
    notFound();
  }
  const adminSession = player.test_account ? await getAdminSession() : null;
  const impersonating = Boolean(adminSession && player.test_account);

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
    const archivePermission = getArchivePermission(
      item,
      archivedCategories,
      archivedArtStyles,
    );
    return {
      ...item,
      archivePermission,
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
      items.flatMap((item) => item.artwork.unique_attributes ?? []),
    ),
  ];
  const [
    npcs,
    notifications,
    npcSpawnAttributes,
    legendaryAttributes,
    quests,
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
        bankBalance={player.profile.bank_balance}
        impersonating={impersonating}
        screenName={player.screen_name}
        xp={player.profile.xp}
      />
      <GameDashboard
        archives={JSON.parse(JSON.stringify(archives))}
        dailyDropCooldownMinutes={config.dailyDropCooldownMinutes}
        debugEnabled={settings.debugEnabled}
        dealerPriceMultiplier={dealerPriceMultiplier}
        items={items.map((item) => ({
          ...JSON.parse(JSON.stringify(item)),
          reroll_cost: Math.max(
            0,
            Math.floor(item.reroll_cost * rerollCostMultiplier),
          ),
        }))}
        galleryRates={galleryRates}
        initialNotifications={notifications}
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
        npcs={npcs.map((npc) => ({
          ...JSON.parse(JSON.stringify(npc)),
          alreadyMet: npc.players_met.includes(player._id),
        }))}
        quests={quests}
        player={{
          screenName: player.screen_name,
          bankBalance: player.profile.bank_balance,
          level: player.profile.level,
          xp: player.profile.xp,
          lotteryTickets: player.profile.lottery_tickets,
          inventoryCap:
            player.profile.inventory_cap +
            (player.profile.expansion_slots ?? 0) +
            (player.profile.vintage_count ?? 0) * 2,
          inventorySlotsUsed,
          lastDrop: player.profile.last_drop,
          displayCap: player.profile.display_cap,
          repairingCap: player.profile.repairing_cap ?? 4,
          xpGoal: getXpGoal(player.profile.level),
          npcsMet: player.profile.npcs_met ?? {},
          knowledge: {
            historical_data:
              player.profile.knowledge.historical_data ?? 0,
            contextual_understanding:
              player.profile.knowledge.contextual_understanding ?? 0,
            technical_comprehension:
              player.profile.knowledge.technical_comprehension ?? 0,
            artistic_vision:
              player.profile.knowledge.artistic_vision ?? 0,
          },
          cardStyleInventory: getCardStyleInventory(
            player.profile.card_style_consumables,
          ),
          completedQuests: player.profile.completed_quests ?? 0,
        }}
      />
    </div>
  );
}

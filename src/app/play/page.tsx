import { notFound } from "next/navigation";

import {
  calculateGalleryRates,
  getXpGoal,
  settleGalleryEarnings,
} from "@/server/collection-gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import type { GameItem, ItemAttribute } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import {
  getLegendaryAttributes,
  MARKETING_MANAGER_ATTRIBUTE_ID,
} from "@/server/legendary-attributes";
import {
  getGalleryNpcs,
  refreshNpcSpawns,
  type NpcQuality,
} from "@/server/npc-gameplay";
import {
  createPlayerNotification,
  getPlayerNotifications,
} from "@/server/player-notifications";
import { getAdminSession, requirePlayer } from "@/server/session";
import { getCardRendererSettings } from "@/server/card-renderer-settings";

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
    display_cap: number;
    auction_cap: number;
    knowledge: Record<string, number>;
    tutorial_data: {
      current_tutorial?: string;
      step: number;
    };
    card_renderer?: string;
    owned_card_renderers?: string[];
    npcs_met?: Partial<Record<NpcQuality, number>>;
  };
};

export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const session = await requirePlayer();
  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const config = settings.active;
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

  const rawItems = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      status: { $in: ["unclaimed", "for_sale", "claimed", "displayed"] },
    })
    .sort({ date_created: -1 })
    .toArray();
  const items = await hydrateGameItems(database, rawItems);
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
    rendererSettings,
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
    getCardRendererSettings(database),
  ]);
  const displayedLegendaryIds = new Set(
    displayedItems
      .map((item) => item.active_unique_attribute)
      .filter((id): id is string => Boolean(id)),
  );
  const displayedLegendaryCodes = new Set(
    legendaryAttributes
      .filter(
        (attribute) =>
          attribute.active && displayedLegendaryIds.has(attribute._id),
      )
      .map((attribute) => attribute.code),
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
  const canRerollDisplayed =
    displayedLegendaryCodes.has("REROLL_DISPLAY_ENABLE") &&
    npcs.some(
      (npc) => npc.attribute_id === MARKETING_MANAGER_ATTRIBUTE_ID,
    );

  return (
    <div className="game-shell">
      <PlayerHeader
        bankBalance={player.profile.bank_balance}
        impersonating={impersonating}
        screenName={player.screen_name}
        xp={player.profile.xp}
      />
      <GameDashboard
        activeRendererIds={rendererSettings.activeRendererIds}
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
        player={{
          screenName: player.screen_name,
          bankBalance: player.profile.bank_balance,
          level: player.profile.level,
          xp: player.profile.xp,
          lotteryTickets: player.profile.lottery_tickets,
          inventoryCap: player.profile.inventory_cap,
          lastDrop: player.profile.last_drop,
          displayCap: player.profile.display_cap,
          xpGoal: getXpGoal(player.profile.level),
          npcsMet: player.profile.npcs_met ?? {},
          cardRenderer: player.profile.card_renderer,
          ownedCardRenderers:
            player.profile.owned_card_renderers ?? [],
        }}
      />
    </div>
  );
}

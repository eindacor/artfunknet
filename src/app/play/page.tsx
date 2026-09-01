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
  getGalleryNpcs,
  refreshNpcSpawns,
  type NpcQuality,
} from "@/server/npc-gameplay";
import {
  createPlayerNotification,
  getPlayerNotifications,
} from "@/server/player-notifications";
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
    display_cap: number;
    auction_cap: number;
    knowledge: Record<string, number>;
    tutorial_data: {
      current_tutorial?: string;
      step: number;
    };
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
      status: { $in: ["unclaimed", "claimed", "displayed"] },
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
  const [npcs, notifications, npcSpawnAttributes] = await Promise.all([
    getGalleryNpcs(database, player._id),
    getPlayerNotifications(database, player._id),
    impersonating
      ? database
          .collection<ItemAttribute>("attributes")
          .find({ active: true })
          .sort({ npc_name: 1 })
          .toArray()
      : Promise.resolve([]),
  ]);

  return (
    <div className="game-shell">
      <PlayerHeader
        bankBalance={player.profile.bank_balance}
        impersonating={impersonating}
        screenName={player.screen_name}
        xp={player.profile.xp}
      />
      <GameDashboard
        dailyDropCooldownMinutes={config.dailyDropCooldownMinutes}
        debugEnabled={settings.debugEnabled}
        items={items.map((item) => JSON.parse(JSON.stringify(item)))}
        galleryRates={galleryRates}
        initialNotifications={notifications}
        impersonating={impersonating}
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
        }}
      />
    </div>
  );
}

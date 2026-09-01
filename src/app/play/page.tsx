import { notFound } from "next/navigation";

import {
  calculateGalleryRates,
  getXpGoal,
  settleGalleryEarnings,
} from "@/server/collection-gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import type { GameItem } from "@/server/gameplay";
import { requirePlayer } from "@/server/session";

import GameDashboard from "./game-dashboard";
import PlayerHeader from "./player-header";

type Player = {
  _id: string;
  email: string;
  screen_name: string;
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
  };
};

export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const session = await requirePlayer();
  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const payout = await settleGalleryEarnings(
    database,
    session.playerId,
    new Date(),
    settings.galleryPayoutIntervalMinutes,
  );
  const player = await database
    .collection<Player>("players")
    .findOne({ _id: session.playerId });

  if (!player) {
    notFound();
  }

  const items = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      status: { $in: ["unclaimed", "claimed", "displayed"] },
    })
    .sort({ date_created: -1 })
    .toArray();
  const displayedItems = items.filter((item) => item.status === "displayed");
  const galleryRates = await calculateGalleryRates(
    database,
    player.profile.level,
    displayedItems,
    new Date(),
  );

  return (
    <div className="game-shell">
      <PlayerHeader
        bankBalance={player.profile.bank_balance}
        screenName={player.screen_name}
        xp={player.profile.xp}
      />
      <GameDashboard
        dailyDropCooldownMinutes={settings.dailyDropCooldownMinutes}
        items={items.map((item) => JSON.parse(JSON.stringify(item)) as GameItem)}
        galleryRates={galleryRates}
        payout={payout}
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
        }}
      />
    </div>
  );
}

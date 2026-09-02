import { notFound } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
import { getAdminSession, requirePlayer } from "@/server/session";
import { getLegendaryAttributes } from "@/server/legendary-attributes";

import PlayerHeader from "../player-header";
import AuctionHouse from "./auction-house";

type Player = {
  _id: string;
  screen_name: string;
  active: boolean;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    xp: number;
    market_expert?: { expiration?: string };
  };
};

export const dynamic = "force-dynamic";

export default async function AuctionHousePage() {
  const session = await requirePlayer();
  const database = await getDatabase();
  const player = await database.collection<Player>("players").findOne({
    _id: session.playerId,
    active: true,
  });
  if (!player) notFound();
  const [adminSession, legendaryAttributes] = await Promise.all([
    player.test_account ? getAdminSession() : Promise.resolve(null),
    getLegendaryAttributes(database),
  ]);

  return (
    <div className="game-shell">
      <PlayerHeader
        bankBalance={player.profile.bank_balance}
        impersonating={Boolean(adminSession && player.test_account)}
        screenName={player.screen_name}
        xp={player.profile.xp}
      />
      <AuctionHouse
        initialBankBalance={player.profile.bank_balance}
        legendaryAttributes={legendaryAttributes.map((attribute) => ({
          id: attribute._id,
          title: attribute.title,
          description: attribute.description,
          flavorText: attribute.flavor_text,
          code: attribute.code,
          active: attribute.active,
        }))}
        marketExpertExpiration={player.profile.market_expert?.expiration ?? null}
        playerId={player._id}
      />
    </div>
  );
}

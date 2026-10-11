import { NextResponse } from "next/server";

import { getPlayerAuctionEscrow } from "@/server/auction-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  resolvePlayerSupporterStatus,
  type SupporterStatusPlayer,
} from "@/server/supporter-status";

type PlayerAccount = SupporterStatusPlayer & {
  profile: {
    bank_balance: number;
    lottery_tickets: number;
  };
};

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const [player, auctionEscrow] = await Promise.all([
    database.collection<PlayerAccount>("players").findOne(
      { _id: auth.session.playerId, active: true },
      {
        projection: {
          "profile.bank_balance": 1,
          "profile.lottery_tickets": 1,
          supporter: 1,
          "patreon.is_supporter": 1,
          "patreon.requires_reauthorization": 1,
          "patreon.tier_name": 1,
          "patreon.tiers.title": 1,
        },
      },
    ),
    getPlayerAuctionEscrow(database, auth.session.playerId),
  ]);

  if (!player) {
    return NextResponse.json(
      { error: "The player account could not be found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    auctionEscrow,
    bankBalance: player.profile.bank_balance,
    lotteryTickets: player.profile.lottery_tickets,
    supporterStatus: resolvePlayerSupporterStatus(player),
  });
}

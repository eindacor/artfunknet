import LiveAuctionBroadcast from "./live-auction-broadcast";

import { getLiveAuctionBroadcastView } from "@/server/live-auction-broadcast";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function LiveAuctionBroadcastPage() {
  const database = await getDatabase();
  const view = await getLiveAuctionBroadcastView(database);

  return (
    <LiveAuctionBroadcast
      initialView={JSON.parse(JSON.stringify(view))}
    />
  );
}

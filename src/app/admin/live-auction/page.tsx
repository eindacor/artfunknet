import LiveAuctionAdmin from "./live-auction-admin";

import { getLiveAuctionAdminView } from "@/server/live-auction-event";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function LiveAuctionAdminPage() {
  const view = await getLiveAuctionAdminView(await getDatabase());

  return (
    <main className="admin-tools">
      <h1>Live auction</h1>
      <p>
        Prepare the weekly stream, reveal each item, and accept the winning
        bid. Player bidding is available on Wednesday.
      </p>
      <LiveAuctionAdmin
        initialView={JSON.parse(JSON.stringify(view))}
      />
    </main>
  );
}

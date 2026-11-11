import ForgeryContestAdmin from "./forgery-contest-admin";

import { getForgeryContestAdminView } from "@/server/forgery-contest";
import type { Artwork } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requireAdmin } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ForgeryContestAdminPage() {
  await requireAdmin();
  const database = await getDatabase();
  const [contest, artworks] = await Promise.all([
    getForgeryContestAdminView(database),
    database.collection<Artwork>("artworks").find({ active: true })
      .project<Artwork>({ market_data: 0 }).sort({ rarity: 1, artist: 1, title: 1 }).toArray(),
  ]);

  return (
    <main className="admin-tools">
      <h1>Duper Tuesday</h1>
      <ForgeryContestAdmin
        artworks={JSON.parse(JSON.stringify(artworks))}
        bufferPrizes={JSON.parse(JSON.stringify(contest.bufferPrizes))}
        minimumBufferCount={contest.minimumBufferCount}
        nextSettlementAt={contest.nextSettlementAt}
        prizes={JSON.parse(JSON.stringify(contest.prizes))}
      />
    </main>
  );
}

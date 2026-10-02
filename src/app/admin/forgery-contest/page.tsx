import ForgeryContestAdmin from "./forgery-contest-admin";

import { getForgeryContestAdminView } from "@/server/forgery-contest";
import { getDatabase } from "@/server/mongodb";
import { requireAdmin } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ForgeryContestAdminPage() {
  await requireAdmin();
  const contest = await getForgeryContestAdminView(await getDatabase());

  return (
    <main className="admin-tools">
      <h1>Forgery Contest</h1>
      <ForgeryContestAdmin
        nextSettlementAt={contest.nextSettlementAt}
        prizes={JSON.parse(JSON.stringify(contest.prizes))}
      />
    </main>
  );
}

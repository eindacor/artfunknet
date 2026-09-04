import {
  getGalleryChatReports,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";

import ChatReportList from "./chat-report-list";

export const dynamic = "force-dynamic";

export default async function ChatReportsAdminPage() {
  const reports = await getGalleryChatReports(await getDatabase());
  return (
    <main className="admin-tools">
      <h1>Chat reports</h1>
      <section>
        <h2>Reported gallery messages</h2>
        <p>
          Reported messages do not expire automatically. Hide messages that
          should no longer be visible in gallery chat.
        </p>
        <ChatReportList reports={reports} />
      </section>
    </main>
  );
}

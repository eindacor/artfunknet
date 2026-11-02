import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@/server/mongodb";
import { getPlayerSession } from "@/server/session";
import type { ArtistApplication } from "@/server/artist-types";
import ArtistApplicationForm from "./application-form";

export const dynamic = "force-dynamic";

export default async function ArtistApplicationPage() {
  const session = await getPlayerSession();
  const database = await getDatabase();
  const player = session ? await database.collection<{
    _id: string; artist_id?: string; email: string; screen_name: string;
  }>("players").findOne({ _id: session.playerId, active: true }, {
    projection: { artist_id: 1, email: 1, screen_name: 1 },
  }) : null;
  if (player?.artist_id) redirect("/artist");
  const pending = session ? await database.collection<ArtistApplication>("artist_applications")
    .findOne({ player_id: session.playerId, status: { $in: ["pending", "approving"] } }, { projection: { _id: 1 } }) : null;
  const now = new Date();
  const cutoffYear = now.getUTCFullYear() - 18;
  const cutoffMonth = now.getUTCMonth();
  const cutoffDay = Math.min(now.getUTCDate(), new Date(Date.UTC(cutoffYear, cutoffMonth + 1, 0)).getUTCDate());
  const latestBirthDate = new Date(Date.UTC(cutoffYear, cutoffMonth, cutoffDay)).toISOString().slice(0, 10);
  return <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-6 py-12">
    <Link className="font-bold text-[var(--accent)]" href={session ? "/play/account" : "/play/login"}>artfunkel</Link>
    <header className="space-y-3">
      <h1 className="text-4xl font-bold">Become a contributing artist</h1>
      <p className="text-[var(--muted)]">Bring your work into artfunkel. Applicants must be 18 or older. An administrator reviews your portfolio before granting artist access.</p>
    </header>
    <ArtistApplicationForm existingPlayer={player ? { email: player.email, screenName: player.screen_name } : null}
      latestBirthDate={latestBirthDate} pending={Boolean(pending)} />
    <p className="text-sm text-[var(--muted)]"><Link className="underline" href="/privacy">Privacy policy</Link>{" | "}
      <Link className="underline" href="/data-deletion">Data deletion</Link></p>
  </main>;
}

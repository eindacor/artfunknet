import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
import { requirePlayer } from "@/server/session";

import AccountForm from "./account-form";

type PlayerAccount = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  password_salt?: string;
  password_hash?: string;
};

export const dynamic = "force-dynamic";

export default async function PlayerAccountPage() {
  const session = await requirePlayer();
  const player = await (await getDatabase())
    .collection<PlayerAccount>("players")
    .findOne({ _id: session.playerId, active: true });
  if (!player) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Link className="text-sm text-[var(--accent)] hover:underline" href="/play">
        ← Back to gallery
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Account</h1>
      <p className="mt-3 mb-8 text-[var(--muted)]">
        Manage the name shown to other players and your sign-in password.
      </p>
      <AccountForm
        email={player.email}
        hasPassword={Boolean(player.password_salt && player.password_hash)}
        screenName={player.screen_name}
      />
    </main>
  );
}

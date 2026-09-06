import { redirect } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
import { requirePlayer } from "@/server/session";

import PlayerNameForm from "./player-name-form";

type OAuthPlayer = {
  _id: string;
  active: boolean;
  screen_name: string;
  oauth_screen_name_pending?: boolean;
};

export const dynamic = "force-dynamic";

export default async function PlayerOnboardingPage() {
  const session = await requirePlayer();
  const player = await (await getDatabase())
    .collection<OAuthPlayer>("players")
    .findOne({ _id: session.playerId, active: true });

  if (!player?.oauth_screen_name_pending) {
    redirect("/play");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6">
      <div>
        <p className="game-title font-semibold text-[var(--accent)]">
          artfunkel
        </p>
        <h1 className="mt-6 text-3xl font-bold">Choose your player name</h1>
        <p className="mt-3 text-[var(--muted)]">
          This is how other collectors will see you. We generated a suggestion
          from your sign-in profile; keep it or choose another.
        </p>
      </div>
      <PlayerNameForm suggestedName={player.screen_name} />
    </main>
  );
}

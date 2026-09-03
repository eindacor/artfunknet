import { redirect } from "next/navigation";

import { getPlayerSession } from "@/server/session";

import PlayerLoginForm from "./player-login-form";

export default async function PlayerLoginPage() {
  if (await getPlayerSession()) {
    redirect("/play");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
          Artfunkel
        </p>
        <h1 className="mt-3 text-4xl font-bold">Player sign in</h1>
        <p className="mt-3 text-[var(--muted)]">
          Sign in with the development player or create an account with Google.
        </p>
      </div>
      <PlayerLoginForm />
    </main>
  );
}

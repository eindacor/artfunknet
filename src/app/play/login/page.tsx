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
        <p className="game-title font-semibold text-[var(--accent)]">
          artfunkel
        </p>
        <p className="mt-3 text-[var(--muted)]">
          Sign in with an existing account, create one with email and
          password, or use a supported identity provider.
        </p>
      </div>
      <PlayerLoginForm
        providers={{
          discord: Boolean(
            process.env.DISCORD_OAUTH_CLIENT_ID &&
              process.env.DISCORD_OAUTH_CLIENT_SECRET,
          ),
          google: Boolean(
            process.env.GOOGLE_OAUTH_CLIENT_ID &&
              process.env.GOOGLE_OAUTH_CLIENT_SECRET,
          ),
          microsoft: Boolean(
            process.env.MICROSOFT_OAUTH_CLIENT_ID &&
              process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
          ),
          steam: true,
        }}
      />
    </main>
  );
}

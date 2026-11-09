import { redirect } from "next/navigation";
import Link from "next/link";

import { getPlayerSession } from "@/server/session";
import { isOAuthProviderConfigured } from "@/server/oauth-player";
import { getOAuthMessage } from "@/server/oauth-providers";

import PlayerLoginForm from "./player-login-form";
import { getDatabase } from "@/server/mongodb";
import { getPlayerLandingPath } from "@/server/artist-types";

export default async function PlayerLoginPage({ searchParams }: {
  searchParams: Promise<{ oauth?: string | string[]; provider?: string | string[]; mode?: string | string[] }>;
}) {
  const session = await getPlayerSession();
  if (session) {
    const player = await (await getDatabase()).collection<{ _id: string; artist_id?: string }>("players").findOne({ _id: session.playerId });
    redirect(getPlayerLandingPath(player ?? {}));
  }

  const params = await searchParams;
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
        initialRegistering={params.mode === "register"}
        message={getOAuthMessage(
          Array.isArray(params.oauth) ? params.oauth[0] : params.oauth,
          Array.isArray(params.provider) ? params.provider[0] : params.provider,
        )}
        providers={{
          discord: isOAuthProviderConfigured("discord"),
          google: isOAuthProviderConfigured("google"),
          microsoft: isOAuthProviderConfigured("microsoft"),
          // TODO: Re-enable Instagram login/account creation after its OAuth flow is debugged.
          instagram: false,
          steam: true,
        }}
      />
      <Link className="rounded-md border border-[var(--accent)] px-4 py-3 text-center font-bold text-[var(--accent)]" href="/artists/apply">Become a contributing artist</Link>
      <p className="text-sm text-[var(--muted)]">
        <Link className="underline" href="/privacy">Privacy policy</Link>
        {" | "}
        <Link className="underline" href="/data-deletion">Data deletion</Link>
      </p>
    </main>
  );
}

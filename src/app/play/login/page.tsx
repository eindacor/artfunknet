import { redirect } from "next/navigation";
import Link from "next/link";

import { getPlayerSession } from "@/server/session";
import { isOAuthProviderConfigured } from "@/server/oauth-player";
import { getOAuthMessage } from "@/server/oauth-providers";

import PlayerLoginForm from "./player-login-form";

export default async function PlayerLoginPage({ searchParams }: {
  searchParams: Promise<{ oauth?: string | string[]; provider?: string | string[] }>;
}) {
  if (await getPlayerSession()) {
    redirect("/play");
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
        message={getOAuthMessage(
          Array.isArray(params.oauth) ? params.oauth[0] : params.oauth,
          Array.isArray(params.provider) ? params.provider[0] : params.provider,
        )}
        providers={{
          discord: isOAuthProviderConfigured("discord"),
          google: isOAuthProviderConfigured("google"),
          microsoft: isOAuthProviderConfigured("microsoft"),
          instagram: isOAuthProviderConfigured("instagram"),
          steam: true,
        }}
      />
      <p className="text-sm text-[var(--muted)]">
        <Link className="underline" href="/privacy">Privacy policy</Link>
        {" | "}
        <Link className="underline" href="/data-deletion">Data deletion</Link>
      </p>
    </main>
  );
}

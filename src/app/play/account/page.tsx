import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
import { isPatreonIntegrationConfigured } from "@/server/patreon";
import { getPlayerViewSettings } from "@/server/player-view-settings";
import { requirePlayer } from "@/server/session";
import { isOAuthProviderConfigured } from "@/server/oauth-player";
import { getOAuthMessage, OAUTH_PROVIDERS } from "@/server/oauth-providers";
import type { OAuthPlayer } from "@/server/oauth-identity";

import AccountForm from "./account-form";

// TODO: Re-enable Microsoft account synchronization after its OAuth flow is debugged.
const ACCOUNT_OAUTH_PROVIDERS = OAUTH_PROVIDERS.filter(({ id }) => id !== "microsoft");

type PlayerAccount = {
  _id: string;
  email: string;
  email_verified?: boolean;
  google_sub?: string;
  oauth_accounts?: OAuthPlayer["oauth_accounts"];
  screen_name: string;
  active: boolean;
  artist_id?: string;
  password_salt?: string;
  password_hash?: string;
  patreon?: {
    email?: string | null;
    email_matches_player?: boolean | null;
    is_supporter?: boolean;
    tier_name?: string | null;
    tier_amount_cents?: number | null;
    checked_at?: Date | string;
    patreon_id?: string;
    requires_reauthorization?: boolean;
    oauth?: {
      encrypted_tokens?: string;
    };
  };
  profile?: {
    view_settings?: unknown;
  };
};

export const dynamic = "force-dynamic";

const PATREON_MESSAGES: Record<string, string> = {
  cancelled: "Patreon authorization was cancelled.",
  conflict: "That Patreon account is already linked to another player.",
  failed: "Patreon synchronization failed. Please try again.",
  invalid: "The Patreon authorization response could not be verified.",
  "not-configured": "Patreon synchronization is not configured.",
  updated: "Patreon membership synchronized.",
};

export default async function PlayerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ patreon?: string | string[]; oauth?: string | string[]; provider?: string | string[] }>;
}) {
  const session = await requirePlayer({ allowDeleting: true });
  const player = await (await getDatabase())
    .collection<PlayerAccount>("players")
    .findOne({ _id: session.playerId, active: true });
  if (!player) notFound();
  const params = await searchParams;
  const patreonResult = Array.isArray(params.patreon)
    ? params.patreon[0]
    : params.patreon;
  const checkedAt = player.patreon?.checked_at
    ? new Date(player.patreon.checked_at)
    : null;
  const hasStoredPatreonAuthorization = Boolean(
    player.patreon?.oauth?.encrypted_tokens,
  );
  const viewSettings = getPlayerViewSettings(player.profile?.view_settings);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Link className="text-sm text-[var(--accent)] hover:underline" href="/play">
        ← Back to gallery
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Account</h1>
      <p className="mt-3 mb-8 text-[var(--muted)]">
        Manage your player profile, connected accounts, display preferences, and
        sign-in password.
      </p>
      <section className="mb-6 space-y-3 rounded-lg border border-[var(--accent)]/40 bg-white/5 p-6">
        <h2 className="text-xl font-bold">Contributing artist</h2>
        <p className="text-sm text-[var(--muted)]">{player.artist_id
          ? "Manage your artist profile and submit artwork for review."
          : "Apply to share your own work in artfunkel while keeping your player account."}</p>
        <Link className="inline-block rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-black" href={player.artist_id ? "/artist" : "/artists/apply"}>
          {player.artist_id ? "Open Artist studio" : "Become a contributing artist"}
        </Link>
      </section>
      <AccountForm
        email={player.email}
        emailVerified={player.email_verified === true}
        enableReveals={viewSettings.enableReveals}
        showGalleryVisitors={viewSettings.showGalleryVisitors}
        hasPassword={Boolean(player.password_salt && player.password_hash)}
        oauthMessage={getOAuthMessage(
          Array.isArray(params.oauth) ? params.oauth[0] : params.oauth,
          Array.isArray(params.provider) ? params.provider[0] : params.provider,
        )}
        providers={ACCOUNT_OAUTH_PROVIDERS.map(({ id, name }) => {
          const account = player.oauth_accounts?.[id];
          const verifiedAt = account?.verified_at ? new Date(account.verified_at) : null;
          return {
            id, name, configured: isOAuthProviderConfigured(id),
            linked: Boolean(account?.id || (id === "google" && player.google_sub)),
            email: account?.email ?? null, emailVerified: account?.email_verified === true,
            verifiedAt: verifiedAt && Number.isFinite(verifiedAt.getTime()) ? verifiedAt.toISOString() : null,
          };
        })}
        patreon={{
          checkedAt:
            checkedAt && Number.isFinite(checkedAt.getTime())
              ? checkedAt.toISOString()
              : null,
          configured: isPatreonIntegrationConfigured(),
          email: player.patreon?.email ?? null,
          emailMatchesPlayer:
            player.patreon?.email_matches_player ?? null,
          isSupporter: player.patreon?.is_supporter === true,
          linked: Boolean(player.patreon?.patreon_id),
          message: patreonResult
            ? PATREON_MESSAGES[patreonResult] ?? null
            : null,
          requiresReauthorization:
            player.patreon?.requires_reauthorization === true ||
            (Boolean(player.patreon?.patreon_id) &&
              !hasStoredPatreonAuthorization),
          tierAmountCents:
            typeof player.patreon?.tier_amount_cents === "number"
              ? player.patreon.tier_amount_cents
              : null,
          tierName: player.patreon?.tier_name ?? null,
        }}
        screenName={player.screen_name}
      />
    </main>
  );
}

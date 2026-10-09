import Link from "next/link";
import { notFound } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
import { isPatreonIntegrationConfigured } from "@/server/patreon";
import { getPlayerViewSettings } from "@/server/player-view-settings";
import { requirePlayer } from "@/server/session";

import AccountForm from "./account-form";

type PlayerAccount = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
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
  searchParams: Promise<{ patreon?: string | string[] }>;
}) {
  const session = await requirePlayer();
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

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-12">
      <Link className="text-sm text-[var(--accent)] hover:underline" href="/play">
        ← Back to gallery
      </Link>
      <h1 className="mt-6 text-4xl font-bold">Account</h1>
      <p className="mt-3 mb-8 text-[var(--muted)]">
        Manage your player profile, connected accounts, view preferences, and
        sign-in password.
      </p>
      <AccountForm
        email={player.email}
        hasPassword={Boolean(player.password_salt && player.password_hash)}
        preferredGalleryView={
          getPlayerViewSettings(player.profile?.view_settings).galleryView
        }
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

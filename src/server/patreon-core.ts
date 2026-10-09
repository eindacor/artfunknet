import { normalizePlayerEmail } from "./player-account.ts";

export type PatreonTier = {
  id: string;
  title: string | null;
  amount_cents: number | null;
};

type PatreonResourceReference = {
  id: string;
  type: string;
};

type PatreonIncludedResource = PatreonResourceReference & {
  attributes?: {
    amount_cents?: number;
    currently_entitled_amount_cents?: number;
    email?: string;
    full_name?: string;
    patron_status?: string | null;
    title?: string;
  };
  relationships?: {
    campaign?: { data?: PatreonResourceReference | null };
    currently_entitled_tiers?: {
      data?: PatreonResourceReference[];
    };
  };
};

export type PatreonIdentityResponse = {
  data?: PatreonResourceReference & {
    attributes?: {
      email?: string;
      full_name?: string;
    };
    relationships?: {
      memberships?: { data?: PatreonResourceReference[] };
    };
  };
  included?: PatreonIncludedResource[];
};

export type PatreonMembershipSnapshot = {
  patreonId: string;
  memberId: string | null;
  email: string | null;
  emailMatchesPlayer: boolean | null;
  fullName: string | null;
  isSupporter: boolean;
  patronStatus: string | null;
  currentlyEntitledAmountCents: number;
  tierId: string | null;
  tierName: string | null;
  tierAmountCents: number | null;
  tiers: PatreonTier[];
};

export class PatreonIntegrationError extends Error {
  readonly code:
    | "account-conflict"
    | "configuration"
    | "invalid-response"
    | "provider"
    | "reauthorization-required";
  readonly status?: number;

  constructor(
    message: string,
    code:
      | "account-conflict"
      | "configuration"
      | "invalid-response"
      | "provider"
      | "reauthorization-required",
    status?: number,
  ) {
    super(message);
    this.name = "PatreonIntegrationError";
    this.code = code;
    this.status = status;
  }
}

export function parsePatreonIdentity(
  identity: PatreonIdentityResponse,
  campaignId: string,
  playerEmail: string,
): PatreonMembershipSnapshot {
  if (!identity.data?.id) {
    throw new PatreonIntegrationError(
      "Patreon did not return an account identifier.",
      "invalid-response",
    );
  }

  const included = identity.included ?? [];
  const membershipReferences =
    identity.data.relationships?.memberships?.data ?? [];
  const memberships = membershipReferences
    .map((reference) =>
      included.find(
        (resource) =>
          resource.type === "member" && resource.id === reference.id,
      ),
    )
    .filter(
      (resource): resource is PatreonIncludedResource => Boolean(resource),
    );
  const membership =
    memberships.find(
      (resource) =>
        resource.relationships?.campaign?.data?.id === campaignId,
    ) ?? null;
  const tierReferences =
    membership?.relationships?.currently_entitled_tiers?.data ?? [];
  const tiers = tierReferences
    .map((reference) =>
      included.find(
        (resource) =>
          resource.type === "tier" && resource.id === reference.id,
      ),
    )
    .filter(
      (resource): resource is PatreonIncludedResource => Boolean(resource),
    )
    .map((resource) => ({
      id: resource.id,
      title: stringOrNull(resource.attributes?.title),
      amount_cents: numberOrNull(resource.attributes?.amount_cents),
    }))
    .sort(
      (left, right) =>
        (right.amount_cents ?? 0) - (left.amount_cents ?? 0),
    );
  const highestTier = tiers[0] ?? null;
  const entitledAmount = Math.max(
    0,
    numberOrNull(
      membership?.attributes?.currently_entitled_amount_cents,
    ) ?? 0,
  );
  const patronStatus =
    stringOrNull(membership?.attributes?.patron_status) ?? null;
  const patreonEmail =
    normalizePlayerEmail(identity.data.attributes?.email) ?? null;
  const normalizedPlayerEmail = normalizePlayerEmail(playerEmail);
  const isSupporter =
    patronStatus === "active_patron" && entitledAmount > 0;

  return {
    patreonId: identity.data.id,
    memberId: membership?.id ?? null,
    email: patreonEmail,
    emailMatchesPlayer:
      patreonEmail && normalizedPlayerEmail
        ? patreonEmail === normalizedPlayerEmail
        : null,
    fullName: stringOrNull(identity.data.attributes?.full_name),
    isSupporter,
    patronStatus,
    currentlyEntitledAmountCents: entitledAmount,
    tierId: isSupporter ? highestTier?.id ?? null : null,
    tierName: isSupporter ? highestTier?.title ?? null : null,
    tierAmountCents: isSupporter
      ? highestTier?.amount_cents ?? null
      : null,
    tiers: isSupporter ? tiers : [],
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

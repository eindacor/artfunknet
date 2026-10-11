import type { Db } from "mongodb";

import type { ArtworkRarity } from "./gameplay.ts";

export const SUPPORTER_STATUSES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const satisfies readonly ArtworkRarity[];

export type SupporterStatus = (typeof SUPPORTER_STATUSES)[number];

type PatreonSupporterTier = {
  title?: string | null;
};

export type SupporterStatusPlayer = {
  _id: string;
  active: boolean;
  supporter?: {
    admin_override?: SupporterStatus;
    admin_override_updated_at?: Date;
    admin_override_updated_by?: string;
  };
  patreon?: {
    is_supporter?: boolean;
    requires_reauthorization?: boolean;
    tier_name?: string | null;
    tiers?: PatreonSupporterTier[];
  };
};

export function normalizeSupporterStatus(
  value: unknown,
): SupporterStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SUPPORTER_STATUSES.find((status) => status === normalized) ?? null;
}

export function getHighestSupporterStatus(
  statuses: Iterable<SupporterStatus | null | undefined>,
): SupporterStatus | null {
  let highest: SupporterStatus | null = null;
  for (const status of statuses) {
    if (
      status &&
      (!highest ||
        SUPPORTER_STATUSES.indexOf(status) >
          SUPPORTER_STATUSES.indexOf(highest))
    ) {
      highest = status;
    }
  }
  return highest;
}

export function getPatreonSupporterStatus(
  player: Pick<SupporterStatusPlayer, "patreon">,
): SupporterStatus | null {
  const patreon = player.patreon;
  if (
    patreon?.is_supporter !== true ||
    patreon.requires_reauthorization === true
  ) {
    return null;
  }

  const tierStatuses = [
    patreon.tier_name,
    ...(patreon.tiers ?? []).map((tier) => tier.title),
  ].map(getSupporterStatusFromLabel);
  return getHighestSupporterStatus(tierStatuses) ?? "common";
}

export function resolvePlayerSupporterStatus(
  player: SupporterStatusPlayer,
): SupporterStatus | null {
  return getHighestSupporterStatus([
    normalizeSupporterStatus(player.supporter?.admin_override),
    getPatreonSupporterStatus(player),
  ]);
}

export function isPlayerSupporter(player: SupporterStatusPlayer): boolean {
  return resolvePlayerSupporterStatus(player) !== null;
}

export async function getPlayerSupporterStatus(
  database: Db,
  playerId: string,
): Promise<SupporterStatus | null> {
  const player = await database
    .collection<SupporterStatusPlayer>("players")
    .findOne(
      { _id: playerId, active: true },
      {
        projection: {
          supporter: 1,
          "patreon.is_supporter": 1,
          "patreon.requires_reauthorization": 1,
          "patreon.tier_name": 1,
          "patreon.tiers.title": 1,
        },
      },
    );
  return player ? resolvePlayerSupporterStatus(player) : null;
}

function getSupporterStatusFromLabel(
  value: string | null | undefined,
): SupporterStatus | null {
  if (!value) return null;
  const words = new Set(value.toLowerCase().match(/[a-z]+/g) ?? []);
  return (
    [...SUPPORTER_STATUSES]
      .reverse()
      .find((status) => words.has(status)) ?? null
  );
}

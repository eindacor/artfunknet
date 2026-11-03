import type { Filter } from "mongodb";

import type { GameItem } from "./gameplay.ts";
import {
  getUnarchivedArchiveData,
  type ArchiveCategory,
} from "./archive-gameplay.ts";

export type ItemPermission =
  | { allowed: true; reason?: never }
  | { allowed: false; reason: string };

export const FEATURE_ARTWORK_DESCRIPTION =
  "Featured works attract visitors to your gallery and earn money and XP over time.";

export type ItemDisposalAction =
  | "collector-sale"
  | "sell"
  | "historian"
  | "donate"
  | "auction";

type DisposalItem = Pick<GameItem, "status"> &
  Partial<Pick<GameItem, "permanent" | "original" | "repairing">>;

const DISPOSAL_ACTIONS: Record<ItemDisposalAction, {
  verb: string;
  statuses: GameItem["status"][];
  protectsOriginal?: boolean;
  blocksRepairing?: boolean;
}> = {
  "collector-sale": {
    verb: "sold to Art Collectors",
    statuses: ["claimed", "unclaimed", "won", "for_sale"],
    protectsOriginal: true,
  },
  sell: {
    verb: "sold",
    statuses: ["claimed", "unclaimed"],
    protectsOriginal: true,
  },
  historian: {
    verb: "sent to the Historian",
    statuses: ["claimed", "unclaimed", "for_sale"],
    blocksRepairing: true,
  },
  donate: {
    verb: "donated",
    statuses: ["claimed", "unclaimed", "for_sale"],
    protectsOriginal: true,
  },
  auction: {
    verb: "auctioned",
    statuses: ["claimed"],
    blocksRepairing: true,
  },
};

export function getItemDisposalPermission(
  item: DisposalItem,
  action: ItemDisposalAction,
): ItemPermission {
  const { verb, statuses, protectsOriginal, blocksRepairing } = DISPOSAL_ACTIONS[action];
  if (item.status === "displayed" || item.permanent) {
    return {
      allowed: false,
      reason: `Featured works and works in your permanent collection can't be ${verb}.`,
    };
  }
  if (protectsOriginal && item.original) {
    return {
      allowed: false,
      reason: action === "collector-sale"
        ? "Original artwork cannot be offered to Art Collectors."
        : `Original artwork cannot be ${verb}.`,
    };
  }
  if (blocksRepairing && item.repairing) {
    return { allowed: false, reason: `Works being repaired can't be ${verb}.` };
  }
  if (!statuses.includes(item.status)) {
    return { allowed: false, reason: `This artwork cannot currently be ${verb}.` };
  }
  return { allowed: true };
}

export function getItemDisposalFilter(
  action: ItemDisposalAction,
  status?: GameItem["status"],
) {
  const { statuses, protectsOriginal, blocksRepairing } = DISPOSAL_ACTIONS[action];
  return {
    status: { $in: statuses, ...(status ? { $eq: status } : {}) },
    permanent: { $ne: true },
    ...(protectsOriginal ? { original: { $ne: true } } : {}),
    ...(blocksRepairing ? { repairing: { $ne: true } } : {}),
  } satisfies Filter<GameItem>;
}

export function getDisplayPermission(
  item: Pick<
    GameItem,
    "_id" | "artwork_id" | "status" | "repairing" | "permanent"
  >,
  ownedItems: Array<
    Pick<GameItem, "_id" | "artwork_id" | "status" | "permanent">
  >,
  displayCap: number,
): ItemPermission {
  if (item.status !== "claimed") {
    return { allowed: false, reason: "This item is not in your inventory." };
  }
  if (item.repairing) {
    return {
      allowed: false,
      reason: "This item is currently being repaired.",
    };
  }
  const duplicate = ownedItems.some(
    (candidate) =>
      candidate._id !== item._id &&
      candidate.artwork_id === item.artwork_id &&
      (candidate.status === "displayed" || candidate.permanent),
  );
  if (duplicate) {
    return {
      allowed: false,
      reason: "An item of this artwork is already featured or in your permanent collection.",
    };
  }

  const displayCount = ownedItems.filter(
    (candidate) => candidate.status === "displayed",
  ).length;
  if (displayCount >= displayCap) {
    return {
      allowed: false,
      reason: "You have reached your featured-work limit.",
    };
  }

  return { allowed: true };
}

export function getArchivePermission(
  item: Pick<
    GameItem,
    | "card_renderer"
    | "foil"
    | "lottery"
    | "mint"
    | "original"
    | "repairing"
    | "seasonal"
    | "status"
    | "unlocked"
    | "vintage"
    | "authenticity"
  > & Partial<Pick<GameItem, "permanent">>,
  archivedModifiers: readonly ArchiveCategory[],
  archivedArtStyles: readonly string[],
): ItemPermission {
  if (item.permanent) {
    return {
      allowed: false,
      reason: "Works in your permanent collection can't be archived.",
    };
  }
  if (!["claimed", "displayed", "unclaimed", "for_sale"].includes(item.status)) {
    return {
      allowed: false,
      reason: "This item is not eligible for the archive.",
    };
  }
  if (item.original) {
    return {
      allowed: false,
      reason: "Original artwork cannot be archived.",
    };
  }
  if (item.repairing) {
    return {
      allowed: false,
      reason: "Stop repairing this item before archiving it.",
    };
  }
  if (item.authenticity.forgery && item.authenticity.identified) {
    return {
      allowed: false,
      reason: "A known forgery cannot be archived.",
    };
  }

  const additions = getUnarchivedArchiveData(
    item,
    archivedModifiers,
    archivedArtStyles,
  );
  if (additions.modifiers.length === 0 && additions.artStyles.length === 0) {
    return {
      allowed: false,
      reason:
        "This item's modifiers and art style are already represented in the archive.",
    };
  }
  return { allowed: true };
}

export function getPlayerFacingArchivePermission(
  item: Parameters<typeof getArchivePermission>[0],
  archivedModifiers: readonly ArchiveCategory[],
  archivedArtStyles: readonly string[],
): ItemPermission {
  return getArchivePermission(item, archivedModifiers, archivedArtStyles);
}

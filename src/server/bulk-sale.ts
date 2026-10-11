import type { Db } from "mongodb";

import {
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  type PlayerArtworkArchive,
} from "./archive-gameplay.ts";
import {
  getUnfulfilledHistorianTargetIds,
  type ArtHistorianQuest,
} from "./art-historian-gameplay.ts";
import { deleteCommunityReactions } from "./community-reaction-cleanup.ts";
import {
  punishForgeryQuality,
  rollForgeryDetected,
  shouldDestroyDetectedForgery,
  transferForgeryLiability,
} from "./forgery-gameplay.ts";
import type { ArtworkRarity, GameItem } from "./gameplay.ts";
import { transferHallOfFameItems } from "./hall-of-fame.ts";
import { hydrateGameItems, type HydratedGameItem } from "./item-artwork.ts";
import { getPlayerFacingArchivePermission, type ItemPermission } from "./item-permissions.ts";

export type BulkSaleProtections = {
  keepArtStyles: boolean;
  keepRares: boolean;
  keepLegendaries: boolean;
  keepMasterpieces: boolean;
  keepUnfoundQuestTargets: boolean;
  keepUnarchived: boolean;
};

export type BulkOperationKind = "sale" | "donation";

export type BulkOperationReceipt = {
  id: string;
  kind: BulkOperationKind;
  state: "reserved" | "credited";
  started_at: string;
  credited_at?: string;
};

const BULK_OPERATION_RECOVERY_DELAY_MS = 2 * 60 * 1000;

export function isBulkLootCandidate(
  item: Pick<GameItem, "original" | "permanent">,
): boolean {
  return !item.permanent;
}

export function parseBulkSaleProtections(
  rawBody: string,
): { ok: true; protections: BulkSaleProtections } | { ok: false } {
  let body: Partial<BulkSaleProtections> = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as Partial<BulkSaleProtections>;
    } catch {
      return { ok: false };
    }
  }
  return {
    ok: true,
    protections: {
      keepArtStyles: body.keepArtStyles === true,
      keepRares: body.keepRares === true,
      keepLegendaries: body.keepLegendaries === true,
      keepMasterpieces: body.keepMasterpieces === true,
      keepUnfoundQuestTargets: body.keepUnfoundQuestTargets === true,
      keepUnarchived: body.keepUnarchived === true,
    },
  };
}

export function shouldPreserveBulkSaleItem(
  item: {
    archivePermission?: ItemPermission;
    artwork: { rarity: ArtworkRarity };
    card_renderer?: string;
    unfoundQuestTarget?: boolean;
  },
  protections: BulkSaleProtections,
): boolean {
  return (
    (protections.keepArtStyles &&
      Boolean(item.card_renderer) &&
      item.card_renderer !== "museum") ||
    (protections.keepRares && item.artwork.rarity === "rare") ||
    (protections.keepLegendaries && item.artwork.rarity === "legendary") ||
    (protections.keepMasterpieces && item.artwork.rarity === "masterpiece") ||
    (protections.keepUnfoundQuestTargets &&
      item.unfoundQuestTarget === true) ||
    (protections.keepUnarchived && item.archivePermission?.allowed === true)
  );
}

export async function getFilteredBulkLootCandidates(
  database: Db,
  playerId: string,
  protections: BulkSaleProtections,
  statuses: readonly GameItem["status"][] = ["unclaimed"],
): Promise<{
  candidates: GameItem[];
  hydratedCandidates: HydratedGameItem[];
  items: GameItem[];
  questTargetIds: Set<string>;
}> {
  const candidates = await database.collection<GameItem>("items").find({
    owner: playerId,
    status: { $in: statuses },
    permanent: { $ne: true },
  }).toArray();
  if (candidates.length === 0) {
    return {
      candidates: [],
      hydratedCandidates: [],
      items: [],
      questTargetIds: new Set(),
    };
  }
  return filterBulkLootCandidates(
    database,
    playerId,
    protections,
    candidates,
  );
}

export async function filterBulkLootCandidates(
  database: Db,
  playerId: string,
  protections: BulkSaleProtections,
  candidates: GameItem[],
): Promise<{
  candidates: GameItem[];
  hydratedCandidates: HydratedGameItem[];
  items: GameItem[];
  questTargetIds: Set<string>;
}> {
  const eligibleCandidates = candidates.filter(isBulkLootCandidate);
  if (eligibleCandidates.length === 0) {
    return {
      candidates: eligibleCandidates,
      hydratedCandidates: [],
      items: [],
      questTargetIds: new Set(),
    };
  }
  const hydratedCandidates = await hydrateGameItems(
    database,
    eligibleCandidates,
  );
  const [archiveRecords, quests] = await Promise.all([
    protections.keepUnarchived
      ? database
          .collection<PlayerArtworkArchive>("player_artwork_archives")
          .find({
            owner: playerId,
            artwork_id: {
              $in: hydratedCandidates.map((item) => item.artwork_id),
            },
          })
          .toArray()
      : Promise.resolve([]),
    protections.keepUnfoundQuestTargets
      ? database
          .collection<ArtHistorianQuest>("quests")
          .find({ owner_id: playerId })
          .project<Pick<ArtHistorianQuest, "target" | "fulfilled_targets">>({
            target: 1,
            fulfilled_targets: 1,
          })
          .toArray()
      : Promise.resolve([]),
  ]);

  const archiveByArtwork = new Map(
    archiveRecords.map((archive) => [archive.artwork_id, archive]),
  );
  const questTargetIds = new Set(
    quests.flatMap(getUnfulfilledHistorianTargetIds),
  );
  let foundQuestTargetIds = new Set<string>();
  if (questTargetIds.size > 0) {
    const foundTargets = await database
      .collection<GameItem>("items")
      .find({
        owner: playerId,
        status: { $in: ["claimed", "displayed"] },
        artwork_id: { $in: [...questTargetIds] },
      })
      .project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 })
      .toArray();
    foundQuestTargetIds = new Set(
      foundTargets
        .map((item) => item.artwork_id)
        .filter((artworkId): artworkId is string => typeof artworkId === "string"),
    );
  }
  const protectedIds = new Set(
    hydratedCandidates
      .map((item) => {
        const archive = archiveByArtwork.get(item.artwork_id);
        return {
          ...item,
          archivePermission: getPlayerFacingArchivePermission(
            item,
            archive ? getArchiveRecordModifiers(archive) : [],
            archive ? getArchiveRecordArtStyles(archive) : [],
          ),
          unfoundQuestTarget:
            questTargetIds.has(item.artwork_id) &&
            !foundQuestTargetIds.has(item.artwork_id),
        };
      })
      .filter((item) => shouldPreserveBulkSaleItem(item, protections))
      .map((item) => item._id),
  );
  const items = eligibleCandidates.filter(
    (item) => !protectedIds.has(item._id),
  );
  return {
    candidates: eligibleCandidates,
    hydratedCandidates,
    items,
    questTargetIds,
  };
}

export async function processBulkForgeries(
  database: Db,
  playerId: string,
  items: GameItem[],
  hydratedCandidates: HydratedGameItem[],
  context: "sell" | "donate",
): Promise<{
  validItems: GameItem[];
  destroyedIds: string[];
  identifiedIds: Set<string>;
  caughtIds: Set<string>;
  hydrated: HydratedGameItem[];
}> {
  await Promise.all(
    items.map((item) => transferForgeryLiability(database, item, playerId)),
  );
  const hydrated = hydratedCandidates.filter((item) =>
    items.some((candidate) => candidate._id === item._id),
  );
  const caughtItems = hydrated.filter((item) =>
    rollForgeryDetected(item, context),
  );
  const caughtIds = new Set(caughtItems.map((item) => item._id));
  const destroyableItems = caughtItems
    .filter(shouldDestroyDetectedForgery)
    .map((item) => items.find((candidate) => candidate._id === item._id))
    .filter((item): item is GameItem => Boolean(item));
  const preservedIds = await transferHallOfFameItems(
    database,
    destroyableItems,
  );
  const destroyedIds = destroyableItems
    .map((item) => item._id)
    .filter((itemId) => !preservedIds.has(itemId));

  if (destroyedIds.length > 0) {
    const destroyed = await database.collection<GameItem>("items").deleteMany({
      _id: { $in: destroyedIds },
      owner: playerId,
      status: "unclaimed",
      "authenticity.forgery": true,
      "authenticity.identified": true,
    });
    if (destroyed.deletedCount !== destroyedIds.length) {
      throw new Error("Some detected known forgeries could not be destroyed.");
    }
    await deleteCommunityReactions(database, "item", destroyedIds);
  }

  const identifiedIds = new Set(
    caughtItems
      .filter((item) => !shouldDestroyDetectedForgery(item))
      .map((item) => item._id),
  );

  for (const item of items.filter((candidate) =>
    identifiedIds.has(candidate._id),
  )) {
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: playerId, status: "unclaimed" },
      {
        $set: {
          status: "claimed",
          "authenticity.liable": playerId,
          "authenticity.liability_pending": false,
          "authenticity.identified": true,
          "authenticity.forgery_quality": punishForgeryQuality(
            item.authenticity.forgery_quality,
          ),
        },
        $unset: { expires_at: "" },
      },
    );
  }

  const validItems = items.filter((item) => !caughtIds.has(item._id));
  return { validItems, destroyedIds, identifiedIds, caughtIds, hydrated };
}

export function getBulkForgeryMessage(
  destroyedCount: number,
  identifiedCount: number,
  allDetected: boolean,
  actionLabel: "sale" | "donation" = "sale",
): string {
  const outcomes = [
    destroyedCount > 0
      ? `${destroyedCount} known ${destroyedCount === 1 ? "forgery was" : "forgeries were"} detected and destroyed`
      : null,
    identifiedCount > 0
      ? `${identifiedCount} previously unknown ${identifiedCount === 1 ? "forgery was" : "forgeries were"} detected and returned to inventory`
      : null,
  ].filter((outcome): outcome is string => Boolean(outcome));
  const message = outcomes.join("; ");
  return allDetected
    ? `The ${actionLabel} failed. ${message}.`
    : message;
}

export function getBulkForgeryDialog(
  destroyedCount: number,
  identifiedCount: number,
  message: string,
) {
  return {
    variant:
      destroyedCount > 0 && identifiedCount > 0
        ? "mixed"
        : destroyedCount > 0
          ? "destroyed"
          : "returned",
    title:
      destroyedCount > 0 && identifiedCount > 0
        ? "Forgeries detected"
        : destroyedCount > 0
          ? "Forgery detected"
          : "Forgery identified",
    message,
  };
}

export async function beginBulkOperation(
  database: Db,
  playerId: string,
  receipt: Pick<BulkOperationReceipt, "id" | "kind" | "started_at">,
): Promise<boolean> {
  const result = await database.collection<{
    _id: string;
    active: boolean;
    profile: {
      bulk_operation_receipt?: BulkOperationReceipt;
    };
  }>("players").updateOne(
    {
      _id: playerId,
      active: true,
      "profile.bulk_operation_receipt": { $exists: false },
    },
    {
      $set: {
        "profile.bulk_operation_receipt": {
          ...receipt,
          state: "reserved",
        },
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function completeBulkOperation(
  database: Db,
  playerId: string,
  operationId: string,
): Promise<void> {
  await database.collection<{
    _id: string;
    profile: { bulk_operation_receipt?: BulkOperationReceipt };
  }>("players").updateOne(
    {
      _id: playerId,
      "profile.bulk_operation_receipt.id": operationId,
    },
    { $unset: { "profile.bulk_operation_receipt": "" } },
  );
}

export async function wasBulkOperationCredited(
  database: Db,
  playerId: string,
  operationId: string,
  kind: BulkOperationKind,
): Promise<boolean> {
  const player = await database.collection<{
    _id: string;
    profile: {
      bulk_operation_receipt?: BulkOperationReceipt;
      bulk_sale_operations?: string[];
      bulk_donation_operations?: string[];
    };
  }>("players").findOne({ _id: playerId });
  const receipt = player?.profile.bulk_operation_receipt;
  if (
    receipt?.id === operationId &&
    receipt.kind === kind &&
    receipt.state === "credited"
  ) {
    return true;
  }
  const legacyOperations =
    kind === "sale"
      ? player?.profile.bulk_sale_operations
      : player?.profile.bulk_donation_operations;
  return legacyOperations?.includes(operationId) ?? false;
}

export async function recoverPendingBulkOperations(
  database: Db,
  playerId: string,
  {
    forceOperationId,
    now = new Date(),
  }: {
    forceOperationId?: string;
    now?: Date;
  } = {},
): Promise<void> {
  const pending = await database.collection<GameItem>("items").find({
    owner: playerId,
    status: { $in: ["bulk_sale_pending", "bulk_donate_pending"] },
  }).toArray();
  const players = database.collection<{
    _id: string;
    profile: {
      bulk_operation_receipt?: BulkOperationReceipt;
      bulk_sale_operations?: string[];
      bulk_donation_operations?: string[];
    };
  }>("players");
  const player = await players.findOne({ _id: playerId });
  if (!player) return;

  const receipt = player.profile.bulk_operation_receipt;
  const receiptStartedAt = receipt
    ? new Date(receipt.started_at).getTime()
    : Number.NaN;
  const receiptRecoverable = Boolean(
    receipt &&
      (receipt.id === forceOperationId ||
        !Number.isFinite(receiptStartedAt) ||
        receiptStartedAt <=
          now.getTime() - BULK_OPERATION_RECOVERY_DELAY_MS),
  );
  const legacySales = new Set(player.profile.bulk_sale_operations ?? []);
  const legacyDonations = new Set(
    player.profile.bulk_donation_operations ?? [],
  );
  const operations = new Map<
    string,
    {
      field: "bulk_sale_operation" | "bulk_donation_operation";
      items: GameItem[];
      kind: BulkOperationKind;
      status: "bulk_sale_pending" | "bulk_donate_pending";
    }
  >();

  for (const item of pending) {
    const saleOperationId = item.bulk_sale_operation;
    const donationOperationId = item.bulk_donation_operation;
    const operationId = saleOperationId ?? donationOperationId;
    if (!operationId) continue;
    const kind = saleOperationId ? "sale" : "donation";
    const existing = operations.get(operationId);
    if (existing) {
      existing.items.push(item);
    } else {
      operations.set(operationId, {
        field:
          kind === "sale"
            ? "bulk_sale_operation"
            : "bulk_donation_operation",
        items: [item],
        kind,
        status:
          kind === "sale"
            ? "bulk_sale_pending"
            : "bulk_donate_pending",
      });
    }
  }

  for (const [operationId, operation] of operations) {
    const matchesReceipt =
      receipt?.id === operationId && receipt.kind === operation.kind;
    if (matchesReceipt && !receiptRecoverable) continue;
    const credited =
      (matchesReceipt && receipt?.state === "credited") ||
      (operation.kind === "sale"
        ? legacySales.has(operationId)
        : legacyDonations.has(operationId));

    if (credited) {
      await finishCreditedBulkOperation(
        database,
        playerId,
        operationId,
        operation,
      );
    } else {
      await database.collection<GameItem>("items").updateMany(
        {
          owner: playerId,
          status: operation.status,
          [operation.field]: operationId,
        },
        {
          $set: { status: "unclaimed" },
          $unset: { [operation.field]: "" },
        },
      );
    }
  }

  const unset: Record<string, ""> = {
    "profile.bulk_sale_operations": "",
    "profile.bulk_donation_operations": "",
  };
  if (
    receipt &&
    (receiptRecoverable ||
      (receipt.state === "credited" && !operations.has(receipt.id)))
  ) {
    unset["profile.bulk_operation_receipt"] = "";
  }
  await players.updateOne({ _id: playerId }, { $unset: unset });
}

async function finishCreditedBulkOperation(
  database: Db,
  playerId: string,
  operationId: string,
  operation: {
    field: "bulk_sale_operation" | "bulk_donation_operation";
    items: GameItem[];
    status: "bulk_sale_pending" | "bulk_donate_pending";
  },
) {
  const hallOfFameIds = await transferHallOfFameItems(
    database,
    operation.items,
  );
  const itemIds = operation.items
    .map((item) => item._id)
    .filter((itemId) => !hallOfFameIds.has(itemId));
  await database.collection<GameItem>("items").deleteMany({
    _id: { $in: itemIds },
    owner: playerId,
    status: operation.status,
    [operation.field]: operationId,
  });
  await deleteCommunityReactions(database, "item", itemIds);
}

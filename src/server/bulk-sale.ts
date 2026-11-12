import type { Db } from "mongodb";

import {
  DROPPABLE_CARD_RENDERER_IDS,
  type DroppableCardRendererId,
} from "../components/item-cards/catalog.ts";
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
  notifyForgeryDetection,
  punishForgeryQuality,
  rollForgeryDetected,
  shouldDestroyDetectedForgery,
  transferForgeryLiability,
} from "./forgery-gameplay.ts";
import type { ArtworkRarity, GameItem } from "./gameplay.ts";
import { getGameplaySettings } from "./game-settings.ts";
import { transferHallOfFameItems } from "./hall-of-fame.ts";
import { hydrateGameItems, type HydratedGameItem } from "./item-artwork.ts";
import { getPlayerFacingArchivePermission, type ItemPermission } from "./item-permissions.ts";
import { isRevealedForBulkAction, type OfferRevealThresholds } from "./offer-reveal.ts";

export type BulkSaleProtections = {
  keptArtStyleIds: DroppableCardRendererId[];
  keepRares: boolean;
  keepLegendaries: boolean;
  keepMasterpieces: boolean;
  // Keep the persisted key for unsubmitted-target protection compatible.
  keepUnfoundQuestTargets: boolean;
  keepUnarchived: boolean;
};

export function normalizeBulkKeptArtStyleIds(
  value: unknown,
): DroppableCardRendererId[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(
    value.filter((id): id is string => typeof id === "string"),
  );
  return DROPPABLE_CARD_RENDERER_IDS.filter((id) => selected.has(id));
}

export function getSavedBulkSaleProtections(value: unknown): BulkSaleProtections {
  const protections = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    keptArtStyleIds: Array.isArray(protections.keptArtStyleIds)
      ? normalizeBulkKeptArtStyleIds(protections.keptArtStyleIds)
      : protections.keepArtStyles !== false
        ? [...DROPPABLE_CARD_RENDERER_IDS]
        : [],
    keepRares: protections.keepRares !== false,
    keepLegendaries: protections.keepLegendaries !== false,
    keepMasterpieces: protections.keepMasterpieces !== false,
    keepUnfoundQuestTargets: protections.keepUnfoundQuestTargets !== false,
    keepUnarchived: protections.keepUnarchived !== false,
  };
}

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
  let body: Partial<BulkSaleProtections> & { keepArtStyles?: unknown } = {};
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
      keptArtStyleIds: Array.isArray(body.keptArtStyleIds)
        ? normalizeBulkKeptArtStyleIds(body.keptArtStyleIds)
        : body.keepArtStyles === true
          ? [...DROPPABLE_CARD_RENDERER_IDS]
          : [],
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
    unsubmittedQuestTarget?: boolean;
  },
  protections: BulkSaleProtections,
): boolean {
  return (
    (Boolean(item.card_renderer) &&
      protections.keptArtStyleIds.includes(
        item.card_renderer as DroppableCardRendererId,
      )) ||
    (protections.keepRares && item.artwork.rarity === "rare") ||
    (protections.keepLegendaries && item.artwork.rarity === "legendary") ||
    (protections.keepMasterpieces && item.artwork.rarity === "masterpiece") ||
    (protections.keepUnfoundQuestTargets &&
      item.unsubmittedQuestTarget === true) ||
    (protections.keepUnarchived && item.archivePermission?.allowed === true)
  );
}

export function getBulkItemProtection(
  item: Parameters<typeof shouldPreserveBulkSaleItem>[0] & Parameters<typeof isRevealedForBulkAction>[0],
  protections: BulkSaleProtections,
  thresholds?: OfferRevealThresholds,
): ItemPermission {
  if (!isRevealedForBulkAction(item, thresholds)) {
    return { allowed: false, reason: "Reveal every selected item before using bulk actions." };
  }
  if (protections.keepUnfoundQuestTargets && item.unsubmittedQuestTarget) {
    return { allowed: false, reason: "Unsubmitted quest targets are protected by your bulk-action preferences." };
  }
  return shouldPreserveBulkSaleItem(item, protections)
    ? { allowed: false, reason: "This artwork is protected by your bulk-action preferences." }
    : { allowed: true };
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
  const [hydratedCandidates, settings] = await Promise.all([
    hydrateGameItems(database, eligibleCandidates),
    getGameplaySettings(database),
  ]);
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
  const allowedIds = new Set(
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
          unsubmittedQuestTarget: questTargetIds.has(item.artwork_id),
        };
      })
      .filter((item) => getBulkItemProtection(item, protections, settings.active.offerRevealThresholds).allowed)
      .map((item) => item._id),
  );
  const items = eligibleCandidates.filter(
    (item) => allowedIds.has(item._id),
  );
  return {
    candidates: eligibleCandidates,
    hydratedCandidates,
    items,
    questTargetIds,
  };
}

export async function getBulkDisposalPermission(
  database: Db,
  playerId: string,
  item: GameItem,
  request: Request,
): Promise<ItemPermission> {
  const body = await request.json().catch(() => null) as { bulkAction?: unknown } | null;
  if (body?.bulkAction !== true) return { allowed: true };
  if (item.revealed === false) {
    return { allowed: false, reason: "Reveal every selected item before using bulk actions." };
  }

  const player = await database.collection<{
    _id: string;
    profile?: { view_settings?: { bulkSaleProtections?: unknown } };
  }>("players").findOne(
    { _id: playerId },
    { projection: { "profile.view_settings.bulkSaleProtections": 1 } },
  );
  const protections = getSavedBulkSaleProtections(player?.profile?.view_settings?.bulkSaleProtections);
  const result = await filterBulkLootCandidates(database, playerId, protections, [item]);
  if (result.items.length > 0) return { allowed: true };
  return protections.keepUnfoundQuestTargets && result.questTargetIds.has(item.artwork_id)
    ? { allowed: false, reason: "Unsubmitted quest targets are protected by your bulk-action preferences." }
    : { allowed: false, reason: "Unrevealed or protected items cannot be processed by bulk actions." };
}

export async function getBulkRevealPermission(
  database: Db,
  item: GameItem,
  bulkAction: unknown,
): Promise<ItemPermission> {
  if (bulkAction !== true || item.revealed === true) return { allowed: true };
  if (item.revealed !== false) {
    const [items, settings] = await Promise.all([
      hydrateGameItems(database, [item]),
      getGameplaySettings(database),
    ]);
    if (items[0] && isRevealedForBulkAction(items[0], settings.active.offerRevealThresholds)) {
      return { allowed: true };
    }
  }
  return { allowed: false, reason: "Reveal every selected item before using bulk actions." };
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

  for (const item of caughtItems.filter((candidate) =>
    shouldDestroyDetectedForgery(candidate),
  )) {
    await notifyForgeryDetection(
      database,
      playerId,
      `${item.artwork.title}: A bulk ${context === "sell" ? "sale" : "donation"} inspection detected this known forgery. ${
        preservedIds.has(item._id)
          ? "The Hall of Fame preserved the artwork."
          : "The artwork was destroyed."
      }`,
    );
  }

  const identifiedItems = caughtItems.filter(
    (item) => !shouldDestroyDetectedForgery(item),
  );
  const identifiedIds = new Set(identifiedItems.map((item) => item._id));

  for (const item of identifiedItems) {
    const identified = await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: playerId, status: "unclaimed", "authenticity.identified": false },
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
    if (identified.modifiedCount === 1) {
      await notifyForgeryDetection(
        database,
        playerId,
        `${item.artwork.title}: A bulk ${context === "sell" ? "sale" : "donation"} inspection detected a forgery. It was identified and returned to your inventory.`,
      );
    }
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

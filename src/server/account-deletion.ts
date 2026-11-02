import type { Db, Document } from "mongodb";

import { withExclusiveAccountDataAccess } from "./account-data-access.ts";

export const ACCOUNT_DELETION_PHRASE = "DELETE MY ACCOUNT";
export const REDACTED_PLAYER_NAME = "[redacted]";

type StoredDocument = Document & { _id: string };

export class AccountDeletionError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function playerEmails(player: StoredDocument) {
  const emails = new Set<string>();
  const collectEmails = (value: unknown) => {
    if (typeof value === "string" && value.includes("@")) emails.add(value);
  };
  collectEmails(player.email);
  collectEmails(player.username);
  for (const field of ["account_emails", "verified_emails"]) {
    for (const email of player[field] ?? []) collectEmails(email);
  }
  for (const account of Object.values(player.oauth_accounts ?? {})) {
    collectEmails((account as { email?: string }).email);
  }
  collectEmails(player.patreon?.email);
  return emails;
}

function playerRedactor(player: StoredDocument) {
  const emails = playerEmails(player);
  const identifiers = new RegExp(
    [player._id, ...emails].sort((a, b) => b.length - a.length).map(escapeRegex).join("|"),
    "gi",
  );
  const name = typeof player.screen_name === "string" && player.screen_name
    ? new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegex(player.screen_name)}(?![\\p{L}\\p{N}_-])`, "giu")
    : null;

  function redact(value: unknown, key = ""): unknown {
    if (typeof value === "string") {
      const text = value.replace(identifiers, REDACTED_PLAYER_NAME);
      return name && /(?:name|message|content|description|text)$/i.test(key)
        ? text.replace(name, REDACTED_PLAYER_NAME)
        : text;
    }
    if (Array.isArray(value)) {
      return value
        .filter((entry) => entry !== player._id && entry?.player_id !== player._id)
        .map((entry) => redact(entry, key));
    }
    if (!value || typeof value !== "object" || value instanceof Date ||
        ArrayBuffer.isView(value) || "_bsontype" in value) return value;
    const object = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [field, entry] of Object.entries(object)) {
      if (field.includes(player._id)) continue;
      if (field === "artwork" || field === "_id") result[field] = entry;
      else if (field === "commission" && (entry as { player_id?: string } | null)?.player_id === player._id) {
        result[field] = null;
      } else if (field === "pending_winner_notification" &&
                 (entry as { player_id?: string } | null)?.player_id === player._id) {
        continue;
      } else {
        result[field] = redact(entry, field);
      }
    }
    if (object.liable === player._id) {
      result.liable = "";
      result.liability_pending = false;
    }
    const nameFields = [
      ["player_id", "player_screen_name", "screen_name", "name"],
      ["owner_id", "owner_name", "owner"],
      ["author_id", "author_name"],
      ["seller_id", "seller_name"],
      ["current_winner_id", "current_winner_name"],
      ["winner_id", "winner_name"],
      ["playerId", "screenName", "playerScreenName"],
    ];
    for (const [identity, ...fields] of nameFields) {
      if (object[identity] !== player._id) continue;
      for (const field of fields) {
        if (typeof object[field] === "string") result[field] = REDACTED_PLAYER_NAME;
      }
    }
    return result;
  }
  return redact;
}

// Catalogs and operational backups are not player-owned game records.
const SHARED_PLAYER_COLLECTIONS = [
  "items", "players", "galleries", "npcs", "quests", "auctions", "metadata",
  "player_artwork_archives", "player_notifications", "playthrough_snapshots",
  "hall_of_fame", "hall_of_fame_submissions", "community_reactions",
  "gallery_chat_messages", "daily_event_claims", "artwork_effect_settlements",
  "raffle_entries", "forgery_contest_entries", "forgery_contest_votes",
] as const;

async function finishAll(operations: Promise<unknown>[]) {
  const results = await Promise.allSettled(operations);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

export async function deletePlayerAccount(
  database: Db,
  playerId: string,
  settleExpiredAuctions: (database: Db) => Promise<void>,
): Promise<void> {
  await withExclusiveAccountDataAccess(database, async () => {
    const players = database.collection<StoredDocument>("players");
    const player = await players.findOne({ _id: playerId, active: true });
    if (!player) throw new AccountDeletionError("The player account is unavailable.", 404);

    await settleExpiredAuctions(database);
    const [auction, liveAuction] = await Promise.all([
      database.collection<StoredDocument>("auctions").findOne({
        $or: [
          { seller_id: playerId },
          { current_winner_id: playerId },
          { current_winner_id: null, current_winner_name: player.screen_name, has_bid: true },
        ],
      }),
      database.collection<StoredDocument>("metadata").findOne({
        _id: "live-auction-event",
        live: true,
        current_item_id: { $ne: null },
        winner_id: playerId,
      }),
    ]);
    if (auction || liveAuction) {
      throw new AccountDeletionError(
        "You cannot delete your account while selling or winning an active auction, or while an auction is still settling.",
      );
    }
    if (player.profile?.vintage_operation &&
        new Date(player.profile.vintage_operation.expires_at).getTime() > Date.now()) {
      throw new AccountDeletionError("Your new era is still being prepared. Try deleting again when it finishes.");
    }

    await players.updateOne({ _id: playerId }, { $set: { account_deletion: true } });
    const privateAuctions = await database.collection<StoredDocument>("auctions")
      .find({ viewer: playerId }).project({ item_id: 1 }).toArray();
    const items = await database.collection<StoredDocument>("items")
      .find({
        $or: [
          { owner: playerId },
          { _id: { $in: privateAuctions.map((auction) => auction.item_id) }, owner: "system:auction-house" },
          { owner: "system:forgery-contest", "forgery_contest.original_owner": playerId },
        ],
      }).project({ _id: 1 }).toArray();
    const [messages, entries] = await Promise.all([
      database.collection<StoredDocument>("gallery_chat_messages")
        .find({ $or: [{ author_id: playerId }, { gallery_owner_id: playerId }] })
        .project({ _id: 1 }).toArray(),
      database.collection<StoredDocument>("forgery_contest_entries")
        .find({ player_id: playerId }).project({ _id: 1 }).toArray(),
    ]);
    const plan = player.account_deletion_plan;
    const itemIds = [...new Set<string>([
      ...(plan?.item_ids ?? []), ...items.map((item) => item._id),
    ])];
    const messageIds = [...new Set<string>([
      ...(plan?.message_ids ?? []), ...messages.map((message) => message._id),
    ])];
    const entryIds = [...new Set<string>([
      ...(plan?.entry_ids ?? []), ...entries.map((entry) => entry._id),
    ])];
    await players.updateOne({ _id: playerId }, {
      $set: { account_deletion_plan: { item_ids: itemIds, message_ids: messageIds, entry_ids: entryIds } },
    });

    const ownedCollections = [
      ["galleries", "owner_id"], ["npcs", "owner_id"], ["quests", "owner_id"],
      ["player_artwork_archives", "owner"], ["player_notifications", "user_id"],
      ["playthrough_snapshots", "player_id"], ["daily_event_claims", "player_id"],
      ["artwork_effect_settlements", "player_id"], ["raffle_entries", "player_id"],
      ["forgery_contest_entries", "player_id"], ["hall_of_fame_submissions", "player_id"],
    ] as const;
    await finishAll(ownedCollections.map(([collection, owner]) =>
      database.collection(collection).deleteMany({ [owner]: playerId }),
    ));
    await finishAll([
      database.collection<StoredDocument>("items").deleteMany({ _id: { $in: itemIds } }),
      database.collection("auctions").deleteMany({ viewer: playerId }),
      database.collection<StoredDocument>("gallery_chat_messages")
        .deleteMany({ _id: { $in: messageIds } }),
      database.collection("hall_of_fame").deleteMany({ item_id: { $in: itemIds } }),
      database.collection("hall_of_fame_submissions").deleteMany({ item_id: { $in: itemIds } }),
      database.collection("forgery_contest_votes").deleteMany({
        $or: [{ player_id: playerId }, { entry_id: { $in: entryIds } }],
      }),
      database.collection("community_reactions").deleteMany({
        $or: [
          { player_id: playerId },
          { target_type: "gallery", target_id: playerId },
          { target_type: "item", target_id: { $in: itemIds } },
          { target_type: "message", target_id: { $in: messageIds } },
        ],
      }),
      database.collection("artist_applications").deleteMany({
        $or: [
          { player_id: playerId },
          { email: { $in: [...playerEmails(player)].map(email => new RegExp(`^${escapeRegex(email)}$`, "i")) } },
        ],
      }),
      database.collection("artists").updateMany({ player_id: playerId }, { $unset: { player_id: "" } }),
      database.collection("artworks").updateMany({ submitted_by: playerId }, { $unset: { submitted_by: "" } }),
    ]);

    const redact = playerRedactor(player);
    for (const collectionName of SHARED_PLAYER_COLLECTIONS) {
      const collection = database.collection<StoredDocument>(collectionName);
      const cursor = collection.find(
        collectionName === "players" ? { _id: { $ne: playerId } } :
          collectionName === "metadata" ? { _id: { $ne: "account-erasure-gate" } } : {},
      );
      for await (const document of cursor) {
        if (typeof document._id === "string" && document._id.includes(playerId)) {
          await collection.deleteOne({ _id: document._id });
          continue;
        }
        const redacted = collectionName === "players"
          ? { ...document, profile: redact(document.profile) }
          : redact(document) as StoredDocument;
        if (JSON.stringify(document) !== JSON.stringify(redacted)) {
          await collection.replaceOne({ _id: document._id }, redacted);
        }
      }
    }
    const deleted = await players.deleteOne({ _id: playerId, account_deletion: true });
    if (deleted.deletedCount !== 1) throw new Error("The account deletion could not be confirmed.");
  });
}

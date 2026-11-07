import type { Db } from "mongodb";

const SENSITIVE_METADATA_KEYS = new Set([
  "access_token",
  "accesstoken",
  "client_secret",
  "clientsecret",
  "code_verifier",
  "codeverifier",
  "encrypted_tokens",
  "encryptedtokens",
  "id_token",
  "idtoken",
  "password_hash",
  "password_salt",
  "refresh_token",
  "refreshtoken",
  "secret",
  "session_token",
  "sessiontoken",
  "token",
]);

export function redactPlayerMetadata(
  value: unknown,
  key?: string,
): unknown {
  if (key && SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
    return "[redacted]";
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => redactPlayerMetadata(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactPlayerMetadata(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export class PlayerArtistLinkError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export async function linkPlayerAccountToArtist(
  database: Db,
  playerId: string,
  artistId: string,
  adminEmail: string,
): Promise<void> {
  const players = database.collection<{
    _id: string; active: boolean; artist_id?: string | null; account_deletion?: boolean;
  }>("players");
  const artists = database.collection<{
    _id: string; artist_name: string; player_id?: string | null;
  }>("artists");
  const [player, artist, otherPlayer] = await Promise.all([
    players.findOne({ _id: playerId, active: true, account_deletion: { $ne: true } }),
    artists.findOne({ _id: artistId }),
    players.findOne({ _id: { $ne: playerId }, artist_id: artistId }),
  ]);
  if (!player) throw new PlayerArtistLinkError("An active player account is required.", 404);
  if (!artist) throw new PlayerArtistLinkError("The selected artist no longer exists.", 404);
  if (player.artist_id && player.artist_id !== artistId) {
    throw new PlayerArtistLinkError("This player is already linked to another artist.");
  }
  if (otherPlayer || (artist.player_id && artist.player_id !== playerId)) {
    throw new PlayerArtistLinkError("This artist is already linked to another player.");
  }

  const claimed = await artists.findOneAndUpdate({
    _id: artistId,
    $or: [{ player_id: { $exists: false } }, { player_id: null }, { player_id: playerId }],
  }, { $set: { player_id: playerId } }, { returnDocument: "before" });
  if (!claimed) throw new PlayerArtistLinkError("The artist changed before it could be linked. Refresh and try again.");

  try {
    const now = new Date();
    const result = await players.updateOne({
      _id: playerId, active: true, account_deletion: { $ne: true },
      $or: [{ artist_id: { $exists: false } }, { artist_id: null }, { artist_id: artistId }],
    }, { $set: {
      account_type: "artist", artist_id: artistId, updated_at: now,
      artist_linked_at: now, artist_linked_by: adminEmail,
    } });
    if (!result.matchedCount) throw new PlayerArtistLinkError("The player changed before the artist could be linked.");
  } catch (error) {
    if (claimed.player_id !== playerId && !await players.findOne({ _id: playerId, artist_id: artistId })) {
      await artists.updateOne({ _id: artistId, player_id: playerId },
        claimed.player_id === null ? { $set: { player_id: null } } : { $unset: { player_id: "" } });
    }
    throw error;
  }
}

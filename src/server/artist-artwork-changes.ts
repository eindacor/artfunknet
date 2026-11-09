import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import type { Artwork } from "./gameplay.ts";
import { validateArtworkImageAdjustments, validateArtworkInput } from "./artwork-create-input.ts";
import {
  deleteArtworkImageRecord, getArtworkImageStorageKeys, publishArtworkUpload,
  type ArtworkImageRecord, type LegacyArtworkImageRecord,
} from "./artwork-storage.ts";
import { ArtistExperienceError } from "./contributing-artists.ts";
import { isDuplicateKeyError } from "./player-account.ts";

export type ArtworkChangeMetadata = Pick<Artwork, "title" | "date" | "genre" | "medium" | "height"> & { nsfw: boolean };
type EditableArtwork = Artwork & {
  image?: ArtworkImageRecord | LegacyArtworkImageRecord;
  nsfw?: boolean;
  submission_status?: string;
  image_width?: number;
  image_height?: number;
  last_artist_change_id?: string;
  retired_images?: Array<ArtworkImageRecord | LegacyArtworkImageRecord>;
};
export type ArtworkChangeRequest = {
  _id: string;
  artwork_id: string;
  artist_id: string;
  submitted_by: string;
  metadata: ArtworkChangeMetadata;
  original: EditableArtwork;
  image?: ArtworkImageRecord;
  retired_images?: ArtworkImageRecord[];
  status: "pending" | "approving" | "denying";
  created_at: Date;
  updated_at?: Date;
  revision?: number;
  approval_started_at?: Date;
};

function editableMetadata(artwork: ArtworkChangeMetadata | EditableArtwork): ArtworkChangeMetadata {
  return {
    title: artwork.title, date: artwork.date, genre: artwork.genre,
    medium: artwork.medium, height: artwork.height, nsfw: artwork.nsfw === true,
  };
}

export async function submitArtworkChange(
  database: Db, artworkId: string, artistId: string, playerId: string,
  input: Record<string, unknown>, file: File | null,
) {
  const artwork = await database.collection<EditableArtwork>("artworks").findOne({
    _id: artworkId, artist_id: artistId, submission_status: { $ne: "denying" },
  });
  if (!artwork) throw new ArtistExperienceError("Artwork not found.", 404);
  const validation = validateArtworkInput({
    ...editableMetadata(artwork), ...input, artist_id: artistId, rarity: artwork.rarity, active: artwork.active,
    art_style_adjustments: {}, detail_image_adjustments: [],
    thumbnail_adjustment: undefined, feature_card_adjustment: undefined,
  });
  if (!validation.ok) throw new ArtistExperienceError(validation.error);
  const changes = database.collection<ArtworkChangeRequest>("artwork_change_requests");
  await changes.createIndex({ artwork_id: 1 }, { unique: true });
  let existing = await changes.findOne({ artwork_id: artworkId });
  if (existing && existing.status !== "pending") {
    throw new ArtistExperienceError("This artwork's changes are already being reviewed.", 409);
  }
  const id = existing?._id ?? randomBytes(12).toString("hex");
  let image: ArtworkImageRecord | undefined;
  try {
    if (file) image = await publishArtworkUpload({ artworkId: id, file });
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = new Date();
      if (!existing) {
        const change: ArtworkChangeRequest = {
          _id: id, artwork_id: artworkId, artist_id: artistId, submitted_by: playerId,
          metadata: editableMetadata(validation.value), original: artwork,
          ...(image ? { image } : {}), status: "pending", revision: 1, created_at: now, updated_at: now,
        };
        try {
          await changes.insertOne(change);
          return change;
        } catch (error) {
          if (!isDuplicateKeyError(error) || attempt > 0) throw error;
          existing = await changes.findOne({ artwork_id: artworkId });
          if (!existing || existing.status !== "pending") {
            throw new ArtistExperienceError("This artwork's changes are already being reviewed.", 409);
          }
          continue;
        }
      }
      const revision = existing.revision ?? 0;
      const updated = await changes.findOneAndUpdate({
        _id: existing._id, artwork_id: artworkId, artist_id: artistId, status: "pending",
        ...(existing.revision === undefined ? { revision: { $exists: false } } : { revision }),
      }, {
        $set: {
          metadata: editableMetadata(validation.value), submitted_by: playerId, updated_at: now,
          ...(image ? { image } : {}),
        },
        $inc: { revision: 1 },
        ...(image && existing.image ? { $push: { retired_images: existing.image } } : {}),
      }, { returnDocument: "after" });
      if (!updated) {
        existing = await changes.findOne({ artwork_id: artworkId });
        if (!existing || existing.status !== "pending") {
          throw new ArtistExperienceError("This artwork's changes are already being reviewed.", 409);
        }
        continue;
      }
      if (image && existing.image) {
        try {
          await deleteArtworkImageRecord(existing.image, getArtworkImageStorageKeys(image));
          await changes.updateOne({ _id: updated._id }, { $pull: { retired_images: existing.image } });
        } catch { console.error("Superseded artwork change image cleanup failed"); }
      }
      return updated;
    }
    throw new ArtistExperienceError("The proposed changes were updated at the same time. Review them and try again.", 409);
  } catch (error) {
    if (image && !(await changes.findOne({ artwork_id: artworkId, image }))) {
      await deleteArtworkImageRecord(image).catch(() => console.error("Artwork change image cleanup failed"));
    }
    throw error;
  }
}

export async function approveArtworkChange(
  database: Db, id: string, input: Record<string, unknown>, reviewer: string,
) {
  const changes = database.collection<ArtworkChangeRequest>("artwork_change_requests");
  const change = await changes.findOne({ _id: id });
  if (!change) throw new ArtistExperienceError("Artwork change request not found.", 404);
  if (change.status === "denying") throw new ArtistExperienceError("This change request is being removed.", 409);
  const expectedRevision = Number.isSafeInteger(input.expectedRevision) ? Number(input.expectedRevision) : undefined;
  if (expectedRevision !== undefined && expectedRevision !== (change.revision ?? 0)) {
    throw new ArtistExperienceError("The artist updated these proposed changes. Reload them before reviewing.", 409);
  }
  const artworks = database.collection<EditableArtwork>("artworks");
  const current = await artworks.findOne({
    _id: change.artwork_id, artist_id: change.artist_id, submission_status: { $ne: "denying" },
  });
  if (!current) throw new ArtistExperienceError("The original artwork is no longer available.", 409);
  const validation = validateArtworkInput({
    ...change.metadata, ...input, artist_id: current.artist_id, rarity: current.rarity, active: current.active,
  });
  if (!validation.ok) throw new ArtistExperienceError(validation.error);
  const adjustments = validateArtworkImageAdjustments({
    art_style_adjustments: input.art_style_adjustments ?? current.art_style_adjustments,
    detail_image_adjustments: input.detail_image_adjustments ?? current.detail_image_adjustments,
    thumbnail_adjustment: input.thumbnail_adjustment ?? current.thumbnail_adjustment,
    feature_card_adjustment: input.feature_card_adjustment ?? current.feature_card_adjustment ?? current.thumbnail_adjustment,
  });
  if (!adjustments.ok) throw new ArtistExperienceError(adjustments.error);
  const now = new Date();
  const claimed = await changes.findOneAndUpdate(
    { _id: id, ...(expectedRevision === undefined ? {} : change.revision === undefined
      ? { revision: { $exists: false } } : { revision: expectedRevision }), $or: [
      { status: "pending" },
      { status: "approving", ...(current.last_artist_change_id === id
        ? {} : { approval_started_at: { $lte: new Date(now.getTime() - 120_000) } }) },
    ] },
    { $set: { status: "approving", approval_started_at: now } }, { returnDocument: "after" },
  );
  if (!claimed) throw new ArtistExperienceError("The change request is already being reviewed.", 409);
  let applied = current.last_artist_change_id === id;
  try {
    for (const retired of change.retired_images ?? []) {
      try {
        await deleteArtworkImageRecord(retired, change.image ? getArtworkImageStorageKeys(change.image) : undefined);
        await changes.updateOne({ _id: id, status: "approving" }, { $pull: { retired_images: retired } });
      } catch {
        throw new ArtistExperienceError("Superseded image cleanup could not finish. Retry accepting these changes.", 503);
      }
    }
    if (!applied) {
      const full = change.image?.variants.full;
      const ratio = full ? full.width / full.height : current.image_width && current.image_height
        ? current.image_width / current.image_height : current.width / current.height;
      const result = await artworks.updateOne({
        _id: current._id, artist_id: change.artist_id, submission_status: { $ne: "denying" },
        last_artist_change_id: { $ne: id },
        image: current.image ?? { $exists: false },
        height: current.height, width: current.width,
      }, {
        $set: {
          ...editableMetadata(validation.value), ...adjustments.value,
          width: Number((validation.value.height * ratio).toFixed(2)),
          ...(change.image ? { image: change.image, image_width: full!.width, image_height: full!.height } : {}),
          updated_at: new Date(), updated_by: reviewer, last_artist_change_id: id,
        },
        ...(change.image && current.image ? { $push: { retired_images: current.image } } : {}),
      });
      if (!result.matchedCount) {
        const saved = await artworks.findOne({ _id: current._id, last_artist_change_id: id });
        if (!saved) throw new ArtistExperienceError("The artwork changed during approval. Review it again.", 409);
      }
      applied = true;
    }
    await changes.deleteOne({ _id: id, status: "approving" });
  } catch (error) {
    if (!applied && !(await artworks.findOne({ _id: current._id, last_artist_change_id: id }))) {
      await changes.updateOne({ _id: id, status: "approving", approval_started_at: now }, {
        $set: { status: "pending" }, $unset: { approval_started_at: "" },
      });
    }
    throw error;
  }
  const saved = await artworks.findOne({ _id: current._id });
  if (change.image && saved?.image) {
    for (const retired of saved.retired_images ?? []) {
      try {
        await deleteArtworkImageRecord(retired, getArtworkImageStorageKeys(saved.image));
        await artworks.updateOne({ _id: current._id }, { $pull: { retired_images: retired } });
      } catch { console.error("Approved artwork change old image cleanup failed"); }
    }
  }
  return saved;
}

export async function denyArtworkChange(database: Db, id: string, expectedRevision?: number) {
  const changes = database.collection<ArtworkChangeRequest>("artwork_change_requests");
  const change = await changes.findOneAndUpdate(
    { _id: id, status: { $in: ["pending", "denying"] },
      ...(expectedRevision === undefined ? {} : expectedRevision === 0
        ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision }) },
    { $set: { status: "denying" } }, { returnDocument: "after" },
  );
  if (!change) throw new ArtistExperienceError("The change request is unavailable or is being accepted.", 409);
  for (const image of [change.image, ...(change.retired_images ?? [])].filter(
    (value): value is ArtworkImageRecord => Boolean(value),
  )) {
    try { await deleteArtworkImageRecord(image); }
    catch { throw new ArtistExperienceError("Image cleanup could not finish. Retry denying these changes.", 503); }
  }
  await changes.deleteOne({ _id: id, status: "denying" });
}

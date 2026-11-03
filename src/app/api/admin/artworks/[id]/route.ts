import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  deleteArtworkImageRecord,
  type ArtworkImageRecord,
  type LegacyArtworkImageRecord,
} from "@/server/artwork-storage";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import { withLeastRepresentedArtworkEffect, type ArtworkEffect } from "@/server/artwork-effects";
import { getRerollCost } from "@/server/item-reroll";
import { getDatabase } from "@/server/mongodb";
import { validateArtworkImageAdjustments, validateArtworkInput } from "@/server/artwork-create-input";
import { withLeastRepresentedRareSpecialAttribute } from "@/server/rare-special-attributes";
import {
  calculateItemDropChance,
  getItemDropChanceContext,
} from "@/server/item-drop-chance";

type EditableArtwork = Artwork & {
  image_width?: number;
  image_height?: number;
  nsfw?: boolean;
  updated_at?: Date;
  updated_by?: string;
  submission_status?: "pending" | "denying" | "approved";
  retired_images?: Array<ArtworkImageRecord | LegacyArtworkImageRecord>;
};

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const database = await getDatabase();
  const artwork = await database
    .collection<EditableArtwork>("artworks")
    .findOne({ _id: id });
  if (!artwork) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }
  const [itemCount, archiveCount] = await Promise.all([
    database.collection("items").countDocuments({ artwork_id: id }),
    database.collection("player_artwork_archives").countDocuments({
      artwork_id: id,
    }),
  ]);
  if (itemCount > 0 || archiveCount > 0) {
    const references = [
      itemCount > 0 ? `${itemCount} game item${itemCount === 1 ? "" : "s"}` : "",
      archiveCount > 0
        ? `${archiveCount} archive record${archiveCount === 1 ? "" : "s"}`
        : "",
    ]
      .filter(Boolean)
      .join(" and ");
    return NextResponse.json(
      {
        error: `Cannot delete ${artwork.title} while it is referenced by ${references}. Deactivate it instead.`,
      },
      { status: 409 },
    );
  }
  const artistSubmission = artwork.submission_status === "pending" || artwork.submission_status === "denying";
  if (artistSubmission) {
    const claimed = artwork.submission_status === "denying" ? artwork : await database
      .collection<EditableArtwork>("artworks").findOneAndUpdate(
        { _id: id, submission_status: "pending", active: false },
        { $set: { submission_status: "denying" } }, { returnDocument: "after" },
      );
    if (!claimed) return NextResponse.json({ error: "The submission changed before it could be denied." }, { status: 409 });
    try {
      if (claimed.image) await deleteArtworkImageRecord(claimed.image as ArtworkImageRecord);
      for (const image of claimed.retired_images ?? []) {
        await deleteArtworkImageRecord(image);
      }
    } catch {
      return NextResponse.json({ error: "Image cleanup could not finish. Retry denying this submission." }, { status: 503 });
    }
  }
  const deleted = await database.collection<EditableArtwork>("artworks").deleteOne({
    _id: id, ...(artistSubmission ? { submission_status: "denying", active: false } : {}),
  });
  if (deleted.deletedCount !== 1) {
    return NextResponse.json(
      { error: "The artwork changed before it could be deleted." },
      { status: 409 },
    );
  }
  await deleteCommunityReactions(database, "artwork", [id]);
  console.info("Deleted artwork catalog record", {
    artworkId: id,
    title: artwork.title,
    deletedBy: auth.session.email,
  });
  return NextResponse.json({
    message: `Deleted artwork ${artwork.title}.`,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  if (body.action === "approve") {
    return approveSubmission(id, body, auth.session.email);
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const genre = typeof body.genre === "string" ? body.genre.trim() : "";
  const medium = typeof body.medium === "string" ? body.medium.trim() : "";
  const artistId =
    typeof body.artist_id === "string" ? body.artist_id.trim() : "";
  const date = Number(body.date);
  const height = Number(body.height);
  let valueScale = Number(body.value_scale);
  const effectId =
    typeof body.effect_id === "string" && body.effect_id.trim()
      ? body.effect_id.trim()
      : undefined;
  const specialAttributeIds = Array.isArray(body.special_attributes)
    ? [
        ...new Set(
          body.special_attributes.flatMap((value) =>
            typeof value === "string" && value.trim() ? [value.trim()] : [],
          ),
        ),
      ]
    : [];
  if (!title || !genre || !medium || !artistId) {
    return NextResponse.json(
      { error: "Complete all required artwork fields." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(date) || !Number.isFinite(height) || height <= 0) {
    return NextResponse.json(
      { error: "Provide valid artwork dimensions and date." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const [existing, artist, metadata] = await Promise.all([
    database.collection<EditableArtwork>("artworks").findOne({ _id: id }),
    database
      .collection<{ _id: string; artist_name: string }>("artists")
      .findOne({ _id: artistId }),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!existing) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }
  if (existing.submission_status === "denying") {
    return NextResponse.json({ error: "This submission is being removed and cannot be accepted." }, { status: 409 });
  }
  const adjustments = validateArtworkImageAdjustments({
    art_style_adjustments: body.art_style_adjustments === undefined
      ? existing.art_style_adjustments : body.art_style_adjustments,
    detail_image_adjustments: body.detail_image_adjustments === undefined
      ? existing.detail_image_adjustments : body.detail_image_adjustments,
    thumbnail_adjustment: body.thumbnail_adjustment === undefined
      ? existing.thumbnail_adjustment : body.thumbnail_adjustment,
    feature_card_adjustment: body.feature_card_adjustment === undefined
      ? existing.feature_card_adjustment ?? existing.thumbnail_adjustment : body.feature_card_adjustment,
  });
  if (!adjustments.ok) {
    return NextResponse.json({ error: adjustments.error }, { status: 400 });
  }
  const rarityValue =
    typeof body.rarity === "string" ? body.rarity : existing.rarity;
  const validRarities = [
    "common",
    "uncommon",
    "rare",
    "legendary",
    "masterpiece",
  ] as const;
  if (!validRarities.includes(rarityValue as (typeof validRarities)[number])) {
    return NextResponse.json({ error: "Invalid artwork rarity." }, { status: 400 });
  }
  const rarity = rarityValue as Artwork["rarity"];
  if (rarity === "rare" && specialAttributeIds.length !== 1) {
    return NextResponse.json(
      { error: "Rare artworks require exactly one special attribute." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(valueScale)) {
    valueScale = existing.value_scale;
  }
  if (!artist || !metadata) {
    return NextResponse.json(
      { error: "The selected artist is unavailable." },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(valueScale) ||
    valueScale < 0 ||
    valueScale > 1
  ) {
    return NextResponse.json(
      { error: "Value scale must be a number between 0 and 1." },
      { status: 400 },
    );
  }
  const rareSpecialAttributeId =
    rarity === "rare" ? specialAttributeIds[0] : undefined;
  if (rareSpecialAttributeId) {
    const attribute = await database
      .collection<{ _id: string; active: boolean }>("attributes")
      .findOne({ _id: rareSpecialAttributeId });
    if (!attribute) {
      return NextResponse.json(
        { error: "The selected rare special attribute is unavailable." },
        { status: 400 },
      );
    }
    if (body.active === true && !attribute.active) {
      return NextResponse.json(
        { error: "Active rare artwork requires an active special attribute." },
        { status: 400 },
      );
    }
  }
  const rarityChanged = rarity !== existing.rarity;
  const valueScaleChanged = valueScale !== existing.value_scale;
  if (rarity === "legendary" || rarity === "masterpiece") {
    if (!effectId) {
      return NextResponse.json(
        { error: "Legendary and masterpiece artworks require a unique effect." },
        { status: 400 },
      );
    }
    const effect = await database
      .collection<ArtworkEffect>("artwork_effects")
      .findOne({ _id: effectId });
    if (!effect || effect.effect_type !== rarity) {
      return NextResponse.json(
        { error: "The selected unique effect does not match the artwork rarity." },
        { status: 400 },
      );
    }
    if (body.active === true && !effect.active) {
      return NextResponse.json(
        { error: "Active artwork requires an active unique effect." },
        { status: 400 },
      );
    }
  }
  const artworkEffectType =
    rarity === "legendary" || rarity === "masterpiece" ? rarity : undefined;
  const artworkEffectId = artworkEffectType ? effectId : undefined;
  const imageRatio =
    existing.image_width && existing.image_height
      ? existing.image_width / existing.image_height
      : existing.width / existing.height;
  const updatedArtwork: EditableArtwork = {
    ...existing,
    ...adjustments.value,
    artist_id: artist._id,
    artist: artist.artist_name,
    title,
    date,
    genre,
    medium,
    rarity,
    value_scale: valueScale,
    ...(artworkEffectId
      ? { effect_id: artworkEffectId }
      : { effect_id: undefined }),
    ...(rareSpecialAttributeId
      ? { special_attributes: [rareSpecialAttributeId] }
      : { special_attributes: undefined }),
    height,
    width: Number((height * imageRatio).toFixed(2)),
    active: body.active === true,
    nsfw: body.nsfw === true,
    updated_at: new Date(),
    updated_by: auth.session.email,
  };
  const items =
    rarityChanged || valueScaleChanged
      ? await database
          .collection<GameItem>("items")
          .find({ artwork_id: id })
          .toArray()
      : [];
  const artworkFields = {
    artist_id: updatedArtwork.artist_id,
    artist: updatedArtwork.artist,
    title: updatedArtwork.title,
    date: updatedArtwork.date,
    genre: updatedArtwork.genre,
    medium: updatedArtwork.medium,
    rarity: updatedArtwork.rarity,
    value_scale: updatedArtwork.value_scale,
    height: updatedArtwork.height,
    width: updatedArtwork.width,
    active: updatedArtwork.active,
    nsfw: updatedArtwork.nsfw,
    art_style_adjustments: updatedArtwork.art_style_adjustments,
    detail_image_adjustments: updatedArtwork.detail_image_adjustments,
    thumbnail_adjustment: updatedArtwork.thumbnail_adjustment,
    feature_card_adjustment: updatedArtwork.feature_card_adjustment,
    updated_at: updatedArtwork.updated_at,
    updated_by: updatedArtwork.updated_by,
    ...(existing.submission_status === "pending" && updatedArtwork.active
      ? { submission_status: "approved" as const, reviewed_at: updatedArtwork.updated_at, reviewed_by: auth.session.email }
      : {}),
    ...(artworkEffectId ? { effect_id: artworkEffectId } : {}),
    ...(rareSpecialAttributeId
      ? { special_attributes: [rareSpecialAttributeId] }
      : {}),
  };
  const artworkFieldsToUnset: Partial<
    Record<"effect_id" | "special_attributes", "">
  > = {
    ...(!artworkEffectId ? { effect_id: "" } : {}),
    ...(!rareSpecialAttributeId ? { special_attributes: "" } : {}),
  };
  const restoreArtwork = () =>
    database.collection<EditableArtwork>("artworks").updateOne(
      { _id: id, updated_at: updatedArtwork.updated_at },
      {
        $set: {
          artist_id: existing.artist_id,
          artist: existing.artist,
          title: existing.title,
          date: existing.date,
          genre: existing.genre,
          medium: existing.medium,
          rarity: existing.rarity,
          value_scale: existing.value_scale,
          height: existing.height,
          width: existing.width,
          active: existing.active,
          nsfw: existing.nsfw ?? false,
          ...(existing.art_style_adjustments ? { art_style_adjustments: existing.art_style_adjustments } : {}),
          ...(existing.detail_image_adjustments ? { detail_image_adjustments: existing.detail_image_adjustments } : {}),
          ...(existing.thumbnail_adjustment ? { thumbnail_adjustment: existing.thumbnail_adjustment } : {}),
          ...(existing.feature_card_adjustment ? { feature_card_adjustment: existing.feature_card_adjustment } : {}),
          ...(existing.updated_at ? { updated_at: existing.updated_at } : {}),
          ...(existing.updated_by ? { updated_by: existing.updated_by } : {}),
          ...(existing.submission_status ? { submission_status: existing.submission_status } : {}),
          ...(existing.effect_id ? { effect_id: existing.effect_id } : {}),
          ...(existing.special_attributes
            ? { special_attributes: existing.special_attributes }
            : {}),
        },
        $unset: {
          ...(!existing.art_style_adjustments ? { art_style_adjustments: "" } : {}),
          ...(!existing.detail_image_adjustments ? { detail_image_adjustments: "" } : {}),
          ...(!existing.thumbnail_adjustment ? { thumbnail_adjustment: "" } : {}),
          ...(!existing.feature_card_adjustment ? { feature_card_adjustment: "" } : {}),
          ...(!existing.effect_id ? { effect_id: "" } : {}),
          ...(!existing.special_attributes ? { special_attributes: "" } : {}),
          ...(!existing.updated_at ? { updated_at: "" } : {}),
          ...(!existing.updated_by ? { updated_by: "" } : {}),
        },
      },
    );
  const artworkUpdated = await database
    .collection<EditableArtwork>("artworks")
    .updateOne(
      { _id: id, ...(existing.submission_status ? { submission_status: existing.submission_status } : {}) },
      {
        $set: artworkFields,
        ...(Object.keys(artworkFieldsToUnset).length > 0
          ? { $unset: artworkFieldsToUnset }
          : {}),
      },
    );
  if (artworkUpdated.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The artwork changed before it could be saved." },
      { status: 409 },
    );
  }
  if (
    updatedArtwork.active &&
    artworkEffectId &&
    artworkEffectType &&
    !(await database.collection<ArtworkEffect>("artwork_effects").findOne({
      _id: artworkEffectId,
      effect_type: artworkEffectType,
      active: true,
    }))
  ) {
    const restored = await restoreArtwork();
    if (restored.matchedCount !== 1) {
      throw new Error(
        "Artwork activation conflicted with effect deactivation and rollback failed.",
      );
    }
    return NextResponse.json(
      { error: "Active artwork requires an active unique effect." },
      { status: 409 },
    );
  }
  try {
    if (items.length > 0) {
      const dropChanceContext = await getItemDropChanceContext(database);
      await database.collection<GameItem>("items").bulkWrite(
        items.map((item) => ({
          updateOne: {
            filter: { _id: item._id, artwork_id: id },
            update: {
              $set: {
                ...calculateItemDropChance(item, updatedArtwork, dropChanceContext),
                values: calculateItemValues(
                  item,
                  updatedArtwork,
                  metadata.loot_data,
                ),
                reroll_cost: getRerollCost(
                  item,
                  rarity,
                  metadata.loot_data,
                ),
              },
            },
          },
        })),
      );
    }
  } catch (error) {
    const restored = await restoreArtwork();
    let itemsRestored = true;
    try {
      if (items.length > 0) {
        const dropChanceContext = await getItemDropChanceContext(database);
        const rollback = await database.collection<GameItem>("items").bulkWrite(
          items.map((item) => ({
            updateOne: {
              filter: { _id: item._id, artwork_id: id },
              update: {
                $set: {
                  ...calculateItemDropChance(item, existing, dropChanceContext),
                  values: calculateItemValues(
                    item,
                    existing,
                    metadata.loot_data,
                  ),
                  reroll_cost: getRerollCost(
                    item,
                    existing.rarity,
                    metadata.loot_data,
                  ),
                },
              },
            },
          })),
        );
        itemsRestored = rollback.matchedCount === items.length;
      }
    } catch {
      itemsRestored = false;
    }
    if (restored.matchedCount !== 1 || !itemsRestored) {
      throw new Error("Artwork item updates failed and rollback failed.", {
        cause: error,
      });
    }
    throw error;
  }

  const savedArtwork = await database
    .collection<EditableArtwork>("artworks")
    .findOne({ _id: id });
  if (!savedArtwork) {
    return NextResponse.json(
      { error: "The updated artwork could not be reloaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    artwork: savedArtwork,
    message: items.length
      ? `Updated ${title} and recalculated ${items.length} item${items.length === 1 ? "" : "s"}.`
      : `Updated ${title}.`,
  });
}

async function approveSubmission(id: string, body: Record<string, unknown>, reviewer: string) {
  const database = await getDatabase();
  const collection = database.collection<EditableArtwork>("artworks");
  const existing = await collection.findOne({ _id: id });
  if (!existing) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }
  if (existing.submission_status !== "pending" || existing.active !== false) {
    return NextResponse.json({ error: "This artwork is no longer awaiting acceptance." }, { status: 409 });
  }
  const validation = validateArtworkInput({
    ...existing, ...body, artist_id: existing.artist_id, active: true,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const artist = await database
    .collection<{ _id: string; artist_name: string }>("artists")
    .findOne({ _id: existing.artist_id });
  if (!artist) {
    return NextResponse.json({ error: "The submitting artist is unavailable." }, { status: 400 });
  }
  const input = validation.value;
  const now = new Date();
  const valueScale = Math.random();
  const ratio = existing.image_width && existing.image_height
    ? existing.image_width / existing.image_height : existing.width / existing.height;
  const accept = (effect?: ArtworkEffect, rareAttributeId?: string) =>
    collection.findOneAndUpdate(
      { _id: id, submission_status: "pending", active: false },
      {
        $set: {
          ...input,
          artist: artist.artist_name,
          width: Number((input.height * ratio).toFixed(2)),
          value_scale: valueScale,
          submission_status: "approved",
          updated_at: now,
          updated_by: reviewer,
          reviewed_at: now,
          reviewed_by: reviewer,
          ...(effect ? { effect_id: effect._id } : {}),
          ...(rareAttributeId ? { special_attributes: [rareAttributeId] } : {}),
        },
        $unset: {
          ...(!effect ? { effect_id: "" as const } : {}),
          ...(!rareAttributeId ? { special_attributes: "" as const } : {}),
        },
      },
      { returnDocument: "after" },
    );
  try {
    const saved = input.rarity === "legendary" || input.rarity === "masterpiece"
      ? await withLeastRepresentedArtworkEffect(database, input.rarity, accept)
      : input.rarity === "rare"
        ? await withLeastRepresentedRareSpecialAttribute(database, attribute => accept(undefined, attribute._id))
        : await accept();
    if (!saved) {
      return NextResponse.json({ error: "The submission changed before it could be accepted." }, { status: 409 });
    }
    return NextResponse.json({ artwork: saved, message: `Accepted ${saved.title}.` });
  } catch (error) {
    console.error("Unable to accept artwork submission", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The submission could not be accepted." },
      { status: 400 },
    );
  }
}

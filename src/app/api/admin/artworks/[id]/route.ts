import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import type { ArtworkEffect } from "@/server/artwork-effects-core";
import { getRerollCost } from "@/server/item-reroll";
import { getDatabase } from "@/server/mongodb";

type EditableArtwork = Artwork & {
  image_width?: number;
  image_height?: number;
  nsfw?: boolean;
  updated_at?: Date;
  updated_by?: string;
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
  const deleted = await database.collection<EditableArtwork>("artworks").deleteOne({
    _id: id,
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
    updated_at: updatedArtwork.updated_at,
    updated_by: updatedArtwork.updated_by,
    ...(artworkEffectId ? { effect_id: artworkEffectId } : {}),
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
          ...(existing.updated_at ? { updated_at: existing.updated_at } : {}),
          ...(existing.updated_by ? { updated_by: existing.updated_by } : {}),
          ...(existing.effect_id ? { effect_id: existing.effect_id } : {}),
        },
        $unset: {
          ...(!existing.effect_id ? { effect_id: "" } : {}),
          ...(!existing.updated_at ? { updated_at: "" } : {}),
          ...(!existing.updated_by ? { updated_by: "" } : {}),
        },
      },
    );
  const artworkUpdated = await database
    .collection<EditableArtwork>("artworks")
    .updateOne(
      { _id: id },
      {
        $set: artworkFields,
        ...(artworkEffectId ? {} : { $unset: { effect_id: "" } }),
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
      await database.collection<GameItem>("items").bulkWrite(
        items.map((item) => ({
          updateOne: {
            filter: { _id: item._id, artwork_id: id },
            update: {
              $set: {
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
        const rollback = await database.collection<GameItem>("items").bulkWrite(
          items.map((item) => ({
            updateOne: {
              filter: { _id: item._id, artwork_id: id },
              update: {
                $set: {
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

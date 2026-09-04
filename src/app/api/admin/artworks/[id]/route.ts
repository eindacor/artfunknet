import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  ARTWORK_RARITIES,
  calculateItemValues,
  getSpecialAttributeCount,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import { getRerollCost } from "@/server/item-reroll";
import { deriveArtworkLegendaryAttributeIds } from "@/server/legendary-attributes";
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
  const valueScale = Number(body.value_scale);
  const height = Number(body.height);
  const rarity = body.rarity as ArtworkRarity;
  const specialAttributes = Array.isArray(body.special_attributes)
    ? [...new Set(body.special_attributes.filter((id): id is string => typeof id === "string"))]
    : [];
  if (!title || !genre || !medium || !artistId) {
    return NextResponse.json(
      { error: "Complete all required artwork fields." },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(date) ||
    !Number.isFinite(valueScale) ||
    valueScale < 0 ||
    valueScale > 1 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !ARTWORK_RARITIES.includes(rarity)
  ) {
    return NextResponse.json(
      { error: "Provide valid artwork dimensions, value, date, and rarity." },
      { status: 400 },
    );
  }
  const expectedAttributes = getSpecialAttributeCount(rarity);
  if (specialAttributes.length !== expectedAttributes) {
    return NextResponse.json(
      {
        error: `${rarity} artwork requires ${expectedAttributes} special attribute${expectedAttributes === 1 ? "" : "s"}.`,
      },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const [existing, artist, activeAttributeCount, metadata] = await Promise.all([
    database.collection<EditableArtwork>("artworks").findOne({ _id: id }),
    database
      .collection<{ _id: string; artist_name: string }>("artists")
      .findOne({ _id: artistId }),
    database
      .collection<{ _id: string; active: boolean }>("attributes")
      .countDocuments({
      _id: { $in: specialAttributes },
      active: true,
      }),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!existing) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }
  if (!artist || activeAttributeCount !== specialAttributes.length || !metadata) {
    return NextResponse.json(
      { error: "The selected artist or attributes are unavailable." },
      { status: 400 },
    );
  }
  const uniqueAttributes = await deriveArtworkLegendaryAttributeIds(
    database,
    specialAttributes,
  );
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
    height,
    width: Number((height * imageRatio).toFixed(2)),
    active: body.active === true,
    nsfw: body.nsfw === true,
    special_attributes: specialAttributes,
    unique_attributes: uniqueAttributes,
  };
  const items = await database
    .collection<GameItem>("items")
    .find({ artwork_id: id })
    .toArray();
  const artworkUpdated = await database.collection<EditableArtwork>("artworks").replaceOne(
    { _id: id },
    {
      ...updatedArtwork,
      updated_at: new Date(),
      updated_by: auth.session.email,
    },
  );
  if (artworkUpdated.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The artwork changed before it could be saved." },
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
    const restored = await database
      .collection<EditableArtwork>("artworks")
      .replaceOne({ _id: id }, existing);
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

  return NextResponse.json({
    artwork: updatedArtwork,
    message: `Updated ${title} and recalculated ${items.length} item${items.length === 1 ? "" : "s"}.`,
  });
}

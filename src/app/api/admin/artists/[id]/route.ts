import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";

type Artist = {
  _id: string;
  artist_name: string;
  date_of_birth?: string | null;
  date_of_death?: string | null;
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
  const artist = await database.collection<Artist>("artists").findOne({ _id: id });
  if (!artist) {
    return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  }
  const artworkCount = await database
    .collection("artworks")
    .countDocuments({ artist_id: id });
  if (artworkCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete ${artist.artist_name} while ${artworkCount} artwork record${artworkCount === 1 ? " is" : "s are"} linked to the artist.`,
      },
      { status: 409 },
    );
  }
  const deleted = await database.collection<Artist>("artists").deleteOne({
    _id: id,
    artist_name: artist.artist_name,
  });
  if (deleted.deletedCount !== 1) {
    return NextResponse.json(
      { error: "The artist changed before it could be deleted." },
      { status: 409 },
    );
  }
  console.info("Deleted artist catalog record", {
    artistId: id,
    artistName: artist.artist_name,
    deletedBy: auth.session.email,
  });
  return NextResponse.json({
    message: `Deleted artist ${artist.artist_name}.`,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = (await request.json()) as {
    artist_name?: unknown;
    date_of_birth?: unknown;
    date_of_death?: unknown;
  };
  const name =
    typeof body.artist_name === "string" ? body.artist_name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Artist name is required." },
      { status: 400 },
    );
  }
  if (
    (body.date_of_birth !== undefined &&
      typeof body.date_of_birth !== "string") ||
    (body.date_of_death !== undefined &&
      typeof body.date_of_death !== "string")
  ) {
    return NextResponse.json(
      { error: "Artist dates must be text values." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const existing = await database.collection<Artist>("artists").findOne({
    _id: id,
  });
  if (!existing) {
    return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  }
  const updatedArtist: Artist = {
    ...existing,
    artist_name: name,
    date_of_birth: body.date_of_birth?.trim() || null,
    date_of_death: body.date_of_death?.trim() || null,
  };
  try {
    const updated = await database.collection<Artist>("artists").replaceOne(
      { _id: id, artist_name: existing.artist_name },
      {
        ...updatedArtist,
        updated_at: new Date(),
        updated_by: auth.session.email,
      },
    );
    if (updated.matchedCount !== 1) {
      return NextResponse.json(
        { error: "The artist changed before it could be saved." },
        { status: 409 },
      );
    }
    try {
      await database.collection("artworks").updateMany(
        { artist_id: id },
        {
          $set: {
            artist: name,
            updated_at: new Date(),
            updated_by: auth.session.email,
          },
        },
      );
    } catch (error) {
      const [restored, artworksRestored] = await Promise.all([
        database
          .collection<Artist>("artists")
          .replaceOne({ _id: id, artist_name: name }, existing),
        database
          .collection("artworks")
          .updateMany({ artist_id: id }, { $set: { artist: existing.artist_name } }),
      ]);
      if (restored.matchedCount !== 1 || !artworksRestored.acknowledged) {
        throw new Error("Artist propagation failed and rollback failed.", {
          cause: error,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(
        { error: "An artist with that name already exists." },
        { status: 409 },
      );
    }
    throw error;
  }

  const artworkCount = await database
    .collection("artworks")
    .countDocuments({ artist_id: id });
  return NextResponse.json({
    artist: {
      id,
      name,
      dateOfBirth: updatedArtist.date_of_birth ?? "",
      dateOfDeath: updatedArtist.date_of_death ?? "",
      artworkCount,
    },
    message: `Updated ${name} and ${artworkCount} linked artwork records.`,
  });
}

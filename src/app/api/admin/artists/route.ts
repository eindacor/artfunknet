import { MongoServerError, ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as {
    artist_name?: string;
    date_of_birth?: string;
    date_of_death?: string;
  };
  const artistName = body.artist_name?.trim();

  if (!artistName) {
    return NextResponse.json(
      { error: "Artist name is required." },
      { status: 400 },
    );
  }

  const artist = {
    _id: new ObjectId().toHexString(),
    artist_name: artistName,
    date_of_birth: body.date_of_birth?.trim() || null,
    date_of_death: body.date_of_death?.trim() || null,
    created_at: new Date(),
    created_by: auth.session.email,
  };

  try {
    const database = await getDatabase();
    const result = await database
      .collection<typeof artist>("artists")
      .insertOne(artist);

    return NextResponse.json(
      { artist: { ...artist, _id: result.insertedId } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(
        { error: "An artist with that name already exists." },
        { status: 409 },
      );
    }

    throw error;
  }
}

import { NextResponse } from "next/server";

import {
  readArtworkObject,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";

type Artwork = {
  _id: string;
  active: boolean;
  image: {
    content_type: string;
    storage: ArtworkStorageReference;
  };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const database = await getDatabase();
  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: id, active: true });

  if (!artwork?.image?.storage) {
    return NextResponse.json(
      { error: "Artwork image was not found." },
      { status: 404 },
    );
  }

  try {
    const image = await readArtworkObject(artwork.image.storage);

    return new NextResponse(new Uint8Array(image), {
      headers: {
        "content-type": artwork.image.content_type,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Unable to load artwork image", error);
    return NextResponse.json(
      { error: "Artwork image was not found." },
      { status: 404 },
    );
  }
}

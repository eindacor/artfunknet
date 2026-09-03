import { NextResponse } from "next/server";

import {
  readArtworkObject,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";

type Artwork = {
  _id: string;
  active: boolean;
  image?: {
    content_type: string;
    storage: ArtworkStorageReference;
  };
};

async function readFallbackArtwork(database: Awaited<ReturnType<typeof getDatabase>>) {
  const fallback = await database
    .collection<Artwork>("artworks")
    .findOne({
      title: "Mona Lisa",
      artist: "Leonardo da Vinci",
      active: true,
    });

  if (!fallback?.image?.storage) {
    throw new Error("The Mona Lisa fallback image is unavailable.");
  }

  return {
    bytes: await readArtworkObject(fallback.image.storage),
    contentType: fallback.image.content_type,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const database = await getDatabase();
  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: id, active: true });

  try {
    const image = artwork?.image?.storage
      ? {
          bytes: await readArtworkObject(artwork.image.storage),
          contentType: artwork.image.content_type,
        }
      : await readFallbackArtwork(database);

    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.contentType,
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

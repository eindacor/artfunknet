import { NextResponse } from "next/server";

import seedImage from "@/components/seed_image.png";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const database = await getDatabase();
  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: id, active: true });

  if (!artwork?.image?.storage) {
    return NextResponse.redirect(new URL(seedImage.src, request.url), {
      status: 307,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  try {
    const image = {
      bytes: await readArtworkObject(artwork.image.storage),
      contentType: artwork.image.content_type,
    };

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

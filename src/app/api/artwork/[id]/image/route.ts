import { NextResponse } from "next/server";

import seedImage from "@/components/seed_image.png";
import {
  getArtworkObjectPublicUrl,
  readArtworkObject,
  type ArtworkImageRecord,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";
import { logOperationalError } from "@/server/operational-logging";

type Artwork = {
  _id: string;
  active: boolean;
  image?:
    | ArtworkImageRecord
    | {
        content_type: string;
        storage: ArtworkStorageReference;
      };
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const requestedVariant = getRequestedVariant(request);
  const database = await getDatabase();
  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: id, active: true });

  const image = artwork?.image
    ? resolveImageVariant(artwork.image, requestedVariant)
    : null;
  if (!image) {
    return NextResponse.redirect(new URL(seedImage.src, request.url), {
      status: 307,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  const publicUrl = getArtworkObjectPublicUrl(image.storage);
  if (publicUrl) {
    return NextResponse.redirect(publicUrl, {
      status: 307,
      headers: {
        "cache-control": "no-store",
        "x-artwork-image-variant": image.variant,
      },
    });
  }

  try {
    const bytes = await readArtworkObject(image.storage);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": image.contentType,
        "cache-control": "no-store",
        "x-artwork-image-variant": image.variant,
      },
    });
  } catch (error) {
    logOperationalError("artwork_image.delivery_failed", error, {
      artworkId: id,
      requestedVariant,
      storageKey: image.storage.key,
      storageProvider: image.storage.provider,
    });
    return NextResponse.json(
      { error: "Artwork image was not found." },
      { status: 404 },
    );
  }
}

function getRequestedVariant(
  request: Request,
): "full" | "card" | "thumb" {
  const value = new URL(request.url).searchParams.get("variant");
  return value === "card" || value === "thumb" ? value : "full";
}

function resolveImageVariant(
  image: NonNullable<Artwork["image"]>,
  requested: "full" | "card" | "thumb",
): {
  contentType: string;
  storage: ArtworkStorageReference;
  variant: "full" | "card" | "thumb" | "legacy";
} | null {
  if ("variants" in image) {
    const fallbackOrder =
      requested === "thumb"
        ? ["thumb", "card", "full"]
        : requested === "card"
          ? ["card", "full", "thumb"]
          : ["full", "card", "thumb"];
    for (const variant of fallbackOrder) {
      const resolved =
        image.variants[variant as keyof ArtworkImageRecord["variants"]];
      if (resolved) {
        return {
          contentType: resolved.content_type,
          storage: resolved.storage,
          variant: variant as "full" | "card" | "thumb",
        };
      }
    }
    return null;
  }

  return {
    contentType: image.content_type,
    storage: image.storage,
    variant: "legacy",
  };
}

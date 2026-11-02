import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import seedImage from "@/components/seed_image.png";
import {
  ARTWORK_IMAGE_VARIANT_FALLBACKS,
  getArtworkImageVersion,
} from "@/server/artwork-image-url";
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
    try {
      const seedFilePath = path.join(process.cwd(), "src", "components", "seed_image.png");
      const seedBuffer = await fs.readFile(seedFilePath);
      return new NextResponse(seedBuffer, {
        headers: {
          "content-type": "image/png",
          "cache-control": "no-store",
          "x-artwork-image-variant": "seed",
        },
      });
    } catch {
      return NextResponse.redirect(new URL(seedImage.src, request.url), {
        status: 307,
        headers: {
          "cache-control": "no-store",
        },
      });
    }
  }

  const url = new URL(request.url);
  const version = getArtworkImageVersion(artwork?.image, requestedVariant);
  if (version && url.searchParams.has("v") && url.searchParams.get("v") !== version) {
    url.searchParams.set("v", version);
    return NextResponse.redirect(url, { status: 307, headers: { "cache-control": "no-store" } });
  }
  const headers: Record<string, string> = {
    "cache-control": version && url.searchParams.get("v") === version
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
    "x-artwork-image-variant": image.variant,
  };
  if (version) {
    headers.etag = `"${version}"`;
    if (matchesETag(request, headers.etag)) {
      return new NextResponse(null, { status: 304, headers });
    }
  }

  const publicUrl = getArtworkObjectPublicUrl(image.storage);
  // WebGL textures must stay same-origin when the CDN has no CORS policy.
  if (publicUrl && url.searchParams.get("texture") !== "1") {
    return NextResponse.redirect(publicUrl, {
      status: 307,
      headers,
    });
  }

  try {
    const bytes = await readArtworkObject(image.storage);
    headers.etag ??= `"${createHash("sha256").update(bytes).digest("hex")}"`;
    if (matchesETag(request, headers.etag)) {
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "content-type": image.contentType,
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
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
}

function matchesETag(request: Request, etag: string): boolean {
  return (request.headers.get("if-none-match") ?? "").split(",").some((value) =>
    value.trim() === "*" || value.trim().replace(/^W\//, "") === etag,
  );
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
    for (const variant of ARTWORK_IMAGE_VARIANT_FALLBACKS[requested]) {
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

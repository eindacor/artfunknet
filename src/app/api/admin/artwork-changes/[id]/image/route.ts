import { NextResponse } from "next/server";
import { requireAdminApi } from "@/server/admin-api";
import type { ArtworkChangeRequest } from "@/server/artist-artwork-changes";
import { readArtworkObject } from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const change = await (await getDatabase()).collection<ArtworkChangeRequest>("artwork_change_requests").findOne({ _id: id });
  const image = change?.image?.variants.card;
  if (!image) return NextResponse.json({ error: "Proposed image not found." }, { status: 404 });
  try {
    return new NextResponse(new Uint8Array(await readArtworkObject(image.storage)), {
      headers: { "content-type": image.content_type, "cache-control": "private, no-store", vary: "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "Proposed image could not be loaded." }, { status: 404 });
  }
}

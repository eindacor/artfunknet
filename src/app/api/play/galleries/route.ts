import { NextResponse } from "next/server";

import {
  ensureGalleryMetadata,
  refreshAllGalleryMetadata,
  type GalleryMetadata,
} from "@/server/gallery-metadata";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

const EXPANDED_PAGE_SIZE = 12;
const LIST_PAGE_SIZE = 30;

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "list" ? "list" : "expanded";
  const pageSize =
    view === "list" ? LIST_PAGE_SIZE : EXPANDED_PAGE_SIZE;
  const page = Math.max(
    1,
    Math.floor(Number(searchParams.get("page")) || 1),
  );
  const search = searchParams.get("search")?.trim() ?? "";
  const database = await getDatabase();

  if (searchParams.get("refresh") === "true") {
    await refreshAllGalleryMetadata(database);
  } else {
    await ensureGalleryMetadata(database);
  }

  const filter = {
    owner_id: { $ne: auth.session.playerId },
    display_count: { $gt: 0 },
    ...(search
      ? { owner: { $regex: escapeRegex(search), $options: "i" } }
      : {}),
  };
  const galleries = database.collection<GalleryMetadata>("galleries");
  const [records, total] = await Promise.all([
    galleries
      .find(filter)
      .sort({ value: -1, owner: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    galleries.countDocuments(filter),
  ]);

  return NextResponse.json({
    galleries: records,
    total,
    page,
    pageSize,
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

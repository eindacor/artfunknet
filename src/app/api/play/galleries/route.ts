import { NextResponse } from "next/server";
import type { Sort } from "mongodb";

import {
  ensureGalleryMetadata,
  refreshAllGalleryMetadata,
  type GalleryMetadata,
} from "@/server/gallery-metadata";
import { getCommunityReactionSummaries } from "@/server/community-reactions";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import type { GallerySort } from "@/server/player-view-settings";

const EXPANDED_PAGE_SIZE = 12;
const LIST_PAGE_SIZE = 30;

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "list" ? "list" : "expanded";
  const sort = getGallerySort(searchParams.get("sort"));
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
    active: true,
    display_count: { $gt: 0 },
    ...(search
      ? { owner: { $regex: escapeRegex(search), $options: "i" } }
      : {}),
  };
  const galleries = database.collection<GalleryMetadata>("galleries");
  const [records, total] = await Promise.all([
    galleries
      .find(filter)
      .sort(getGallerySortDocument(sort))
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    galleries.countDocuments(filter),
  ]);
  const reactions = await getCommunityReactionSummaries(
    database,
    "gallery",
    records.map((record) => record.owner_id),
    auth.session.playerId,
  );

  return NextResponse.json({
    galleries: records.map((record) => ({
      ...record,
      reactions: reactions.get(record.owner_id),
    })),
    total,
    page,
    pageSize,
  });
}

function getGallerySort(value: string | null): GallerySort {
  return value === "score" ||
    value === "works" ||
    value === "name"
    ? value
    : "value";
}

function getGallerySortDocument(sort: GallerySort): Sort {
  switch (sort) {
    case "score":
      return { score: -1 as const, owner: 1 as const };
    case "works":
      return { display_count: -1 as const, owner: 1 as const };
    case "name":
      return { owner: 1 as const };
    case "value":
      return { value: -1 as const, owner: 1 as const };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

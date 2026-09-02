import { NextResponse } from "next/server";

import { getAuctionViews } from "@/server/auction-gameplay";
import { ARTWORK_RARITIES, type ArtworkRarity } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const rarities = params
    .getAll("rarity")
    .filter((rarity): rarity is ArtworkRarity =>
      ARTWORK_RARITIES.includes(rarity as ArtworkRarity),
    );
  const database = await getDatabase();
  const result = await getAuctionViews(database, auth.session.playerId, {
    search: params.get("search") ?? undefined,
    sort: params.get("sort") ?? undefined,
    order: params.get("order") === "desc" ? "desc" : "asc",
    rarities,
    types: params.getAll("type"),
    exclusivity:
      params.get("exclusivity") === "public" ||
      params.get("exclusivity") === "private"
        ? params.get("exclusivity") as "public" | "private"
        : "all",
    quest:
      params.get("quest") === "quest" || params.get("quest") === "sought"
        ? params.get("quest") as "quest" | "sought"
        : "all",
    page: Number(params.get("page")) || 1,
    pageSize: Number(params.get("pageSize")) || 12,
  });
  return NextResponse.json(JSON.parse(JSON.stringify(result)));
}

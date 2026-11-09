import { NextResponse } from "next/server";

import { getAuctionViews } from "@/server/auction-gameplay";
import { ARTWORK_RARITIES, type ArtworkRarity } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  AUCTION_PROPERTY_KEYS,
  ITEM_FILTER_MODES,
  type AuctionPropertyKey,
  type ItemFilterMode,
} from "@/server/player-view-settings";

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
  const properties = Object.fromEntries(
    AUCTION_PROPERTY_KEYS.flatMap((key) => {
      const mode = params.get(`property-${key}`);
      return ITEM_FILTER_MODES.includes(mode as ItemFilterMode)
        ? [[key, mode as ItemFilterMode]]
        : [];
    }),
  ) as Partial<Record<AuctionPropertyKey, ItemFilterMode>>;
  const result = await getAuctionViews(database, auth.session.playerId, {
    auctionId: params.get("auction") ?? undefined,
    itemId: params.get("item") ?? undefined,
    search: params.get("search") ?? undefined,
    sort: params.get("sort") ?? undefined,
    order: params.get("order") === "desc" ? "desc" : "asc",
    rarities,
    types: params.getAll("type"),
    artStyle: params.get("artStyle") ?? undefined,
    properties,
    attributeIds: params.getAll("attribute"),
    attributeMinimum: parsePositiveInteger(params.get("attributeMinimum")),
    specialAttributeIds: params.getAll("specialAttribute"),
    specialAttributeMinimum: parsePositiveInteger(
      params.get("specialAttributeMinimum"),
    ),
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

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

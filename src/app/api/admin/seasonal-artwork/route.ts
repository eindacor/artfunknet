import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  toSeasonalArtworkMap,
  validateSeasonalArtworkSelections,
} from "@/server/seasonal-artwork";
import type { Artwork, ArtworkRarity, LootData } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";

type SeasonalArtworkRequest = {
  selections?: unknown;
};

type LootMetadata = {
  _id: string;
  loot_data: LootData;
  updated_at?: Date;
  updated_by?: string;
};

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as SeasonalArtworkRequest;
  const database = await getDatabase();
  const artworks = await database
    .collection<Pick<Artwork, "_id" | "rarity" | "active">>("artworks")
    .find({})
    .project<{ _id: string; rarity: ArtworkRarity; active: boolean }>({
      rarity: 1,
      active: 1,
    })
    .toArray();
  const selections = validateSeasonalArtworkSelections(
    body.selections,
    artworks,
  );
  if (!selections.ok) {
    return NextResponse.json({ error: selections.error }, { status: 400 });
  }

  const result = await database.collection<LootMetadata>("metadata").updateOne(
    { _id: "loot-data" },
    {
      $set: {
        "loot_data.seasonal_items": toSeasonalArtworkMap(selections.value),
        updated_at: new Date(),
        updated_by: auth.session.email,
      },
    },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "Loot metadata is unavailable." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: "ok",
    selections: selections.value,
  });
}

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  isDropTestSource,
  isNpcQuality,
  simulateDropRarities,
} from "@/server/drop-test";
import { getGameplaySettings } from "@/server/game-settings";
import type { Artwork, LootData } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";

type DropTestInput = {
  playerLevel?: unknown;
  quality?: unknown;
  source?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as DropTestInput;
  if (
    typeof body.playerLevel !== "number" ||
    !Number.isInteger(body.playerLevel) ||
    body.playerLevel < 0 ||
    body.playerLevel > 50
  ) {
    return NextResponse.json(
      { error: "Player level must be a whole number from 0 to 50." },
      { status: 400 },
    );
  }
  if (!isDropTestSource(body.source)) {
    return NextResponse.json(
      { error: "Drop source is invalid." },
      { status: 400 },
    );
  }
  const quality = isNpcQuality(body.quality) ? body.quality : undefined;
  if (body.source !== "standard" && !quality) {
    return NextResponse.json(
      { error: "Visitor quality is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const [settings, metadata, artworks] = await Promise.all([
    getGameplaySettings(database),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    database
      .collection<Pick<Artwork, "rarity">>("artworks")
      .find({ active: true })
      .project<Pick<Artwork, "rarity">>({ rarity: 1 })
      .toArray(),
  ]);
  if (!metadata) {
    return NextResponse.json(
      { error: "Loot metadata is unavailable." },
      { status: 409 },
    );
  }

  try {
    return NextResponse.json(
      simulateDropRarities({
        source: body.source,
        quality: body.source === "standard" ? undefined : quality,
        playerLevel: body.playerLevel,
        lootData: metadata.loot_data,
        configuredWeights: settings.active.rarityWeights,
        visitorRarityAmplifiers:
          settings.active.visitorRarityAmplifiers,
        availableRarities: artworks.map((artwork) => artwork.rarity),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The drop test could not be completed.",
      },
      { status: 409 },
    );
  }
}

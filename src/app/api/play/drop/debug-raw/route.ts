import { NextResponse } from "next/server";

import { getGameplaySettings } from "@/server/game-settings";
import { generateDailyDrop } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
  };
};

export async function POST() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  if (!settings.debugEnabled) {
    return NextResponse.json(
      { error: "Raw rarity drops are only available in debug mode." },
      { status: 403 },
    );
  }

  const player = await database.collection<Player>("players").findOne({
    _id: auth.session.playerId,
    active: true,
  });
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 404 },
    );
  }

  try {
    const items = await generateDailyDrop(
      database,
      player._id,
      player.profile.level,
      {
        itemCount: settings.active.dailyDropCount,
        rarityWeights: settings.active.rarityWeights,
        foilProbability: settings.active.foilProbability,
        mintProbability: settings.active.mintProbability,
        mintValueMultiplier: settings.active.mintValueMultiplier,
        unlockedProbability: settings.active.unlockedProbability,
        debug: true,
        useRawRarityMap: true,
      },
    );

    return NextResponse.json({
      status: "ok",
      message: `Generated ${items.length} debug items from the raw rarity map.`,
      item_ids: items.map((item) => item._id),
    });
  } catch (error) {
    console.error("Unable to generate raw-map debug drop", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Raw-map debug drop failed.",
      },
      { status: 500 },
    );
  }
}

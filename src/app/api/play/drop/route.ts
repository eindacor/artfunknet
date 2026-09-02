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
    last_drop: string;
  };
};

export async function POST() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const config = settings.active;
  const now = new Date();
  const cooldownMs = config.dailyDropCooldownMinutes * 60 * 1000;
  const cutoff = new Date(now.getTime() - cooldownMs).toISOString();
  const player = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: auth.session.playerId,
      active: true,
      "profile.last_drop": { $lte: cutoff },
    },
    { $set: { "profile.last_drop": now.toISOString() } },
    { returnDocument: "before" },
  );

  if (!player) {
    return NextResponse.json(
      { error: "Your next daily drop is not ready yet." },
      { status: 409 },
    );
  }

  try {
    const items = await generateDailyDrop(
      database,
      player._id,
      player.profile.level,
      {
        now,
        itemCount: config.dailyDropCount,
        rarityWeights: config.rarityWeights,
        foilProbability: config.foilProbability,
        mintProbability: config.mintProbability,
        mintValueMultiplier: config.mintValueMultiplier,
        unlockedProbability: config.unlockedProbability,
        debug: settings.debugEnabled,
      },
    );
    return NextResponse.json({ status: "ok", item_ids: items.map((item) => item._id) });
  } catch (error) {
    await database.collection<Player>("players").updateOne(
      { _id: player._id, "profile.last_drop": now.toISOString() },
      { $set: { "profile.last_drop": player.profile.last_drop } },
    );
    console.error("Unable to generate daily drop", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily drop failed." },
      { status: 500 },
    );
  }
}

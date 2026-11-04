import { NextResponse } from "next/server";

import {
  getDailyCrateItemCount,
  initializeDailyCrateTimeZone,
  normalizeDailyCrateTimeZone,
  releaseDailyCrateClaim,
  reserveDailyCrateClaim,
} from "@/server/daily-crate";
import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "@/server/game-settings";
import { generateDailyDrop } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { getUnclaimedItemExpiration } from "@/server/item-expiration";
import { requirePlayerApi } from "@/server/player-api";
import { recordTutorialAction } from "@/server/tutorial";
import { TutorialElement } from "@/shared/tutorial";

export async function PATCH(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const timeZone = normalizeDailyCrateTimeZone(body?.timeZone);
  if (!timeZone) {
    return NextResponse.json({ error: "A valid local timezone is required." }, { status: 400 });
  }
  const dailyCrate = await initializeDailyCrateTimeZone(
    await getDatabase(),
    auth.session.playerId,
    timeZone,
  );
  return dailyCrate
    ? NextResponse.json({ dailyCrate })
    : NextResponse.json({ error: "The player account is unavailable." }, { status: 404 });
}

export async function POST() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const config = settings.active;
  const now = new Date();
  const claim = await reserveDailyCrateClaim(database, auth.session.playerId, now);
  if (!claim) {
    return NextResponse.json(
      { error: "Your daily crate is not ready. It refreshes at noon in your saved timezone." },
      { status: 409 },
    );
  }

  try {
    const items = await generateDailyDrop(
      database,
      claim.playerId,
      claim.playerLevel,
      {
        now,
        itemCount: getDailyCrateItemCount(claim.previousClaimedAt, config.dailyDropCount),
        generationMap: getGameplayGenerationMap(config),
        mintValueMultiplier: config.mintValueMultiplier,
        debug: settings.debugEnabled,
        expiresAt: getUnclaimedItemExpiration(now),
      },
    );
    return NextResponse.json({
      status: "ok",
      tutorial: await recordTutorialAction(database, claim.playerId, TutorialElement.TUTORIAL_DAILY_CRATE),
      dailyCrate: claim.state,
      item_ids: items.map((item) => item._id),
      itemCount: items.length,
      message: `Daily crate opened. ${items.length} artworks were added to your loot.`,
    });
  } catch (error) {
    await releaseDailyCrateClaim(database, claim);
    console.error("Unable to generate daily drop", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily drop failed." },
      { status: 500 },
    );
  }
}

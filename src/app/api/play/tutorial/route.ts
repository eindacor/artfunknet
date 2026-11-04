import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { fulfillTutorial, restartTutorial } from "@/server/tutorial";
import { isTutorialElement } from "@/shared/tutorial";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (body?.action !== "restart" && (body?.action !== "skip" || !isTutorialElement(body.element) ||
      !Number.isSafeInteger(body.revision) || body.revision < 0)) {
    return NextResponse.json({ error: "A valid tutorial action is required." }, { status: 400 });
  }
  const database = await getDatabase();
  const tutorial = body.action === "restart"
    ? await restartTutorial(database, auth.session.playerId)
    : await fulfillTutorial(database, auth.session.playerId, body.element, body.revision);
  if (!tutorial) return NextResponse.json({ error: "This account cannot start a walkthrough." }, { status: 403 });
  return NextResponse.json({ tutorial });
}

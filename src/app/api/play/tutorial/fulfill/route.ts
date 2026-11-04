import { NextResponse } from "next/server";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { fulfillTutorial } from "@/server/tutorial";
import { CLIENT_TUTORIAL_ELEMENTS, isTutorialElement } from "@/shared/tutorial";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isTutorialElement(body?.element) || !CLIENT_TUTORIAL_ELEMENTS.includes(body.element) ||
      !Number.isSafeInteger(body.revision) || body.revision < 0) {
    return NextResponse.json({ error: "A valid client tutorial step and revision are required." }, { status: 400 });
  }
  const tutorial = await fulfillTutorial(await getDatabase(), auth.session.playerId, body.element, body.revision);
  return NextResponse.json({ tutorial });
}

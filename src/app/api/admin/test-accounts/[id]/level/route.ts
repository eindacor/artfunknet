import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  getCapsForLevel,
  MAX_PLAYER_LEVEL,
} from "@/server/collection-gameplay";
import { getDatabase } from "@/server/mongodb";

type LevelRequest = {
  level?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as LevelRequest;
  if (
    typeof body.level !== "number" ||
    !Number.isInteger(body.level) ||
    body.level < 0 ||
    body.level > MAX_PLAYER_LEVEL
  ) {
    return NextResponse.json(
      {
        error: `Test player level must be a whole number from 0 through ${MAX_PLAYER_LEVEL}.`,
      },
      { status: 400 },
    );
  }

  const { id } = await params;
  const caps = getCapsForLevel(body.level);
  const result = await (await getDatabase())
    .collection<{ _id: string }>("players")
    .updateOne(
    {
      _id: id,
      active: true,
      test_account: true,
    },
    {
      $set: {
        "profile.level": body.level,
        "profile.xp": 0,
        ...Object.fromEntries(
          Object.entries(caps).map(([key, value]) => [
            `profile.${key}`,
            value,
          ]),
        ),
        "profile.last_activity": new Date().toISOString(),
        updated_at: new Date(),
        updated_by: auth.session.email,
      },
    },
    );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The active test player could not be found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ok",
    level: body.level,
    message: `Test player level set to ${body.level}. Current XP was reset.`,
  });
}

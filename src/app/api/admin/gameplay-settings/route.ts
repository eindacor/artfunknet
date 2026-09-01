import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  getGameplaySettings,
  toStoredGameplayConfig,
  validateGameplayConfig,
} from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";

type SettingsInput = {
  debugEnabled?: unknown;
  actual?: unknown;
  debug?: unknown;
};

type SettingsDocument = {
  _id: string;
  gameplay?: {
    debug_enabled?: boolean;
    configs?: {
      actual?: ReturnType<typeof toStoredGameplayConfig>;
      debug?: ReturnType<typeof toStoredGameplayConfig>;
    };
  };
  created_at?: Date;
  updated_at?: Date;
  updated_by?: string;
};

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getGameplaySettings(await getDatabase()));
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as SettingsInput;
  const actual = validateGameplayConfig(body.actual);
  if (!actual.ok) {
    return NextResponse.json(
      { error: `Actual configuration: ${actual.error}` },
      { status: 400 },
    );
  }
  const debug = validateGameplayConfig(body.debug);
  if (!debug.ok) {
    return NextResponse.json(
      { error: `Debug configuration: ${debug.error}` },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const now = new Date();
  await database.collection<SettingsDocument>("metadata").updateOne(
    { _id: "gameplay-settings" },
    {
      $set: {
        "gameplay.debug_enabled": body.debugEnabled === true,
        "gameplay.configs.actual": toStoredGameplayConfig(actual.value),
        "gameplay.configs.debug": toStoredGameplayConfig(debug.value),
        updated_at: now,
        updated_by: auth.session.email,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );

  return NextResponse.json({
    status: "ok",
    settings: await getGameplaySettings(database),
  });
}

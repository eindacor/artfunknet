import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  getGameplaySettings,
  toStoredGameplayConfig,
  validateXpRewardScalars,
} from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";

type XpBalanceInput = {
  actual?: unknown;
  debug?: unknown;
};

type XpBalanceSettingsDocument = {
  _id: string;
  gameplay?: {
    configs?: {
      actual?: { xp_reward_scalars?: Record<string, number> };
      debug?: { xp_reward_scalars?: Record<string, number> };
    };
  };
  created_at?: Date;
  updated_at?: Date;
  updated_by?: string;
};

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as XpBalanceInput;
  const actual = validateXpRewardScalars(body.actual);
  if (!actual.ok) {
    return NextResponse.json(
      { error: `Actual configuration: ${actual.error}` },
      { status: 400 },
    );
  }
  const debug = validateXpRewardScalars(body.debug);
  if (!debug.ok) {
    return NextResponse.json(
      { error: `Debug configuration: ${debug.error}` },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const current = await getGameplaySettings(database);
  const now = new Date();
  await database.collection<XpBalanceSettingsDocument>("metadata").updateOne(
    { _id: "gameplay-settings" },
    {
      $set: {
        "gameplay.configs.actual": toStoredGameplayConfig({
          ...current.actual,
          xpRewardScalars: actual.value,
        }),
        "gameplay.configs.debug": toStoredGameplayConfig({
          ...current.debug,
          xpRewardScalars: debug.value,
        }),
        updated_at: now,
        updated_by: auth.session.email,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );
  const settings = await getGameplaySettings(database);
  return NextResponse.json({
    status: "ok",
    actual: settings.actual.xpRewardScalars,
    debug: settings.debug.xpRewardScalars,
  });
}

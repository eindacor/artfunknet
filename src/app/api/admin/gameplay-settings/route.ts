import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";

type SettingsInput = {
  dailyDropCooldownMinutes?: unknown;
  dailyDropCount?: unknown;
  galleryPayoutIntervalMinutes?: unknown;
};

type SettingsDocument = {
  _id: string;
  gameplay?: {
    daily_drop_cooldown_minutes?: number;
    daily_drop_count?: number;
    gallery_payout_interval_minutes?: number;
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
  const validation = validateSettings(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const database = await getDatabase();
  const now = new Date();
  await database.collection<SettingsDocument>("metadata").updateOne(
    { _id: "gameplay-settings" },
    {
      $set: {
        "gameplay.daily_drop_cooldown_minutes":
          validation.value.dailyDropCooldownMinutes,
        "gameplay.daily_drop_count": validation.value.dailyDropCount,
        "gameplay.gallery_payout_interval_minutes":
          validation.value.galleryPayoutIntervalMinutes,
        updated_at: now,
        updated_by: auth.session.email,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );

  return NextResponse.json({
    status: "ok",
    settings: validation.value,
  });
}

function validateSettings(
  input: SettingsInput,
):
  | {
      ok: true;
      value: {
        dailyDropCooldownMinutes: number;
        dailyDropCount: number;
        galleryPayoutIntervalMinutes: number;
      };
    }
  | { ok: false; error: string } {
  const dailyDropCooldownMinutes = Number(input.dailyDropCooldownMinutes);
  const dailyDropCount = Number(input.dailyDropCount);
  const galleryPayoutIntervalMinutes = Number(
    input.galleryPayoutIntervalMinutes,
  );

  if (
    !Number.isInteger(dailyDropCooldownMinutes) ||
    dailyDropCooldownMinutes < 1 ||
    dailyDropCooldownMinutes > 10_080
  ) {
    return {
      ok: false,
      error: "Daily drop cooldown must be an integer from 1 to 10,080 minutes.",
    };
  }
  if (
    !Number.isInteger(dailyDropCount) ||
    dailyDropCount < 1 ||
    dailyDropCount > 100
  ) {
    return {
      ok: false,
      error: "Daily drop count must be an integer from 1 to 100.",
    };
  }
  if (
    !Number.isInteger(galleryPayoutIntervalMinutes) ||
    galleryPayoutIntervalMinutes < 1 ||
    galleryPayoutIntervalMinutes > 1_440
  ) {
    return {
      ok: false,
      error: "Gallery payout interval must be an integer from 1 to 1,440 minutes.",
    };
  }

  return {
    ok: true,
    value: {
      dailyDropCooldownMinutes,
      dailyDropCount,
      galleryPayoutIntervalMinutes,
    },
  };
}

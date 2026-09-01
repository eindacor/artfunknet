import type { Db } from "mongodb";

export const DEFAULT_GAMEPLAY_SETTINGS = {
  dailyDropCooldownMinutes: 5,
  dailyDropCount: 6,
  galleryPayoutIntervalMinutes: 60,
} as const;

export type GameplaySettings = {
  dailyDropCooldownMinutes: number;
  dailyDropCount: number;
  galleryPayoutIntervalMinutes: number;
};

type GameplaySettingsDocument = {
  _id: string;
  gameplay?: {
    daily_drop_cooldown_minutes?: number;
    daily_drop_count?: number;
    gallery_payout_interval_minutes?: number;
  };
};

export async function getGameplaySettings(
  database: Db,
): Promise<GameplaySettings> {
  const document = await database
    .collection<GameplaySettingsDocument>("metadata")
    .findOne({ _id: "gameplay-settings" });

  return {
    dailyDropCooldownMinutes:
      document?.gameplay?.daily_drop_cooldown_minutes ??
      DEFAULT_GAMEPLAY_SETTINGS.dailyDropCooldownMinutes,
    dailyDropCount:
      document?.gameplay?.daily_drop_count ??
      DEFAULT_GAMEPLAY_SETTINGS.dailyDropCount,
    galleryPayoutIntervalMinutes:
      document?.gameplay?.gallery_payout_interval_minutes ??
      DEFAULT_GAMEPLAY_SETTINGS.galleryPayoutIntervalMinutes,
  };
}

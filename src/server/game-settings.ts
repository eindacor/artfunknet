import type { Db } from "mongodb";

import { ARTWORK_RARITIES, type ArtworkRarity } from "./gameplay.ts";

export const DEFAULT_RARITY_WEIGHTS: Record<ArtworkRarity, number> = {
  common: 0.623266875,
  uncommon: 0.267114375,
  rare: 0.09893125,
  legendary: 0.009993056,
  masterpiece: 0.000694444,
};

const DEBUG_RARITY_WEIGHTS: Record<ArtworkRarity, number> = {
  common: 1,
  uncommon: 1,
  rare: 1,
  legendary: 1,
  masterpiece: 1,
};

export type GameplayConfig = {
  dailyDropCooldownMinutes: number;
  dailyDropCount: number;
  foilProbability: number;
  unlockedProbability: number;
  galleryPayoutIntervalMinutes: number;
  displayLevelIntervalMinutes: number;
  displayLevelCap: number;
  conditionDecayIntervalMinutes: number;
  npcSpawnIntervalMinutes: number;
  rarityWeights: Record<ArtworkRarity, number>;
};

export type GameplayConfigName = "actual" | "debug";

export type GameplaySettings = {
  debugEnabled: boolean;
  actual: GameplayConfig;
  debug: GameplayConfig;
  activeConfigName: GameplayConfigName;
  active: GameplayConfig;
};

export const DEFAULT_ACTUAL_GAMEPLAY_CONFIG: GameplayConfig = {
  dailyDropCooldownMinutes: 5,
  dailyDropCount: 6,
  foilProbability: 0.005,
  unlockedProbability: 0.05,
  galleryPayoutIntervalMinutes: 60,
  displayLevelIntervalMinutes: 60,
  displayLevelCap: 20,
  conditionDecayIntervalMinutes: 60,
  npcSpawnIntervalMinutes: 10,
  rarityWeights: DEFAULT_RARITY_WEIGHTS,
};

export const DEFAULT_DEBUG_GAMEPLAY_CONFIG: GameplayConfig = {
  dailyDropCooldownMinutes: 1,
  dailyDropCount: 20,
  foilProbability: 0.5,
  unlockedProbability: 0.5,
  galleryPayoutIntervalMinutes: 1,
  displayLevelIntervalMinutes: 1,
  displayLevelCap: 20,
  conditionDecayIntervalMinutes: 1,
  npcSpawnIntervalMinutes: 1,
  rarityWeights: DEBUG_RARITY_WEIGHTS,
};

type StoredGameplayConfig = {
  daily_drop_cooldown_minutes?: number;
  daily_drop_count?: number;
  foil_probability?: number;
  unlocked_probability?: number;
  gallery_payout_interval_minutes?: number;
  display_level_interval_minutes?: number;
  display_level_cap?: number;
  condition_decay_interval_minutes?: number;
  npc_spawn_interval_minutes?: number;
  rarity_weights?: Partial<Record<ArtworkRarity, number>>;
};

type GameplaySettingsDocument = {
  _id: string;
  gameplay?: StoredGameplayConfig & {
    debug_enabled?: boolean;
    configs?: {
      actual?: StoredGameplayConfig;
      debug?: StoredGameplayConfig;
    };
  };
};

export async function getGameplaySettings(
  database: Db,
): Promise<GameplaySettings> {
  const document = await database
    .collection<GameplaySettingsDocument>("metadata")
    .findOne({ _id: "gameplay-settings" });
  const gameplay = document?.gameplay;
  const actual = readConfig(
    gameplay?.configs?.actual ?? gameplay,
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  );
  const debug = readConfig(
    gameplay?.configs?.debug,
    DEFAULT_DEBUG_GAMEPLAY_CONFIG,
  );
  const debugEnabled = gameplay?.debug_enabled ?? false;

  return {
    debugEnabled,
    actual,
    debug,
    activeConfigName: debugEnabled ? "debug" : "actual",
    active: debugEnabled ? debug : actual,
  };
}

export function toStoredGameplayConfig(
  config: GameplayConfig,
): Required<StoredGameplayConfig> {
  return {
    daily_drop_cooldown_minutes: config.dailyDropCooldownMinutes,
    daily_drop_count: config.dailyDropCount,
    foil_probability: config.foilProbability,
    unlocked_probability: config.unlockedProbability,
    gallery_payout_interval_minutes: config.galleryPayoutIntervalMinutes,
    display_level_interval_minutes: config.displayLevelIntervalMinutes,
    display_level_cap: config.displayLevelCap,
    condition_decay_interval_minutes: config.conditionDecayIntervalMinutes,
    npc_spawn_interval_minutes: config.npcSpawnIntervalMinutes,
    rarity_weights: config.rarityWeights,
  };
}

export function validateGameplayConfig(
  input: unknown,
):
  | { ok: true; value: GameplayConfig }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Gameplay configuration must be an object." };
  }
  const config = input as Record<string, unknown>;
  const integerFields = [
    ["dailyDropCooldownMinutes", "Daily drop cooldown", 1, 10_080],
    ["dailyDropCount", "Daily drop count", 1, 100],
    ["galleryPayoutIntervalMinutes", "Gallery payout interval", 1, 1_440],
    ["displayLevelIntervalMinutes", "Display level interval", 1, 10_080],
    ["displayLevelCap", "Display level cap", 1, 1_000],
    ["conditionDecayIntervalMinutes", "Condition decay interval", 1, 10_080],
    ["npcSpawnIntervalMinutes", "NPC spawn interval", 1, 10_080],
  ] as const;
  const values: Record<string, number> = {};
  for (const [key, label, min, max] of integerFields) {
    const value = Number(config[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      return {
        ok: false,
        error: `${label} must be an integer from ${min.toLocaleString()} to ${max.toLocaleString()}.`,
      };
    }
    values[key] = value;
  }

  const probabilityFields = [
    ["foilProbability", "Foil probability"],
    ["unlockedProbability", "Unlocked probability"],
  ] as const;
  const probabilities: Record<string, number> = {};
  for (const [key, label] of probabilityFields) {
    const value = Number(config[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return {
        ok: false,
        error: `${label} must be a number from 0 to 1.`,
      };
    }
    probabilities[key] = value;
  }

  const rarityWeights = validateRarityWeights(config.rarityWeights);
  if (!rarityWeights.ok) return rarityWeights;

  return {
    ok: true,
    value: {
      dailyDropCooldownMinutes: values.dailyDropCooldownMinutes,
      dailyDropCount: values.dailyDropCount,
      foilProbability: probabilities.foilProbability,
      unlockedProbability: probabilities.unlockedProbability,
      galleryPayoutIntervalMinutes: values.galleryPayoutIntervalMinutes,
      displayLevelIntervalMinutes: values.displayLevelIntervalMinutes,
      displayLevelCap: values.displayLevelCap,
      conditionDecayIntervalMinutes: values.conditionDecayIntervalMinutes,
      npcSpawnIntervalMinutes: values.npcSpawnIntervalMinutes,
      rarityWeights: rarityWeights.value,
    },
  };
}

export function validateRarityWeights(
  input: unknown,
):
  | { ok: true; value: Record<ArtworkRarity, number> }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Rarity weights must be a JSON object." };
  }

  const record = input as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !ARTWORK_RARITIES.includes(key as ArtworkRarity),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown rarity keys: ${unknownKeys.join(", ")}.`,
    };
  }

  const weights = {} as Record<ArtworkRarity, number>;
  let total = 0;
  for (const rarity of ARTWORK_RARITIES) {
    const weight = record[rarity];
    if (
      typeof weight !== "number" ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 1_000_000_000
    ) {
      return {
        ok: false,
        error: `The ${rarity} weight must be a number from 0 to 1,000,000,000.`,
      };
    }
    weights[rarity] = weight;
    total += weight;
  }

  if (total <= 0) {
    return {
      ok: false,
      error: "At least one rarity weight must be greater than zero.",
    };
  }

  return { ok: true, value: weights };
}

function readConfig(
  stored: StoredGameplayConfig | undefined,
  defaults: GameplayConfig,
): GameplayConfig {
  return {
    dailyDropCooldownMinutes:
      stored?.daily_drop_cooldown_minutes ??
      defaults.dailyDropCooldownMinutes,
    dailyDropCount: stored?.daily_drop_count ?? defaults.dailyDropCount,
    foilProbability:
      stored?.foil_probability ?? defaults.foilProbability,
    unlockedProbability:
      stored?.unlocked_probability ?? defaults.unlockedProbability,
    galleryPayoutIntervalMinutes:
      stored?.gallery_payout_interval_minutes ??
      defaults.galleryPayoutIntervalMinutes,
    displayLevelIntervalMinutes:
      stored?.display_level_interval_minutes ??
      defaults.displayLevelIntervalMinutes,
    displayLevelCap:
      stored?.display_level_cap ?? defaults.displayLevelCap,
    conditionDecayIntervalMinutes:
      stored?.condition_decay_interval_minutes ??
      defaults.conditionDecayIntervalMinutes,
    npcSpawnIntervalMinutes:
      stored?.npc_spawn_interval_minutes ??
      defaults.npcSpawnIntervalMinutes,
    rarityWeights: {
      ...defaults.rarityWeights,
      ...stored?.rarity_weights,
    },
  };
}

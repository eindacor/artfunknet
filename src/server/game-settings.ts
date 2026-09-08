import type { Db } from "mongodb";

import {
  DROPPABLE_CARD_RENDERER_IDS,
  type DroppableCardRendererId,
} from "../components/item-cards/catalog.ts";
import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type ItemGenerationMap,
} from "./gameplay.ts";
import type { NpcQuality } from "./npc-gameplay.ts";

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

export const DEFAULT_CARD_STYLE_WEIGHTS: Record<
  DroppableCardRendererId,
  number
> = {
  legacy: 1,
  terminal: 200,
  postcard: 160,
  gilded: 80,
  arcade: 60,
  prismatic: 25,
  blueprint: 140,
  zine: 100,
  celestial: 35,
  reliquary: 15,
  baseball: 70,
  minimalist: 180,
  bauhaus: 90,
  abstract: 75,
  circle: 45,
  tarot: 55,
  collectible: 65,
  skateboard: 50,
  album: 50,
};

const DEBUG_CARD_STYLE_WEIGHTS = Object.fromEntries(
  DROPPABLE_CARD_RENDERER_IDS.map((id) => [id, 1]),
) as Record<DroppableCardRendererId, number>;

export type GameplayConfig = {
  dailyDropCooldownMinutes: number;
  dailyDropCount: number;
  cardRendererProbability: number;
  foilProbability: number;
  mintProbability: number;
  mintValueMultiplier: number;
  unlockedProbability: number;
  galleryPayoutIntervalMinutes: number;
  displayLevelIntervalMinutes: number;
  displayLevelCap: number;
  conditionDecayIntervalMinutes: number;
  repairIntervalMinutes: number;
  repairAmount: number;
  npcSpawnIntervalMinutes: number;
  npcMeetingResetIntervalMinutes: number;
  npcMeetingLimits: Record<NpcQuality, number>;
  rarityWeights: Record<ArtworkRarity, number>;
  cardStyleWeights: Record<DroppableCardRendererId, number>;
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
  cardRendererProbability: 0.01,
  foilProbability: 0.005,
  mintProbability: 0.0005,
  mintValueMultiplier: 2,
  unlockedProbability: 0.05,
  galleryPayoutIntervalMinutes: 60,
  displayLevelIntervalMinutes: 60,
  displayLevelCap: 20,
  conditionDecayIntervalMinutes: 60,
  repairIntervalMinutes: 60,
  repairAmount: 0.1,
  npcSpawnIntervalMinutes: 10,
  npcMeetingResetIntervalMinutes: 1_440,
  npcMeetingLimits: {
    bronze: 120,
    silver: 100,
    gold: 80,
    platinum: 60,
  },
  rarityWeights: DEFAULT_RARITY_WEIGHTS,
  cardStyleWeights: DEFAULT_CARD_STYLE_WEIGHTS,
};

export const DEFAULT_DEBUG_GAMEPLAY_CONFIG: GameplayConfig = {
  dailyDropCooldownMinutes: 1,
  dailyDropCount: 20,
  cardRendererProbability: 0.25,
  foilProbability: 0.5,
  mintProbability: 0.25,
  mintValueMultiplier: 2,
  unlockedProbability: 0.5,
  galleryPayoutIntervalMinutes: 1,
  displayLevelIntervalMinutes: 1,
  displayLevelCap: 20,
  conditionDecayIntervalMinutes: 1,
  repairIntervalMinutes: 1,
  repairAmount: 0.1,
  npcSpawnIntervalMinutes: 1,
  npcMeetingResetIntervalMinutes: 1,
  npcMeetingLimits: {
    bronze: 120,
    silver: 100,
    gold: 80,
    platinum: 60,
  },
  rarityWeights: DEBUG_RARITY_WEIGHTS,
  cardStyleWeights: DEBUG_CARD_STYLE_WEIGHTS,
};

export function getGameplayGenerationMap(
  config: GameplayConfig,
): Pick<
  ItemGenerationMap,
  "rarity" | "foil" | "mint" | "unlocked" | "cardStyle" | "cardStyles"
> {
  return {
    rarity: config.rarityWeights,
    foil: config.foilProbability,
    mint: config.mintProbability,
    unlocked: config.unlockedProbability,
    cardStyle: config.cardRendererProbability,
    cardStyles: config.cardStyleWeights,
  };
}

type StoredGameplayConfig = {
  daily_drop_cooldown_minutes?: number;
  daily_drop_count?: number;
  card_renderer_probability?: number;
  foil_probability?: number;
  mint_probability?: number;
  mint_value_multiplier?: number;
  unlocked_probability?: number;
  gallery_payout_interval_minutes?: number;
  display_level_interval_minutes?: number;
  display_level_cap?: number;
  condition_decay_interval_minutes?: number;
  repair_interval_minutes?: number;
  repair_amount?: number;
  npc_spawn_interval_minutes?: number;
  npc_meeting_reset_interval_minutes?: number;
  npc_meeting_limits?: Partial<Record<NpcQuality, number>>;
  rarity_weights?: Partial<Record<ArtworkRarity, number>>;
  card_style_weights?: Partial<Record<DroppableCardRendererId, number>>;
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
    card_renderer_probability: config.cardRendererProbability,
    foil_probability: config.foilProbability,
    mint_probability: config.mintProbability,
    mint_value_multiplier: config.mintValueMultiplier,
    unlocked_probability: config.unlockedProbability,
    gallery_payout_interval_minutes: config.galleryPayoutIntervalMinutes,
    display_level_interval_minutes: config.displayLevelIntervalMinutes,
    display_level_cap: config.displayLevelCap,
    condition_decay_interval_minutes: config.conditionDecayIntervalMinutes,
    repair_interval_minutes: config.repairIntervalMinutes,
    repair_amount: config.repairAmount,
    npc_spawn_interval_minutes: config.npcSpawnIntervalMinutes,
    npc_meeting_reset_interval_minutes: config.npcMeetingResetIntervalMinutes,
    npc_meeting_limits: config.npcMeetingLimits,
    rarity_weights: config.rarityWeights,
    card_style_weights: config.cardStyleWeights,
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
    ["repairIntervalMinutes", "Repair interval", 1, 10_080],
    ["npcSpawnIntervalMinutes", "NPC spawn interval", 1, 10_080],
    [
      "npcMeetingResetIntervalMinutes",
      "Visitor meeting reset interval",
      1,
      10_080,
    ],
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
    ["cardRendererProbability", "Card renderer probability"],
    ["foilProbability", "Foil probability"],
    ["mintProbability", "Mint probability"],
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
  const mintValueMultiplier = Number(config.mintValueMultiplier);
  if (
    !Number.isFinite(mintValueMultiplier) ||
    mintValueMultiplier < 1 ||
    mintValueMultiplier > 1_000
  ) {
    return {
      ok: false,
      error: "Mint value multiplier must be a number from 1 to 1,000.",
    };
  }
  const repairAmount = Number(config.repairAmount);
  if (
    !Number.isFinite(repairAmount) ||
    repairAmount < 0.01 ||
    repairAmount > 1
  ) {
    return {
      ok: false,
      error: "Repair amount must be from 0.01 to 1.",
    };
  }

  const rarityWeights = validateRarityWeights(config.rarityWeights);
  if (!rarityWeights.ok) return rarityWeights;
  const cardStyleWeights = validateCardStyleWeights(config.cardStyleWeights);
  if (!cardStyleWeights.ok) return cardStyleWeights;
  const npcMeetingLimits = validateNpcMeetingLimits(config.npcMeetingLimits);
  if (!npcMeetingLimits.ok) return npcMeetingLimits;

  return {
    ok: true,
    value: {
      dailyDropCooldownMinutes: values.dailyDropCooldownMinutes,
      dailyDropCount: values.dailyDropCount,
      cardRendererProbability: probabilities.cardRendererProbability,
      foilProbability: probabilities.foilProbability,
      mintProbability: probabilities.mintProbability,
      mintValueMultiplier,
      unlockedProbability: probabilities.unlockedProbability,
      galleryPayoutIntervalMinutes: values.galleryPayoutIntervalMinutes,
      displayLevelIntervalMinutes: values.displayLevelIntervalMinutes,
      displayLevelCap: values.displayLevelCap,
      conditionDecayIntervalMinutes: values.conditionDecayIntervalMinutes,
      repairIntervalMinutes: values.repairIntervalMinutes,
      repairAmount,
      npcSpawnIntervalMinutes: values.npcSpawnIntervalMinutes,
      npcMeetingResetIntervalMinutes: values.npcMeetingResetIntervalMinutes,
      npcMeetingLimits: npcMeetingLimits.value,
      rarityWeights: rarityWeights.value,
      cardStyleWeights: cardStyleWeights.value,
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

export function validateCardStyleWeights(
  input: unknown,
):
  | { ok: true; value: Record<DroppableCardRendererId, number> }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Card style weights must be a JSON object." };
  }

  const record = input as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) =>
      !DROPPABLE_CARD_RENDERER_IDS.includes(
        key as DroppableCardRendererId,
      ),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown card style keys: ${unknownKeys.join(", ")}.`,
    };
  }

  const weights = {} as Record<DroppableCardRendererId, number>;
  let total = 0;
  for (const rendererId of DROPPABLE_CARD_RENDERER_IDS) {
    const weight = record[rendererId];
    if (
      typeof weight !== "number" ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 1_000_000_000
    ) {
      return {
        ok: false,
        error: `The ${rendererId} card style weight must be a number from 0 to 1,000,000,000.`,
      };
    }
    weights[rendererId] = weight;
    total += weight;
  }

  if (total <= 0) {
    return {
      ok: false,
      error: "At least one card style weight must be greater than zero.",
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
    cardRendererProbability:
      stored?.card_renderer_probability ?? defaults.cardRendererProbability,
    foilProbability:
      stored?.foil_probability ?? defaults.foilProbability,
    mintProbability:
      stored?.mint_probability ?? defaults.mintProbability,
    mintValueMultiplier:
      stored?.mint_value_multiplier ?? defaults.mintValueMultiplier,
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
    repairIntervalMinutes:
      stored?.repair_interval_minutes ?? defaults.repairIntervalMinutes,
    repairAmount: stored?.repair_amount ?? defaults.repairAmount,
    npcSpawnIntervalMinutes:
      stored?.npc_spawn_interval_minutes ??
      defaults.npcSpawnIntervalMinutes,
    npcMeetingResetIntervalMinutes:
      stored?.npc_meeting_reset_interval_minutes ??
      defaults.npcMeetingResetIntervalMinutes,
    npcMeetingLimits: {
      ...defaults.npcMeetingLimits,
      ...stored?.npc_meeting_limits,
    },
    rarityWeights: {
      ...defaults.rarityWeights,
      ...stored?.rarity_weights,
    },
    cardStyleWeights: {
      ...defaults.cardStyleWeights,
      ...stored?.card_style_weights,
    },
  };
}

function validateNpcMeetingLimits(
  input: unknown,
):
  | { ok: true; value: Record<NpcQuality, number> }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Visitor meeting limits must be an object." };
  }
  const record = input as Record<string, unknown>;
  const qualities = ["bronze", "silver", "gold", "platinum"] as const;
  const unknownKeys = Object.keys(record).filter(
    (key) => !qualities.includes(key as NpcQuality),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown visitor quality keys: ${unknownKeys.join(", ")}.`,
    };
  }
  const limits = {} as Record<NpcQuality, number>;
  for (const quality of qualities) {
    const value = Number(record[quality]);
    if (!Number.isInteger(value) || value < 1 || value > 10_000) {
      return {
        ok: false,
        error: `${quality} visitor limit must be an integer from 1 to 10,000.`,
      };
    }
    limits[quality] = value;
  }
  return { ok: true, value: limits };
}

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

export const XP_REWARD_DEFINITIONS = {
  galleryDisplay: {
    default: 1,
    label: "Gallery display XP",
    description:
      "Scales XP earned by the owner while artwork is displayed.",
  },
  historianQuest: {
    default: 1,
    label: "Art Historian quest XP",
    description:
      "Scales the rarity-based XP chunk assigned when a Historian quest is created.",
  },
  artExpert: {
    default: 1,
    label: "Art Expert XP",
    description:
      "Scales the zero-roll artwork XP bonus from an Art Expert visit.",
  },
  artEnthusiast: {
    default: 1,
    label: "Art Enthusiast XP",
    description:
      "Scales quality, gallery, and visitor-adjusted Art Enthusiast XP.",
  },
  artCollector: {
    default: 1,
    label: "Art Collector XP",
    description:
      "Scales an Art Collector's XP offer when the Enthusiast effect applies.",
  },
  auctionExpert: {
    default: 1,
    label: "Auction expertise XP",
    description:
      "Scales XP awarded by the XP_FOR_AUCTIONS legendary effect.",
  },
  forgeryOffload: {
    default: 0.8,
    label: "Undetected forgery offload XP",
    description:
      "Base XP chunks awarded when another player removes an undetected forgery. Heat still adjusts this value.",
  },
  forgeryReport: {
    default: 1,
    label: "Forgery report XP",
    description:
      "Scales XP for a confirmed forgery report. System-owned liability still awards twice the configured value.",
  },
  forgeryDisplay: {
    default: 1,
    label: "Undetected forgery display XP",
    description:
      "Scales XP credited to the original forger while another player displays the forgery.",
  },
} as const;

export type XpRewardKey = keyof typeof XP_REWARD_DEFINITIONS;
export const XP_REWARD_KEYS = Object.keys(
  XP_REWARD_DEFINITIONS,
) as XpRewardKey[];
export type XpRewardScalars = Record<XpRewardKey, number>;

export const DEFAULT_XP_REWARD_SCALARS = Object.fromEntries(
  XP_REWARD_KEYS.map((key) => [
    key,
    XP_REWARD_DEFINITIONS[key].default,
  ]),
) as XpRewardScalars;

export const DEFAULT_RARITY_WEIGHTS: Record<ArtworkRarity, number> = {
  common: 15_000,
  uncommon: 5_000,
  rare: 1_000,
  legendary: 30,
  masterpiece: 1,
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
  arcade: 0,
  postcard: 250,
  gilded: 100,
  terminal: 200,
  prismatic: 0,
  blueprint: 150,
  zine: 30,
  celestial: 250,
  reliquary: 100,
  baseball: 200,
  minimalist: 30,
  bauhaus: 20,
  abstract: 20,
  circle: 0,
  tarot: 0,
  collectible: 65,
  skateboard: 50,
  album: 15,
};

const DEBUG_CARD_STYLE_WEIGHTS = Object.fromEntries(
  DROPPABLE_CARD_RENDERER_IDS.map((id) => [id, 1]),
) as Record<DroppableCardRendererId, number>;

export type GameplayConfig = {
  dailyDropCooldownMinutes: number;
  dailyDropCount: number;
  crateValueScalar: number;
  standardCrateCostScalar: number;
  foilCrateCostScalar: number;
  unlockedCrateCostScalar: number;
  designerCrateCostScalar: number;
  ultimateCrateCostScalar: number;
  foilCrateChanceScalar: number;
  unlockedCrateChanceScalar: number;
  artStyleCrateChanceScalar: number;
  ultimateArtStyleChanceScalar: number;
  ultimateFoilChanceScalar: number;
  ultimateUnlockedChanceScalar: number;
  ultimateMintChanceScalar: number;
  ultimateSeasonalChanceScalar: number;
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
  xpRewardScalars: XpRewardScalars;
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
  dailyDropCooldownMinutes: 1,
  dailyDropCount: 50,
  crateValueScalar: 1.8,
  standardCrateCostScalar: 1,
  foilCrateCostScalar: 1.5,
  unlockedCrateCostScalar: 1.2,
  designerCrateCostScalar: 2,
  ultimateCrateCostScalar: 3,
  foilCrateChanceScalar: 5,
  unlockedCrateChanceScalar: 5,
  artStyleCrateChanceScalar: 5,
  ultimateArtStyleChanceScalar: 3,
  ultimateFoilChanceScalar: 5,
  ultimateUnlockedChanceScalar: 5,
  ultimateMintChanceScalar: 5,
  ultimateSeasonalChanceScalar: 5,
  cardRendererProbability: 0.05,
  foilProbability: 0.01,
  mintProbability: 0.005,
  mintValueMultiplier: 2,
  unlockedProbability: 0.05,
  galleryPayoutIntervalMinutes: 10,
  displayLevelIntervalMinutes: 60,
  displayLevelCap: 20,
  conditionDecayIntervalMinutes: 60,
  repairIntervalMinutes: 60,
  repairAmount: 0.1,
  npcSpawnIntervalMinutes: 1,
  npcMeetingResetIntervalMinutes: 1_440,
  npcMeetingLimits: {
    bronze: 120,
    silver: 100,
    gold: 80,
    platinum: 60,
  },
  xpRewardScalars: DEFAULT_XP_REWARD_SCALARS,
  rarityWeights: DEFAULT_RARITY_WEIGHTS,
  cardStyleWeights: DEFAULT_CARD_STYLE_WEIGHTS,
};

export const DEFAULT_DEBUG_GAMEPLAY_CONFIG: GameplayConfig = {
  dailyDropCooldownMinutes: 1,
  dailyDropCount: 20,
  crateValueScalar: 1,
  standardCrateCostScalar: 1,
  foilCrateCostScalar: 1,
  unlockedCrateCostScalar: 1,
  designerCrateCostScalar: 1,
  ultimateCrateCostScalar: 1,
  foilCrateChanceScalar: 3,
  unlockedCrateChanceScalar: 3,
  artStyleCrateChanceScalar: 3,
  ultimateArtStyleChanceScalar: 3,
  ultimateFoilChanceScalar: 3,
  ultimateUnlockedChanceScalar: 3,
  ultimateMintChanceScalar: 3,
  ultimateSeasonalChanceScalar: 3,
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
  xpRewardScalars: DEFAULT_XP_REWARD_SCALARS,
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
  crate_value_scalar?: number;
  standard_crate_cost_scalar?: number;
  foil_crate_cost_scalar?: number;
  unlocked_crate_cost_scalar?: number;
  designer_crate_cost_scalar?: number;
  ultimate_crate_cost_scalar?: number;
  foil_crate_chance_scalar?: number;
  unlocked_crate_chance_scalar?: number;
  art_style_crate_chance_scalar?: number;
  ultimate_art_style_chance_scalar?: number;
  ultimate_foil_chance_scalar?: number;
  ultimate_unlocked_chance_scalar?: number;
  ultimate_mint_chance_scalar?: number;
  ultimate_seasonal_chance_scalar?: number;
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
  xp_reward_scalars?: Partial<XpRewardScalars>;
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
    crate_value_scalar: config.crateValueScalar,
    standard_crate_cost_scalar: config.standardCrateCostScalar,
    foil_crate_cost_scalar: config.foilCrateCostScalar,
    unlocked_crate_cost_scalar: config.unlockedCrateCostScalar,
    designer_crate_cost_scalar: config.designerCrateCostScalar,
    ultimate_crate_cost_scalar: config.ultimateCrateCostScalar,
    foil_crate_chance_scalar: config.foilCrateChanceScalar,
    unlocked_crate_chance_scalar: config.unlockedCrateChanceScalar,
    art_style_crate_chance_scalar: config.artStyleCrateChanceScalar,
    ultimate_art_style_chance_scalar:
      config.ultimateArtStyleChanceScalar,
    ultimate_foil_chance_scalar: config.ultimateFoilChanceScalar,
    ultimate_unlocked_chance_scalar: config.ultimateUnlockedChanceScalar,
    ultimate_mint_chance_scalar: config.ultimateMintChanceScalar,
    ultimate_seasonal_chance_scalar: config.ultimateSeasonalChanceScalar,
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
    xp_reward_scalars: config.xpRewardScalars,
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
  const crateValueScalar = Number(config.crateValueScalar);
  if (
    !Number.isFinite(crateValueScalar) ||
    crateValueScalar < 0.01 ||
    crateValueScalar > 10_000
  ) {
    return {
      ok: false,
      error: "Crate value scalar must be a number from 0.01 to 10,000.",
    };
  }
  const crateCostScalarFields = [
    ["standardCrateCostScalar", "Standard crate cost scalar"],
    ["foilCrateCostScalar", "Foil crate cost scalar"],
    ["unlockedCrateCostScalar", "Unlocked crate cost scalar"],
    ["designerCrateCostScalar", "Designer crate cost scalar"],
    ["ultimateCrateCostScalar", "Ultimate crate cost scalar"],
  ] as const;
  const crateCostScalars: Record<string, number> = {};
  for (const [key, label] of crateCostScalarFields) {
    const value = Number(config[key]);
    if (!Number.isFinite(value) || value < 0.01 || value > 1_000) {
      return {
        ok: false,
        error: `${label} must be a number from 0.01 to 1,000.`,
      };
    }
    crateCostScalars[key] = value;
  }
  const crateChanceScalarFields = [
    ["foilCrateChanceScalar", "Foil crate chance scalar"],
    ["unlockedCrateChanceScalar", "Unlocked crate chance scalar"],
    ["artStyleCrateChanceScalar", "Designer crate art style chance scalar"],
    [
      "ultimateArtStyleChanceScalar",
      "Ultimate crate art style chance scalar",
    ],
    ["ultimateFoilChanceScalar", "Ultimate crate foil chance scalar"],
    ["ultimateUnlockedChanceScalar", "Ultimate crate unlocked chance scalar"],
    ["ultimateMintChanceScalar", "Ultimate crate Mint chance scalar"],
    ["ultimateSeasonalChanceScalar", "Ultimate crate seasonal chance scalar"],
  ] as const;
  const crateChanceScalars: Record<string, number> = {};
  for (const [key, label] of crateChanceScalarFields) {
    const value = Number(config[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1_000) {
      return {
        ok: false,
        error: `${label} must be a number from 0 to 1,000.`,
      };
    }
    crateChanceScalars[key] = value;
  }
  if (crateChanceScalars.ultimateSeasonalChanceScalar < 0.01) {
    return {
      ok: false,
      error:
        "Ultimate crate seasonal chance scalar must be a number from 0.01 to 1,000.",
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
  const xpRewardScalars = validateXpRewardScalars(config.xpRewardScalars);
  if (!xpRewardScalars.ok) return xpRewardScalars;

  return {
    ok: true,
    value: {
      dailyDropCooldownMinutes: values.dailyDropCooldownMinutes,
      dailyDropCount: values.dailyDropCount,
      crateValueScalar,
      standardCrateCostScalar: crateCostScalars.standardCrateCostScalar,
      foilCrateCostScalar: crateCostScalars.foilCrateCostScalar,
      unlockedCrateCostScalar: crateCostScalars.unlockedCrateCostScalar,
      designerCrateCostScalar: crateCostScalars.designerCrateCostScalar,
      ultimateCrateCostScalar: crateCostScalars.ultimateCrateCostScalar,
      foilCrateChanceScalar: crateChanceScalars.foilCrateChanceScalar,
      unlockedCrateChanceScalar:
        crateChanceScalars.unlockedCrateChanceScalar,
      artStyleCrateChanceScalar:
        crateChanceScalars.artStyleCrateChanceScalar,
      ultimateArtStyleChanceScalar:
        crateChanceScalars.ultimateArtStyleChanceScalar,
      ultimateFoilChanceScalar:
        crateChanceScalars.ultimateFoilChanceScalar,
      ultimateUnlockedChanceScalar:
        crateChanceScalars.ultimateUnlockedChanceScalar,
      ultimateMintChanceScalar:
        crateChanceScalars.ultimateMintChanceScalar,
      ultimateSeasonalChanceScalar:
        crateChanceScalars.ultimateSeasonalChanceScalar,
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
      xpRewardScalars: xpRewardScalars.value,
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
    crateValueScalar:
      stored?.crate_value_scalar ?? defaults.crateValueScalar,
    standardCrateCostScalar:
      stored?.standard_crate_cost_scalar ??
      defaults.standardCrateCostScalar,
    foilCrateCostScalar:
      stored?.foil_crate_cost_scalar ?? defaults.foilCrateCostScalar,
    unlockedCrateCostScalar:
      stored?.unlocked_crate_cost_scalar ??
      defaults.unlockedCrateCostScalar,
    designerCrateCostScalar:
      stored?.designer_crate_cost_scalar ??
      defaults.designerCrateCostScalar,
    ultimateCrateCostScalar:
      stored?.ultimate_crate_cost_scalar ??
      defaults.ultimateCrateCostScalar,
    foilCrateChanceScalar:
      stored?.foil_crate_chance_scalar ?? defaults.foilCrateChanceScalar,
    unlockedCrateChanceScalar:
      stored?.unlocked_crate_chance_scalar ??
      defaults.unlockedCrateChanceScalar,
    artStyleCrateChanceScalar:
      stored?.art_style_crate_chance_scalar ??
      defaults.artStyleCrateChanceScalar,
    ultimateArtStyleChanceScalar:
      stored?.ultimate_art_style_chance_scalar ??
      defaults.ultimateArtStyleChanceScalar,
    ultimateFoilChanceScalar:
      stored?.ultimate_foil_chance_scalar ??
      defaults.ultimateFoilChanceScalar,
    ultimateUnlockedChanceScalar:
      stored?.ultimate_unlocked_chance_scalar ??
      defaults.ultimateUnlockedChanceScalar,
    ultimateMintChanceScalar:
      stored?.ultimate_mint_chance_scalar ??
      defaults.ultimateMintChanceScalar,
    ultimateSeasonalChanceScalar:
      stored?.ultimate_seasonal_chance_scalar ??
      defaults.ultimateSeasonalChanceScalar,
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
    xpRewardScalars: {
      ...defaults.xpRewardScalars,
      ...stored?.xp_reward_scalars,
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

export function validateXpRewardScalars(
  input: unknown,
):
  | { ok: true; value: XpRewardScalars }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "XP reward scalars must be an object." };
  }
  const record = input as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !XP_REWARD_KEYS.includes(key as XpRewardKey),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown XP reward scalar keys: ${unknownKeys.join(", ")}.`,
    };
  }
  const scalars = {} as XpRewardScalars;
  for (const key of XP_REWARD_KEYS) {
    const value = Number(record[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return {
        ok: false,
        error: `${key} XP reward scalar must be a number from 0 to 100.`,
      };
    }
    scalars[key] = value;
  }
  return { ok: true, value: scalars };
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

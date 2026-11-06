import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  DEFAULT_DEBUG_GAMEPLAY_CONFIG,
  DEFAULT_VISITOR_RARITY_AMPLIFIERS,
  toStoredGameplayConfig,
  validateCardStyleWeights,
  validateGameplayConfig,
  validateRarityWeights,
  validateVisitorRarityAmplifiers,
} from "./game-settings.ts";

const validWeights = {
  common: 100,
  uncommon: 30,
  rare: 10,
  legendary: 1,
  masterpiece: 0.1,
};

test("gallery overview distance validates centimeters and preserves them in storage", () => {
  for (const defaults of [DEFAULT_ACTUAL_GAMEPLAY_CONFIG, DEFAULT_DEBUG_GAMEPLAY_CONFIG]) {
    for (const galleryOverviewDistanceCm of [50, 600, 1250, 10_000]) {
      const result = validateGameplayConfig({ ...defaults, galleryOverviewDistanceCm });
      assert.ok(result.ok);
      assert.equal(toStoredGameplayConfig(result.value).gallery_overview_distance_cm, galleryOverviewDistanceCm);
    }
    for (const galleryOverviewDistanceCm of [-1, 0, 49, 10_001, 600.5, NaN, Infinity, undefined, null]) {
      assert.equal(validateGameplayConfig({ ...defaults, galleryOverviewDistanceCm }).ok, false);
    }
  }
});

test("gallery camera and mounting heights validate and persist independently in centimeters", () => {
  for (const defaults of [DEFAULT_ACTUAL_GAMEPLAY_CONFIG, DEFAULT_DEBUG_GAMEPLAY_CONFIG]) {
    for (const [galleryCameraHeightCm, galleryArtworkCenterHeightCm] of [[158, 140], [175, 160], [10, 1000], [1000, 10]]) {
      const result = validateGameplayConfig({ ...defaults, galleryCameraHeightCm, galleryArtworkCenterHeightCm });
      assert.ok(result.ok);
      const stored = toStoredGameplayConfig(result.value);
      assert.equal(stored.gallery_camera_height_cm, galleryCameraHeightCm);
      assert.equal(stored.gallery_artwork_center_height_cm, galleryArtworkCenterHeightCm);
    }
    for (const field of ["galleryCameraHeightCm", "galleryArtworkCenterHeightCm"]) {
      for (const value of [undefined, null, "", NaN, Infinity, -1, 0, 9, 1001, 158.5]) {
        assert.equal(validateGameplayConfig({ ...defaults, [field]: value }).ok, false);
      }
    }
  }
});

test("gallery visitor scale validates fractional coefficients and persists them without unit conversion", () => {
  for (const defaults of [DEFAULT_ACTUAL_GAMEPLAY_CONFIG, DEFAULT_DEBUG_GAMEPLAY_CONFIG]) {
    for (const galleryVisitorScale of [0.1, 0.55, 0.8, 1, 1.35, 3]) {
      const result = validateGameplayConfig({ ...defaults, galleryVisitorScale });
      assert.ok(result.ok);
      assert.equal(toStoredGameplayConfig(result.value).gallery_visitor_scale, galleryVisitorScale);
    }
    for (const galleryVisitorScale of [-1, 0, 0.09, 3.01, NaN, Infinity, undefined, null, ""]) {
      assert.equal(validateGameplayConfig({ ...defaults, galleryVisitorScale }).ok, false);
    }
  }
});

test("forgery return settings validate and persist independently", () => {
  const result = validateGameplayConfig({
    ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
    forgeryReturnWindowMinutes: 30,
    forgeryReturnRefundCoefficient: 0.65,
  });
  assert.ok(result.ok);
  const stored = toStoredGameplayConfig(result.value);
  assert.equal(stored.forgery_return_window_minutes, 30);
  assert.equal(stored.forgery_return_refund_coefficient, 0.65);
  for (const value of [-1, 0.5, 1441, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(validateGameplayConfig({ ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, forgeryReturnWindowMinutes: value }).ok, false);
  }
  for (const value of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    assert.equal(validateGameplayConfig({ ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, forgeryReturnRefundCoefficient: value }).ok, false);
  }
  for (const coefficient of [0, 1]) {
    assert.equal(validateGameplayConfig({
      ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, forgeryReturnWindowMinutes: 0,
      forgeryReturnRefundCoefficient: coefficient,
    }).ok, true);
  }
});

test("offer cutoffs survive gameplay validation and storage without accepting reversed tiers", () => {
  const cutoffs = { level1: 0.02, level2: 0.0004, level3: 1e-9 };
  const result = validateGameplayConfig({
    ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
    offerRevealThresholds: cutoffs,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(toStoredGameplayConfig(result.value).offer_reveal_thresholds, cutoffs);
  assert.equal(validateGameplayConfig({
    ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
    offerRevealThresholds: { ...cutoffs, level3: 0.1 },
  }).ok, false);
});

test("rarity weights accept arbitrary positive proportions", () => {
  assert.deepEqual(validateRarityWeights(validWeights), {
    ok: true,
    value: validWeights,
  });
});

test("rarity weights require every known rarity and reject unknown keys", () => {
  assert.equal(
    validateRarityWeights({ ...validWeights, common: undefined }).ok,
    false,
  );
  assert.equal(
    validateRarityWeights({ ...validWeights, mythic: 1 }).ok,
    false,
  );
});

test("rarity weights reject invalid and all-zero maps", () => {
  assert.equal(validateRarityWeights({ ...validWeights, rare: -1 }).ok, false);
  assert.equal(
    validateRarityWeights({
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
      masterpiece: 0,
    }).ok,
    false,
  );
});

test("card style weights require every known non-default style", () => {
  const weights = DEFAULT_ACTUAL_GAMEPLAY_CONFIG.cardStyleWeights;
  assert.deepEqual(validateCardStyleWeights(weights), {
    ok: true,
    value: weights,
  });
  assert.equal(
    validateCardStyleWeights({ ...weights, museum: 1 }).ok,
    false,
  );
  assert.equal(
    validateCardStyleWeights({ ...weights, baseball: undefined }).ok,
    false,
  );
  assert.equal(
    validateCardStyleWeights(
      Object.fromEntries(Object.keys(weights).map((key) => [key, 0])),
    ).ok,
    false,
  );
});

test("visitor rarity amplifiers require every quality and valid scalars", () => {
  assert.deepEqual(
    validateVisitorRarityAmplifiers(DEFAULT_VISITOR_RARITY_AMPLIFIERS),
    {
      ok: true,
      value: DEFAULT_VISITOR_RARITY_AMPLIFIERS,
    },
  );
  assert.equal(
    validateVisitorRarityAmplifiers({
      ...DEFAULT_VISITOR_RARITY_AMPLIFIERS,
      bronze: -0.1,
    }).ok,
    false,
  );
  assert.equal(
    validateVisitorRarityAmplifiers({
      ...DEFAULT_VISITOR_RARITY_AMPLIFIERS,
      platinum: undefined,
    }).ok,
    false,
  );
  assert.equal(
    validateVisitorRarityAmplifiers({
      ...DEFAULT_VISITOR_RARITY_AMPLIFIERS,
      diamond: 1,
    }).ok,
    false,
  );
});

test("actual and debug gameplay configurations validate independently", () => {
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.dailyDropCount, 50);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.cardRendererProbability, 0.05);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.crateValueScalar, 1.8);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.standardCrateCostScalar, 1);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilCrateCostScalar, 1.5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.unlockedCrateCostScalar, 1.2);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.designerCrateCostScalar, 2);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateCrateCostScalar, 3);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilCrateChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.unlockedCrateChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.artStyleCrateChanceScalar, 5);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateArtStyleChanceScalar,
    3,
  );
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateFoilChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateUnlockedChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateMintChanceScalar, 5);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateSeasonalChanceScalar,
    5,
  );
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilProbability, 0.01);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintProbability, 0.005);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintValueMultiplier, 2);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.galleryPayoutIntervalMinutes, 10);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.npcSpawnIntervalMinutes, 1);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.auctionAntiSnipeExtensionMinutes, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.repairIntervalMinutes, 60);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.repairAmount, 0.1);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.npcMeetingResetIntervalMinutes,
    1_440,
  );
  assert.deepEqual(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.npcMeetingLimits, {
    bronze: 120,
    silver: 100,
    gold: 80,
    platinum: 60,
  });
  assert.deepEqual(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.visitorRarityAmplifiers,
    DEFAULT_VISITOR_RARITY_AMPLIFIERS,
  );
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.commemorateItemCount, 4);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.commemorateRareSupporterBonusCount,
    8,
  );
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.cardRendererProbability, 0.25);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.crateValueScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.standardCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.foilCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.unlockedCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.designerCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.foilCrateChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.unlockedCrateChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.artStyleCrateChanceScalar, 3);
  assert.equal(
    DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateArtStyleChanceScalar,
    3,
  );
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateFoilChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateUnlockedChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateMintChanceScalar, 3);
  assert.equal(
    DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateSeasonalChanceScalar,
    3,
  );
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.mintProbability, 0.25);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.mintValueMultiplier, 2);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.repairIntervalMinutes, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.repairAmount, 0.1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.auctionAntiSnipeExtensionMinutes, 5);
  assert.equal(
    DEFAULT_DEBUG_GAMEPLAY_CONFIG.npcMeetingResetIntervalMinutes,
    1,
  );
  assert.equal(validateGameplayConfig(DEFAULT_ACTUAL_GAMEPLAY_CONFIG).ok, true);
  assert.equal(validateGameplayConfig(DEFAULT_DEBUG_GAMEPLAY_CONFIG).ok, true);
  assert.equal(
    toStoredGameplayConfig(DEFAULT_ACTUAL_GAMEPLAY_CONFIG)
      .commemorate_rare_supporter_bonus_count,
    8,
  );
  assert.deepEqual(
    toStoredGameplayConfig(DEFAULT_ACTUAL_GAMEPLAY_CONFIG)
      .visitor_rarity_amplifiers,
    DEFAULT_VISITOR_RARITY_AMPLIFIERS,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      commemorateRareSupporterBonusCount: -1,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      auctionAntiSnipeExtensionMinutes: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      cardRendererProbability: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      npcSpawnIntervalMinutes: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      crateValueScalar: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      designerCrateCostScalar: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      foilCrateChanceScalar: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      artStyleCrateChanceScalar: 1_001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      ultimateSeasonalChanceScalar: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      repairIntervalMinutes: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      repairAmount: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      npcMeetingLimits: {
        ...DEFAULT_DEBUG_GAMEPLAY_CONFIG.npcMeetingLimits,
        gold: 0,
      },
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      visitorRarityAmplifiers: {
        ...DEFAULT_DEBUG_GAMEPLAY_CONFIG.visitorRarityAmplifiers,
        silver: -1,
      },
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      foilProbability: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      foilProbability: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintProbability: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintProbability: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintValueMultiplier: 0.999,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintValueMultiplier: 1_001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      unlockedProbability: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      unlockedProbability: 1.001,
    }).ok,
    false,
  );
});

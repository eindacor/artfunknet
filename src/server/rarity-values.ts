import type { ArtworkRarity, LootData } from "./gameplay.ts";

export const RARITY_VALUE_TIERS = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const satisfies readonly ArtworkRarity[];

export type RarityValueRanges = LootData["rarity_values"];

const MAX_RARITY_VALUE = 1_000_000_000_000;

export function validateRarityValueRanges(
  input: unknown,
):
  | { ok: true; value: RarityValueRanges }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Rarity value ranges must be a JSON object." };
  }

  const record = input as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) =>
      !RARITY_VALUE_TIERS.includes(
        key as (typeof RARITY_VALUE_TIERS)[number],
      ),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown rarity value keys: ${unknownKeys.join(", ")}.`,
    };
  }

  const ranges = {} as RarityValueRanges;
  let previousMaximum = 0;
  for (const rarity of RARITY_VALUE_TIERS) {
    const range = record[rarity];
    if (!range || typeof range !== "object" || Array.isArray(range)) {
      return {
        ok: false,
        error: `The ${rarity} value range must contain min and max values.`,
      };
    }

    const rangeRecord = range as Record<string, unknown>;
    const rangeUnknownKeys = Object.keys(rangeRecord).filter(
      (key) => key !== "min" && key !== "max",
    );
    if (rangeUnknownKeys.length > 0) {
      return {
        ok: false,
        error: `The ${rarity} value range has unknown keys: ${rangeUnknownKeys.join(", ")}.`,
      };
    }

    const min = rangeRecord.min;
    const max = rangeRecord.max;
    if (
      typeof min !== "number" ||
      !Number.isSafeInteger(min) ||
      min < 1 ||
      min > MAX_RARITY_VALUE
    ) {
      return {
        ok: false,
        error: `The ${rarity} minimum must be a whole number from 1 to ${MAX_RARITY_VALUE.toLocaleString()}.`,
      };
    }
    if (
      typeof max !== "number" ||
      !Number.isSafeInteger(max) ||
      max < min ||
      max > MAX_RARITY_VALUE
    ) {
      return {
        ok: false,
        error: `The ${rarity} maximum must be a whole number from its minimum to ${MAX_RARITY_VALUE.toLocaleString()}.`,
      };
    }
    if (min < previousMaximum) {
      return {
        ok: false,
        error: `The ${rarity} minimum must be at least the previous tier's maximum of ${previousMaximum.toLocaleString()}.`,
      };
    }

    ranges[rarity] = { min, max };
    previousMaximum = max;
  }

  return { ok: true, value: ranges };
}

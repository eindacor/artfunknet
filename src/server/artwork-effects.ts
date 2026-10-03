import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import type { Artwork, GameItem } from "./gameplay.ts";
import {
  selectLeastRepresentedEffect,
  type ArtworkEffect,
  type ArtworkEffectType,
} from "./artwork-effects-core.ts";

export {
  getArtworkEffectNumberParameter,
  normalizeLegendaryPair,
  selectLeastRepresentedEffect,
  validateArtworkEffectLinks,
  type ArtworkEffect,
  type ArtworkEffectParameter,
  type ArtworkEffectType,
} from "./artwork-effects-core.ts";

const ASSIGNMENT_LOCK_ID = "artwork-effect-assignment";
const LOCK_MS = 15_000;

export async function getArtworkEffects(
  database: Db,
  ids?: readonly string[],
): Promise<ArtworkEffect[]> {
  if (ids && ids.length === 0) return [];
  const effects = await database
    .collection<ArtworkEffect>("artwork_effects")
    .find(ids ? { _id: { $in: [...ids] } } : {})
    .sort({ effect_type: 1, title: 1, _id: 1 })
    .toArray();
  return effects;
}

/**
 * Resolves effect metadata for an artwork. Gameplay activation must use the
 * displayed-effect helpers unless the item is being transitioned to displayed.
 */
export async function getArtworkEffect(
  database: Db,
  artwork: Pick<Artwork, "_id" | "effect_id" | "rarity">,
  { requireActive = true }: { requireActive?: boolean } = {},
): Promise<ArtworkEffect | null> {
  if (!artwork.effect_id) {
    if (artwork.rarity === "legendary" || artwork.rarity === "masterpiece") {
      console.error(
        `Artwork ${artwork._id} is ${artwork.rarity} but has no effect_id.`,
      );
    }
    return null;
  }
  const effect = await database.collection<ArtworkEffect>("artwork_effects").findOne({
    _id: artwork.effect_id,
    ...(requireActive ? { active: true } : {}),
  });
  if (!effect) {
    console.error(
      `Artwork ${artwork._id} references missing or inactive effect ${artwork.effect_id}.`,
    );
    return null;
  }
  if (effect.effect_type !== artwork.rarity) {
    console.error(
      `Artwork ${artwork._id} effect ${effect._id} has type ${effect.effect_type}, expected ${artwork.rarity}.`,
    );
    return null;
  }
  return effect;
}

export async function getDisplayedArtworkEffects(
  database: Db,
  playerId: string,
  codes?: readonly string[],
): Promise<ArtworkEffect[]> {
  const displayed = await database
    .collection<GameItem>("items")
    .find({ owner: playerId, status: "displayed" })
    .project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 })
    .toArray();
  const artworkIds = [...new Set(displayed.map((item) => item.artwork_id))];
  if (artworkIds.length === 0) return [];
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds }, effect_id: { $type: "string" } })
    .project<Pick<Artwork, "effect_id">>({ effect_id: 1 })
    .toArray();
  const effectIds = [
    ...new Set(
      artworks
        .map((artwork) => artwork.effect_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (effectIds.length === 0) return [];
  const effects = await database
    .collection<ArtworkEffect>("artwork_effects")
    .find({
      _id: { $in: effectIds },
      active: true,
    })
    .sort({ _id: 1 })
    .toArray();
  const foundIds = new Set(effects.map((effect) => effect._id));
  for (const effectId of effectIds) {
    if (!foundIds.has(effectId)) {
      console.error(
        `Displayed artwork references missing, inactive, or unexpected effect ${effectId}.`,
      );
    }
  }
  return codes
    ? effects.filter((effect) => codes.includes(effect.code))
    : effects;
}

export async function getDisplayedArtworkEffect(
  database: Db,
  playerId: string,
  code: string,
): Promise<ArtworkEffect | null> {
  const [effect] = await getDisplayedArtworkEffects(database, playerId, [code]);
  return effect ?? null;
}

export async function withLeastRepresentedArtworkEffect<T>(
  database: Db,
  effectType: ArtworkEffectType,
  operation: (effect: ArtworkEffect) => Promise<T>,
  random: () => number = Math.random,
): Promise<T> {
  const owner = randomUUID();
  const deadline = Date.now() + LOCK_MS;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_MS);
    try {
      const lock = await database
        .collection<{
          _id: string;
          lock_owner?: string;
          lock_until?: Date;
          created_at?: Date;
        }>("metadata")
        .findOneAndUpdate(
          {
            _id: ASSIGNMENT_LOCK_ID,
            $or: [
              { lock_until: { $lte: now } },
              { lock_until: { $exists: false } },
              { lock_owner: owner },
            ],
          },
          {
            $set: { lock_owner: owner, lock_until: lockUntil },
            $setOnInsert: { created_at: now },
          },
          { upsert: true, returnDocument: "after" },
        );
      acquired = lock?.lock_owner === owner;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    if (!acquired) await new Promise((resolve) => setTimeout(resolve, 20));
  }

  function isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
  if (!acquired) {
    throw new Error("Artwork effect assignment is busy; retry the operation.");
  }

  try {
    const [effects, counts] = await Promise.all([
      database
        .collection<ArtworkEffect>("artwork_effects")
        .find({ effect_type: effectType, active: true })
        .toArray(),
      database
        .collection<Artwork>("artworks")
        .aggregate<{ _id: string; count: number }>([
          { $match: { rarity: effectType, effect_id: { $type: "string" } } },
          { $group: { _id: "$effect_id", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const selected = selectLeastRepresentedEffect(
      effects,
      new Map(counts.map((entry) => [entry._id, entry.count])),
      random,
    );
    if (!selected) {
      throw new Error(`No active ${effectType} artwork effect is configured.`);
    }
    return await operation(selected);
  } finally {
    await database
      .collection<{ _id: string; lock_owner?: string; lock_until?: Date }>(
        "metadata",
      )
      .updateOne(
      { _id: ASSIGNMENT_LOCK_ID, lock_owner: owner },
      { $unset: { lock_owner: "", lock_until: "" } },
    );
  }
}

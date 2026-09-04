import type { Db } from "mongodb";

const LEGACY_KARMA_WEIGHTS = {
  historical_data: 1,
  contextual_understanding: 15,
  technical_comprehension: 225,
  artistic_vision: 3375,
} as const;

type LegacyKnowledge = Partial<
  Record<keyof typeof LEGACY_KARMA_WEIGHTS, number>
>;

export function normalizeKarmaBalance(value: number | undefined): number {
  return Number.isFinite(value) ? Math.floor(value ?? 0) : 0;
}

export function convertLegacyKnowledgeToKarma(
  knowledge: LegacyKnowledge | undefined,
): number {
  return Math.max(
    0,
    Math.floor(
      Object.entries(LEGACY_KARMA_WEIGHTS).reduce(
        (total, [type, weight]) =>
          total +
          Math.max(
            0,
            Number.isFinite(knowledge?.[type as keyof LegacyKnowledge])
              ? knowledge?.[type as keyof LegacyKnowledge] ?? 0
              : 0,
          ) *
            weight,
        0,
      ),
    ),
  );
}

export async function ensurePlayerKarma(
  database: Db,
  playerId: string,
): Promise<number> {
  const players = database.collection<{
    _id: string;
    profile?: {
      karma?: number;
      knowledge?: LegacyKnowledge;
    };
  }>("players");
  const player = await players.findOne(
    { _id: playerId },
    { projection: { "profile.karma": 1, "profile.knowledge": 1 } },
  );
  if (!player) {
    throw new Error("The player account is unavailable.");
  }

  if (Number.isFinite(player.profile?.karma)) {
    const karma = normalizeKarmaBalance(player.profile?.karma);
    if (player.profile?.knowledge) {
      await players.updateOne(
        { _id: playerId },
        { $set: { "profile.karma": karma }, $unset: { "profile.knowledge": "" } },
      );
    }
    return karma;
  }

  const karma = convertLegacyKnowledgeToKarma(player.profile?.knowledge);
  const migrated = await players.findOneAndUpdate(
    { _id: playerId, "profile.karma": { $exists: false } },
    {
      $set: { "profile.karma": karma },
      $unset: { "profile.knowledge": "" },
    },
    { returnDocument: "after" },
  );
  if (migrated) return normalizeKarmaBalance(migrated.profile?.karma);

  const current = await players.findOne(
    { _id: playerId },
    { projection: { "profile.karma": 1 } },
  );
  const currentKarma = current?.profile?.karma;
  if (!Number.isFinite(currentKarma)) {
    throw new Error("The player's Karma balance could not be initialized.");
  }
  return normalizeKarmaBalance(currentKarma);
}

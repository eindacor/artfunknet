import "server-only";

import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import {
  createEmptyReactionSummary,
  getCommunityReactionKarmaDelta,
  type CommunityEmote,
  type CommunityReactionSummary,
  type CommunityReactionTarget,
} from "./community-reactions-core";
import { ensurePlayerKarma, normalizeKarmaBalance } from "./karma";

type CommunityReactionDocument = {
  _id: string;
  target_type: CommunityReactionTarget;
  target_id: string;
  emote: CommunityEmote;
  player_id: string;
  created_at: Date;
  expires_at?: Date;
};

let reactionIndexPromise: Promise<void> | undefined;

export function ensureCommunityReactionIndexes(database: Db): Promise<void> {
  reactionIndexPromise ??= Promise.all([
    database.collection("community_reactions").createIndex(
      { target_type: 1, target_id: 1, emote: 1, player_id: 1 },
      { unique: true },
    ),
    database
      .collection("community_reactions")
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => undefined);
  return reactionIndexPromise;
}

export async function getCommunityReactionSummary(
  database: Db,
  targetType: CommunityReactionTarget,
  targetId: string,
  viewerId: string,
): Promise<CommunityReactionSummary> {
  const summaries = await getCommunityReactionSummaries(
    database,
    targetType,
    [targetId],
    viewerId,
  );
  return summaries.get(targetId) ?? createEmptyReactionSummary();
}

export async function getCommunityReactionSummaries(
  database: Db,
  targetType: CommunityReactionTarget,
  targetIds: readonly string[],
  viewerId: string,
): Promise<Map<string, CommunityReactionSummary>> {
  const uniqueTargetIds = [...new Set(targetIds)];
  const summaries = new Map<string, CommunityReactionSummary>(
    uniqueTargetIds.map((targetId) => [
      targetId,
      createEmptyReactionSummary(),
    ]),
  );
  if (uniqueTargetIds.length === 0) return summaries;

  await ensureCommunityReactionIndexes(database);
  const reactions = await database
    .collection<CommunityReactionDocument>("community_reactions")
    .find({
      target_type: targetType,
      target_id: { $in: uniqueTargetIds },
    })
    .toArray();
  for (const reaction of reactions) {
    const summary = summaries.get(reaction.target_id);
    if (!summary) continue;
    summary[reaction.emote].count += 1;
    if (reaction.player_id === viewerId) {
      summary[reaction.emote].reactedByViewer = true;
    }
  }
  return summaries;
}

export async function toggleCommunityReaction(
  database: Db,
  {
    targetType,
    targetId,
    emote,
    playerId,
    expiresAt,
  }: {
    targetType: CommunityReactionTarget;
    targetId: string;
    emote: CommunityEmote;
    playerId: string;
    expiresAt?: Date;
  },
): Promise<{
  karma: number;
  reactions: CommunityReactionSummary;
}> {
  await ensureCommunityReactionIndexes(database);
  let karma = await ensurePlayerKarma(database, playerId);
  const collection =
    database.collection<CommunityReactionDocument>("community_reactions");
  const existing = await collection.findOne({
    target_type: targetType,
    target_id: targetId,
    emote,
    player_id: playerId,
  });
  if (existing) {
    const removed = await collection.deleteOne({ _id: existing._id });
    if (removed.deletedCount !== 1) {
      throw new Error("The reaction changed before it could be removed.");
    }
  } else {
    await collection.insertOne({
      _id: randomUUID(),
      target_type: targetType,
      target_id: targetId,
      emote,
      player_id: playerId,
      created_at: new Date(),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    });
  }
  const added = !existing;
  const karmaDelta = getCommunityReactionKarmaDelta(emote, added);
  if (karmaDelta !== 0) {
    try {
      const updatedPlayer = await database
        .collection<{
          _id: string;
          active: boolean;
          profile?: { karma?: number };
        }>("players")
        .findOneAndUpdate(
          { _id: playerId, active: true },
          { $inc: { "profile.karma": karmaDelta } },
          {
            projection: { "profile.karma": 1 },
            returnDocument: "after",
          },
        );
      if (!updatedPlayer) {
        throw new Error("The player account is unavailable.");
      }
      karma = normalizeKarmaBalance(updatedPlayer.profile?.karma);
    } catch (error) {
      if (existing) {
        await collection.insertOne(existing);
      } else {
        await collection.deleteOne({
          target_type: targetType,
          target_id: targetId,
          emote,
          player_id: playerId,
        });
      }
      throw error;
    }
  }
  return {
    karma,
    reactions: await getCommunityReactionSummary(
      database,
      targetType,
      targetId,
      playerId,
    ),
  };
}

export async function preserveCommunityReactions(
  database: Db,
  targetType: CommunityReactionTarget,
  targetId: string,
): Promise<void> {
  await ensureCommunityReactionIndexes(database);
  await database.collection<CommunityReactionDocument>(
    "community_reactions",
  ).updateMany(
    { target_type: targetType, target_id: targetId },
    { $unset: { expires_at: "" } },
  );
}

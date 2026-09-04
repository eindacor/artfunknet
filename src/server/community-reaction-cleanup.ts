import type { Db } from "mongodb";

import type { CommunityReactionTarget } from "./community-reactions-core.ts";

export async function deleteCommunityReactions(
  database: Db,
  targetType: CommunityReactionTarget,
  targetIds: readonly string[],
): Promise<void> {
  const uniqueTargetIds = [...new Set(targetIds.filter(Boolean))];
  if (uniqueTargetIds.length === 0) return;
  await database.collection("community_reactions").deleteMany({
    target_type: targetType,
    target_id: { $in: uniqueTargetIds },
  });
}

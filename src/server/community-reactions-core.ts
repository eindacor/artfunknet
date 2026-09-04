export const COMMUNITY_EMOTES = [
  "heart",
  "fire",
  "laugh",
  "clap",
  "wow",
  "angry",
  "artfunkel",
] as const;

export const COMMUNITY_REACTION_TARGETS = [
  "message",
  "gallery",
  "item",
  "artist",
] as const;

export type CommunityEmote = (typeof COMMUNITY_EMOTES)[number];
export type CommunityReactionTarget =
  (typeof COMMUNITY_REACTION_TARGETS)[number];

export type CommunityReactionView = {
  count: number;
  reactedByViewer: boolean;
};

export type CommunityReactionSummary = Record<
  CommunityEmote,
  CommunityReactionView
>;

export function isCommunityEmote(value: unknown): value is CommunityEmote {
  return (
    typeof value === "string" &&
    COMMUNITY_EMOTES.some((emote) => emote === value)
  );
}

export function isCommunityReactionTarget(
  value: unknown,
): value is CommunityReactionTarget {
  return (
    typeof value === "string" &&
    COMMUNITY_REACTION_TARGETS.some((target) => target === value)
  );
}

export function getCommunityReactionKarmaDelta(
  emote: CommunityEmote,
  added: boolean,
): number {
  const addedDelta = emote === "heart" ? 1 : emote === "angry" ? -1 : 0;
  if (addedDelta === 0) return 0;
  return added ? addedDelta : -addedDelta;
}

export function createEmptyReactionSummary(): CommunityReactionSummary {
  return {
    heart: { count: 0, reactedByViewer: false },
    fire: { count: 0, reactedByViewer: false },
    laugh: { count: 0, reactedByViewer: false },
    clap: { count: 0, reactedByViewer: false },
    wow: { count: 0, reactedByViewer: false },
    angry: { count: 0, reactedByViewer: false },
    artfunkel: { count: 0, reactedByViewer: false },
  };
}

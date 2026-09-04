export const GALLERY_CHAT_RETENTION_DAYS = 7;

export type GalleryChatPlayerReference = {
  _id: string;
  screen_name: string;
};

export type GalleryChatItemReference = {
  _id: string;
  artwork_id: string;
  artwork: {
    title: string;
    artist: string;
    rarity: ArtworkRarity;
  };
  values: {
    actual: number;
  };
};

export type GalleryChatToken =
  | { kind: "text"; text: string }
  | {
      kind: "player";
      text: string;
      playerId: string;
      screenName: string;
    }
  | {
      kind: "item";
      text: string;
      item: {
        id: string;
        artworkId: string;
        title: string;
        artist: string;
        rarity: ArtworkRarity;
        value: number;
      };
    };

export function getGalleryChatExpiration(now: Date): Date {
  return new Date(
    now.getTime() + GALLERY_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function getVisibleGalleryChatFilter(
  galleryOwnerId: string,
  now: Date,
) {
  return {
    gallery_owner_id: galleryOwnerId,
    hidden: { $ne: true },
    $or: [{ reported: true }, { expires_at: { $gt: now } }],
  };
}

export function getGalleryChatReportUpdate(reporterId: string, now: Date) {
  return {
    $set: {
      reported: true as const,
      reported_at: now,
    },
    $addToSet: { reporter_ids: reporterId },
    $unset: { expires_at: "" as const },
  };
}

export function tokenizeChatContent(
  content: string,
  players: GalleryChatPlayerReference[],
  itemById: ReadonlyMap<string, GalleryChatItemReference>,
): GalleryChatToken[] {
  const matches: Array<{
    start: number;
    end: number;
    token: Exclude<GalleryChatToken, { kind: "text" }>;
  }> = [];

  for (const reference of findItemReferences(content)) {
    const item = itemById.get(reference.itemId);
    if (!item) continue;
    matches.push({
      start: reference.start,
      end: reference.end,
      token: {
        kind: "item",
        text: content.slice(reference.start, reference.end),
        item: {
          id: item._id,
          artworkId: item.artwork_id,
          title: item.artwork.title,
          artist: item.artwork.artist,
          rarity: item.artwork.rarity,
          value: item.values.actual,
        },
      },
    });
  }

  const playersByLongestName = [...players].sort(
    (left, right) => right.screen_name.length - left.screen_name.length,
  );
  const lowerContent = content.toLocaleLowerCase();
  for (const player of playersByLongestName) {
    const mention = `@${player.screen_name}`;
    const lowerMention = mention.toLocaleLowerCase();
    let start = lowerContent.indexOf(lowerMention);
    while (start >= 0) {
      const end = start + mention.length;
      const next = content[end];
      const overlaps = matches.some(
        (candidate) => start < candidate.end && end > candidate.start,
      );
      if ((!next || !/[\p{L}\p{N}_-]/u.test(next)) && !overlaps) {
        matches.push({
          start,
          end,
          token: {
            kind: "player",
            text: content.slice(start, end),
            playerId: player._id,
            screenName: player.screen_name,
          },
        });
      }
      start = lowerContent.indexOf(lowerMention, start + lowerMention.length);
    }
  }

  matches.sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const tokens: GalleryChatToken[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      tokens.push({ kind: "text", text: content.slice(cursor, match.start) });
    }
    tokens.push(match.token);
    cursor = match.end;
  }
  if (cursor < content.length) {
    tokens.push({ kind: "text", text: content.slice(cursor) });
  }
  return tokens;
}

export function findItemReferences(content: string): Array<{
  start: number;
  end: number;
  itemId: string;
}> {
  const matches: Array<{ start: number; end: number; itemId: string }> = [];
  const pattern =
    /(?:https?:\/\/[^\s/]+)?\/items\/([A-Za-z0-9_-]+)(?:[?#][^\s]*)?/gi;
  for (const match of content.matchAll(pattern)) {
    if (match.index === undefined) continue;
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      itemId: match[1],
    });
  }
  return matches;
}
import type { ArtworkRarity } from "./gameplay";

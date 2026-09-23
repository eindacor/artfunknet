export const DEFAULT_POSTCARD_TEMPLATE =
  "Hey, <player_name>, this is <medium> and it was made in <date>.";

export type PostcardParagraphParams = {
  playerName: string;
  medium: string;
  date: string | number;
};

export function resolvePostcardPlayerName(
  screenName?: string | null,
  owner?: string | null,
): string {
  const trimmedScreenName = screenName?.trim();
  if (trimmedScreenName) {
    return trimmedScreenName;
  }
  const trimmedOwner = owner?.trim();
  if (trimmedOwner && trimmedOwner !== "unknown") {
    return trimmedOwner;
  }
  return "friend";
}

export function formatPostcardParagraph(
  template: string = DEFAULT_POSTCARD_TEMPLATE,
  params: PostcardParagraphParams,
): string {
  return template
    .replace(/<player_name>|\{player_name\}/gi, params.playerName)
    .replace(/<medium>|\{medium\}/gi, params.medium)
    .replace(/<date>|\{date\}/gi, String(params.date));
}

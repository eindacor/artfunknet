export const OAUTH_PROVIDERS = [
  { id: "google", name: "Google" },
  { id: "discord", name: "Discord" },
  { id: "microsoft", name: "Microsoft" },
  { id: "steam", name: "Steam" },
  { id: "instagram", name: "Instagram" },
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]["id"];

export function getOAuthMessage(result: string | undefined, provider: string | undefined) {
  const platform = OAUTH_PROVIDERS.find(({ id }) => id === provider)?.name;
  if (!platform) return null;
  switch (result) {
    case "updated": return `${platform} account synchronized.`;
    case "existing-account":
      return "An account already uses this email. Sign in to your existing account, then sync this platform from Account settings.";
    case "conflict":
      return `Syncing ${platform} is not possible at this time. That account or email is associated with another player or a different account is already linked. Account merging is not available yet.`;
    case "inactive": return "This player account is inactive.";
    case "invalid": return `${platform} authorization could not be verified. Sign in and try again.`;
    case "failed": return `${platform} authorization could not be completed. Please try again.`;
    default: return null;
  }
}

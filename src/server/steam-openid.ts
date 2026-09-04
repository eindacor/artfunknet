export function isRecentSteamNonce(
  nonce: string,
  now = Date.now(),
): boolean {
  const timestamp = nonce.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  )?.[1];
  if (!timestamp) return false;
  const issuedAt = Date.parse(timestamp);
  return (
    Number.isFinite(issuedAt) &&
    issuedAt <= now + 60_000 &&
    issuedAt >= now - 10 * 60 * 1000
  );
}

export function collectUniqueSteamOpenIdParameters(
  source: URLSearchParams,
): URLSearchParams | null {
  const parameters = new URLSearchParams();
  for (const [key, value] of source) {
    if (!key.startsWith("openid.")) continue;
    if (parameters.has(key)) return null;
    parameters.set(key, value);
  }
  return parameters;
}

export function hasRequiredSteamSignedFields(
  signedValue: string | null,
): boolean {
  const signed = new Set(signedValue?.split(",") ?? []);
  return [
    "signed",
    "op_endpoint",
    "claimed_id",
    "identity",
    "return_to",
    "response_nonce",
    "assoc_handle",
  ].every((field) => signed.has(field));
}

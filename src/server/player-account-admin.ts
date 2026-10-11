const SENSITIVE_METADATA_KEYS = new Set([
  "access_token",
  "accesstoken",
  "client_secret",
  "clientsecret",
  "code_verifier",
  "codeverifier",
  "encrypted_tokens",
  "encryptedtokens",
  "id_token",
  "idtoken",
  "password_hash",
  "password_salt",
  "refresh_token",
  "refreshtoken",
  "secret",
  "session_token",
  "sessiontoken",
  "token",
]);

export function redactPlayerMetadata(
  value: unknown,
  key?: string,
): unknown {
  if (key && SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
    return "[redacted]";
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => redactPlayerMetadata(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactPlayerMetadata(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

import type { Db } from "mongodb";

import {
  normalizePlayerEmail,
  type PlayerAccountRecord,
} from "./player-account.ts";
import { verifyPassword } from "./password.ts";

export type PlayerPasswordAuthenticationResult =
  | { status: "invalid" }
  | { status: "authenticated"; player: PlayerAccountRecord };

const DUMMY_PASSWORD_SALT = "invalid-player-credentials";
const DUMMY_PASSWORD_HASH = "0".repeat(128);

export async function authenticatePlayerPassword(
  database: Db,
  emailValue: unknown,
  passwordValue: unknown,
): Promise<PlayerPasswordAuthenticationResult> {
  const email = normalizePlayerEmail(emailValue);
  if (!email || typeof passwordValue !== "string") {
    return { status: "invalid" };
  }

  const player = await database
    .collection<PlayerAccountRecord>("players")
    .findOne({ email });
  const hasPassword = Boolean(player?.password_salt && player.password_hash);
  const passwordMatches = await verifyPassword(
    passwordValue,
    hasPassword ? player!.password_salt : DUMMY_PASSWORD_SALT,
    hasPassword ? player!.password_hash : DUMMY_PASSWORD_HASH,
  );
  if (!player || !player.active || !hasPassword || !passwordMatches) {
    return { status: "invalid" };
  }

  return { status: "authenticated", player };
}

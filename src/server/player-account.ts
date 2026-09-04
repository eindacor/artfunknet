import { randomBytes } from "node:crypto";

import type { Db } from "mongodb";

export const RESERVED_PLAYER_NAMES = ["artfunkel"] as const;

export type PlayerAccountRecord = {
  [key: string]: unknown;
  _id: string;
  email: string;
  username: string;
  screen_name: string;
  role: "player";
  test_account: boolean;
  active: boolean;
  password_salt: string;
  password_hash: string;
  profile: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

let playerIndexPromise: Promise<void> | undefined;

export function normalizePlayerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export function normalizeScreenName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const screenName = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  // TODO: let players use spaces when @ linking helps the user pick the right person
  if (
    screenName.length < 3 ||
    screenName.length > 24 ||
    !/^[\p{L}\p{N}_-]+$/u.test(screenName) ||
    RESERVED_PLAYER_NAMES.some(
      (reserved) => reserved === screenName.toLocaleLowerCase(),
    )
  ) {
    return null;
  }
  return screenName;
}

export function createPlayerAccountRecord({
  email,
  screenName,
  passwordSalt,
  passwordHash,
  now = new Date(),
  playerId = randomBytes(12).toString("hex"),
}: {
  email: string;
  screenName: string;
  passwordSalt: string;
  passwordHash: string;
  now?: Date;
  playerId?: string;
}): PlayerAccountRecord {
  return {
    _id: playerId,
    email,
    username: email,
    screen_name: screenName,
    role: "player",
    test_account: false,
    active: true,
    password_salt: passwordSalt,
    password_hash: passwordHash,
    profile: createDefaultPlayerProfile(screenName, now),
    created_at: now,
    updated_at: now,
  };
}

export function createDefaultPlayerProfile(
  screenName: string,
  now = new Date(),
): Record<string, unknown> {
  return {
    user_type: "player",
    screen_name: screenName,
    active: true,
    bank_balance: 100_000,
    card_style_consumables: {},
    last_drop: new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString(),
    last_login: now.toISOString(),
    level: 0,
    xp: 0,
    karma: 0,
    lottery_tickets: 1,
    entry_fee: "medium",
    inventory_cap: 15,
    display_cap: 5,
    auction_cap: 8,
    ticket_cap: 3,
    pc_cap: 12,
    visitor_cap: 20,
    repairing_cap: 4,
    npcs_met: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    completed_quests: 0,
    market_expert: { expiration: new Date(0).toISOString() },
  };
}

export function ensurePlayerAccountIndexes(database: Db): Promise<void> {
  playerIndexPromise ??= Promise.all([
    database
      .collection("players")
      .createIndex({ email: 1 }, { unique: true }),
    database
      .collection("players")
      .createIndex({ screen_name: 1 }, { unique: true }),
  ])
    .then(() => undefined)
    .catch((error) => {
      playerIndexPromise = undefined;
      throw error;
    });
  return playerIndexPromise;
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export function getDuplicateKeyFields(error: unknown): string[] {
  if (typeof error !== "object" || error === null) return [];
  const candidate = error as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
  };
  return Object.keys(candidate.keyPattern ?? candidate.keyValue ?? {});
}

import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";

import { getBearerToken } from "./authorization.ts";
import { getDatabase } from "./mongodb.ts";

export const ADMIN_SESSION_COOKIE = "artfunkel_admin_session";
export const PLAYER_SESSION_COOKIE = "artfunkel_player_session";
export const PLAYER_SESSION_TTL_SECONDS = 60 * 60 * 8;

export type AdminSession = {
  email: string;
  role: "admin";
};

export type PlayerSession = {
  playerId: string;
  email: string;
  screenName: string;
  role: "player";
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export async function createAdminSessionToken(email: string): Promise<string> {
  return new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function createPlayerSessionToken(
  player: Omit<PlayerSession, "role">,
): Promise<string> {
  return new SignJWT({
    email: player.email,
    screenName: player.screenName,
    role: "player",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(player.playerId)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (
      payload.role !== "admin" ||
      typeof payload.email !== "string"
    ) {
      return null;
    }

    return {
      email: payload.email,
      role: "admin",
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function getPlayerSession(
  options: { accountErasure?: boolean; allowDeleting?: boolean } = {},
): Promise<PlayerSession | null> {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const token =
    getBearerToken(requestHeaders.get("authorization")) ??
    cookieStore.get(PLAYER_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  let session: PlayerSession;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (
      payload.role !== "player" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.screenName !== "string"
    ) {
      return null;
    }

    session = {
      playerId: payload.sub,
      email: payload.email,
      screenName: payload.screenName,
      role: "player",
    };
  } catch {
    return null;
  }
  const player = await (await getDatabase(options))
    .collection<{ _id: string; active: boolean; account_deletion?: boolean }>("players")
    .findOne({
      _id: session.playerId,
      active: true,
      ...(!options.allowDeleting ? { account_deletion: { $ne: true } } : {}),
    }, { projection: { _id: 1 } });
  return player ? session : null;
}

export async function requirePlayer(
  options: { allowDeleting?: boolean } = {},
): Promise<PlayerSession> {
  const session = await getPlayerSession(options);

  if (!session) {
    redirect("/play/login");
  }

  return session;
}

export const adminSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.SESSION_COOKIE_SECURE === "true",
  path: "/",
  maxAge: PLAYER_SESSION_TTL_SECONDS,
};

export const playerSessionCookieOptions = adminSessionCookieOptions;

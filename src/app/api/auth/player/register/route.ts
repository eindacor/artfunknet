import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { hashPassword, validatePassword } from "@/server/password";
import {
  createPlayerAccountRecord,
  ensurePlayerAccountIndexes,
  getDuplicateKeyFields,
  isDuplicateKeyError,
  normalizePlayerEmail,
  normalizeScreenName,
  type PlayerAccountRecord,
} from "@/server/player-account";
import {
  createOperationId,
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  playerSessionCookieOptions,
} from "@/server/session";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "The registration request is invalid." },
      { status: 400 },
    );
  }

  const email = normalizePlayerEmail(body.email);
  const screenName = normalizeScreenName(body.screenName);
  const passwordError = validatePassword(body.password);

  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  if (!screenName) {
    return NextResponse.json(
      {
        error:
          "Player name must be 3-24 letters, numbers, underscores, or hyphens.",
      },
      { status: 400 },
    );
  }
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const operationId = createOperationId("player-registration");
  try {
    const password = body.password as string;
    const database = await getDatabase();
    await ensurePlayerAccountIndexes(database);
    const passwordCredentials = await hashPassword(password);
    const player = createPlayerAccountRecord({
      email,
      screenName,
      passwordSalt: passwordCredentials.salt,
      passwordHash: passwordCredentials.hash,
    });
    const sessionToken = await createPlayerSessionToken({
      playerId: player._id,
      email: player.email,
      screenName: player.screen_name,
    });
    await database
      .collection<PlayerAccountRecord>("players")
      .insertOne(player);
    logOperationalInfo("player_registration.created", {
      operationId,
      playerId: player._id,
      screenName: player.screen_name,
    });

    const response = NextResponse.json({ status: "ok" }, { status: 201 });
    response.cookies.set(
      PLAYER_SESSION_COOKIE,
      sessionToken,
      playerSessionCookieOptions,
    );
    return response;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      logOperationalInfo("player_registration.duplicate", {
        duplicateFields: getDuplicateKeyFields(error).join(",") || "unknown",
        operationId,
        screenName,
      });
      return NextResponse.json(
        { error: "That email or player name is already in use." },
        { status: 409 },
      );
    }
    logOperationalError("player_registration.failed", error, {
      operationId,
      screenName,
    });
    return NextResponse.json(
      {
        error: `The account could not be created. Reference: ${operationId}`,
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";
import { hashPassword, validatePassword } from "@/server/password";
import { normalizePlayerEmail } from "@/server/player-account";

type PlayerAccount = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  password_salt?: string;
  password_hash?: string;
  oauth_accounts?: Record<string, unknown>;
  google_sub?: string;
  created_at?: Date;
  updated_at?: Date;
};

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const email = normalizePlayerEmail(
    new URL(request.url).searchParams.get("email"),
  );
  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid player email address." },
      { status: 400 },
    );
  }

  const player = await (await getDatabase())
    .collection<PlayerAccount>("players")
    .findOne(
      { email },
      {
        projection: {
          _id: 1,
          email: 1,
          screen_name: 1,
          active: 1,
          password_salt: 1,
          password_hash: 1,
          oauth_accounts: 1,
          google_sub: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    );
  if (!player) {
    return NextResponse.json(
      { error: "No player account uses that email address." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    account: {
      id: player._id,
      email: player.email,
      screenName: player.screen_name,
      active: player.active,
      hasPassword: Boolean(player.password_salt && player.password_hash),
      hasOAuth: Boolean(
        player.google_sub ||
          (player.oauth_accounts &&
            Object.keys(player.oauth_accounts).length > 0),
      ),
      createdAt: player.created_at?.toISOString() ?? null,
      updatedAt: player.updated_at?.toISOString() ?? null,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "The password-reset request is invalid." },
      { status: 400 },
    );
  }

  const email = normalizePlayerEmail(body.email);
  const passwordError = validatePassword(body.password);
  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid player email address." },
      { status: 400 },
    );
  }
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const credentials = await hashPassword(body.password as string);
  const now = new Date();
  const result = await (await getDatabase())
    .collection<PlayerAccount>("players")
    .updateOne(
      { email },
      {
        $set: {
          password_salt: credentials.salt,
          password_hash: credentials.hash,
          password_updated_at: now,
          password_reset_by: auth.session.email,
          updated_at: now,
        },
      },
    );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "No player account uses that email address." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ok",
    message: `A new password was set for ${email}.`,
  });
}

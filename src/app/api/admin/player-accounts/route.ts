import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";
import { hashPassword, validatePassword } from "@/server/password";
import { normalizePlayerEmail } from "@/server/player-account";
import {
  linkPlayerAccountToArtist,
  PlayerArtistLinkError,
  redactPlayerMetadata,
} from "@/server/player-account-admin";
import type { Db } from "mongodb";
import {
  normalizeSupporterStatus,
  resolvePlayerSupporterStatus,
  type SupporterStatusPlayer,
} from "@/server/supporter-status";

type PlayerAccount = SupporterStatusPlayer & {
  [key: string]: unknown;
  email: string;
  screen_name: string;
  password_salt?: string;
  password_hash?: string;
  oauth_accounts?: Record<string, unknown>;
  google_sub?: string;
  created_at?: Date;
  updated_at?: Date;
  artist_id?: string;
};

type AccountArtist = { _id: string; artist_name: string };
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const database = await getDatabase();
  if (params.has("q")) {
    const query = (params.get("q") ?? "").trim().slice(0, 254);
    if (!query) return NextResponse.json({ accounts: [] }, NO_STORE);
    const match = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const players = await database.collection<PlayerAccount>("players")
      .find({ $or: [
        { email: match }, { account_emails: match }, { verified_emails: match },
        { screen_name: match }, { "profile.screen_name": match },
      ] })
      .project<PlayerAccount>({ email: 1, screen_name: 1, active: 1, artist_id: 1 })
      .sort({ screen_name: 1, _id: 1 }).limit(20).toArray();
    return NextResponse.json({ accounts: players.map(player => ({
      id: player._id, email: player.email, screenName: player.screen_name,
      active: player.active, artistId: player.artist_id ?? null,
    })) }, NO_STORE);
  }
  const id = params.get("id")?.trim();
  const email = normalizePlayerEmail(params.get("email"));
  if (!id && !email) {
    return NextResponse.json(
      { error: "Choose a player account or enter a valid email address." },
      { status: 400 },
    );
  }

  const player = await database.collection<PlayerAccount>("players").findOne(id ? { _id: id } : { email: email! });
  if (!player) {
    return NextResponse.json(
      { error: "The player account could not be found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ account: await toPlayerAccountView(player, database) }, NO_STORE);
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json(
      { error: "The player-account update request is invalid." },
      { status: 400 },
    );
  }

  if (body.action === "link-artist") {
    const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
    const artistId = typeof body.artistId === "string" ? body.artistId.trim() : "";
    if (!playerId || !artistId) {
      return NextResponse.json({ error: "Choose a player and a catalog artist." }, { status: 400 });
    }
    const database = await getDatabase();
    try {
      await linkPlayerAccountToArtist(database, playerId, artistId, auth.session.email);
    } catch (error) {
      if (error instanceof PlayerArtistLinkError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    const player = await database.collection<PlayerAccount>("players").findOne({ _id: playerId });
    if (!player) return NextResponse.json({ error: "The player account is unavailable." }, { status: 404 });
    return NextResponse.json({
      status: "ok", message: `${player.screen_name} now has access to the artist portal.`,
      account: await toPlayerAccountView(player, database),
    }, NO_STORE);
  }

  const email = normalizePlayerEmail(body.email);
  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid player email address." },
      { status: 400 },
    );
  }

  if (body.action === "set-supporter-override") {
    return updateSupporterOverride({
      adminEmail: auth.session.email,
      email,
      value: body.supporterStatus,
    });
  }
  if (body.action !== "reset-password" && !("password" in body)) {
    return NextResponse.json(
      { error: "Choose a supported player-account update." },
      { status: 400 },
    );
  }

  const passwordError = validatePassword(body.password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const credentials = await hashPassword(body.password as string);
  const now = new Date();
  const database = await getDatabase();
  const result = await database
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

  const player = await database
    .collection<PlayerAccount>("players")
    .findOne({ email });
  return NextResponse.json({
    status: "ok",
    message: `A new password was set for ${email}.`,
    ...(player ? { account: await toPlayerAccountView(player, database) } : {}),
  });
}

async function updateSupporterOverride({
  adminEmail,
  email,
  value,
}: {
  adminEmail: string;
  email: string;
  value: unknown;
}) {
  const supporterStatus =
    value === null ? null : normalizeSupporterStatus(value);
  if (value !== null && supporterStatus === null) {
    return NextResponse.json(
      { error: "Choose a valid supporter status or clear the override." },
      { status: 400 },
    );
  }

  const now = new Date();
  const database = await getDatabase();
  const collection = database.collection<PlayerAccount>("players");
  const result = await collection.updateOne(
    { email },
    supporterStatus
      ? {
          $set: {
            "supporter.admin_override": supporterStatus,
            "supporter.admin_override_updated_at": now,
            "supporter.admin_override_updated_by": adminEmail,
            updated_at: now,
          },
        }
      : {
          $set: {
            "supporter.admin_override_updated_at": now,
            "supporter.admin_override_updated_by": adminEmail,
            updated_at: now,
          },
          $unset: { "supporter.admin_override": "" },
        },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "No player account uses that email address." },
      { status: 404 },
    );
  }

  const player = await collection.findOne({ email });
  if (!player) {
    return NextResponse.json(
      { error: "The updated player account could not be loaded." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    status: "ok",
    message: supporterStatus
      ? `${email} now has a ${supporterStatus} supporter override.`
      : `The supporter override for ${email} was cleared.`,
    account: await toPlayerAccountView(player, database),
  });
}

async function toPlayerAccountView(player: PlayerAccount, database: Db) {
  const artist = player.artist_id
    ? await database.collection<AccountArtist>("artists").findOne({ _id: player.artist_id })
    : null;
  return {
    id: player._id,
    email: player.email,
    screenName: player.screen_name,
    active: player.active,
    artistId: player.artist_id ?? null,
    artistName: artist?.artist_name ?? null,
    hasPassword: Boolean(player.password_salt && player.password_hash),
    hasOAuth: Boolean(
      player.google_sub ||
        (player.oauth_accounts &&
          Object.keys(player.oauth_accounts).length > 0),
    ),
    supporterStatus: resolvePlayerSupporterStatus(player),
    supporterOverride:
      normalizeSupporterStatus(player.supporter?.admin_override) ?? null,
    createdAt: player.created_at?.toISOString() ?? null,
    updatedAt: player.updated_at?.toISOString() ?? null,
    metadata: redactPlayerMetadata(player),
  };
}

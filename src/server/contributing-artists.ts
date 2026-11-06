import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";

import { ARTWORK_RARITIES, type Artwork } from "./gameplay.ts";
import { findPlayerByAuthEmail } from "./oauth-identity.ts";
import { hashPassword, validatePassword } from "./password.ts";
import {
  createPlayerAccountRecord, ensurePlayerAccountIndexes, insertPlayerAccountRecord, isDuplicateKeyError,
  normalizePlayerEmail, normalizeScreenName, type PlayerAccountRecord,
} from "./player-account.ts";
import {
  MAX_FEATURED_ARTISTS, type ArtistApplication, type ArtistRecord,
  type ArtistSocialLinks, type FeaturedArtistGallery, type PublicArtistProfile,
} from "./artist-types.ts";

type ArtistPlayer = PlayerAccountRecord & {
  oauth_accounts?: { instagram?: { id: string; username?: string } };
  account_deletion?: boolean;
};

export class ArtistExperienceError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const indexes = new WeakMap<Db, Promise<void>>();
export function ensureArtistIndexes(database: Db): Promise<void> {
  let promise = indexes.get(database);
  if (!promise) {
    promise = Promise.all([
      database.collection("artist_applications").createIndex(
        { email: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["pending", "approving"] } } },
      ),
      database.collection("artist_applications").createIndex(
        { player_id: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["pending", "approving"] } } },
      ),
      database.collection("players").createIndex({ artist_featured_slot: 1 }, { unique: true, sparse: true }),
      database.collection("artworks").createIndex({ artist_id: 1, active: 1 }),
    ]).then(() => undefined).catch(error => { indexes.delete(database); throw error; });
    indexes.set(database, promise);
  }
  return promise;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

export function validateArtistUrl(value: unknown, required = true): string {
  const raw = text(value, 2048);
  if (!raw && !required) return "";
  try {
    const url = new URL(raw);
    if (raw.length > 2048 || !["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new ArtistExperienceError("Enter a valid http or https website URL.");
  }
}

export function validateArtistApplication(input: Record<string, unknown>, now = new Date()) {
  const name = text(input.name, 120);
  const bio = text(input.bio, 5000);
  const dateOfBirth = text(input.dateOfBirth, 10);
  const birthday = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const adultCutoff = `${now.getUTCFullYear() - 18}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  if (name.length < 2 || name.length > 120 || bio.length > 5000) {
    throw new ArtistExperienceError("Enter your name (2-120 characters) and a bio of at most 5,000 characters.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(birthday.getTime()) ||
      birthday.toISOString().slice(0, 10) !== dateOfBirth || dateOfBirth < "1900-01-01" || dateOfBirth > adultCutoff) {
    throw new ArtistExperienceError("Artist applicants must be at least 18. Enter your complete date of birth.");
  }
  return {
    name, bio, date_of_birth: dateOfBirth, portfolio_url: validateArtistUrl(input.portfolioUrl),
    feature_link: validateArtistUrl(input.featureLink, false),
  };
}

export async function submitArtistApplication(database: Db, input: Record<string, unknown>, sessionPlayerId?: string) {
  const details = validateArtistApplication(input);
  await ensureArtistIndexes(database);
  const player = sessionPlayerId
    ? await database.collection<ArtistPlayer>("players").findOne({
        _id: sessionPlayerId, active: true, account_deletion: { $ne: true },
      })
    : null;
  if (sessionPlayerId && !player) throw new ArtistExperienceError("Sign in again before applying.", 401);
  if (player?.artist_id) throw new ArtistExperienceError("Your account is already a contributing artist.", 409);
  const email = player?.email ?? normalizePlayerEmail(input.email);
  const screenName = player?.screen_name ?? normalizeScreenName(input.screenName);
  if (!email || !screenName) throw new ArtistExperienceError("Enter a valid email and a player name of 3-24 letters, numbers, underscores, or hyphens.");
  let credentials: ArtistApplication["credentials"];
  if (!player) {
    if (await findPlayerByAuthEmail(database, email)) {
      throw new ArtistExperienceError('That email belongs to a player. Log in and select "Become a contributing artist" in Account settings.', 409);
    }
    if (await database.collection("players").findOne({ screen_name: screenName })) {
      throw new ArtistExperienceError("That player name is already in use.", 409);
    }
    const passwordError = validatePassword(input.password);
    if (passwordError) throw new ArtistExperienceError(passwordError);
    if (input.password !== input.confirmPassword) throw new ArtistExperienceError("The passwords do not match.");
    credentials = await hashPassword(input.password as string);
  }
  const application: ArtistApplication = {
    _id: randomBytes(12).toString("hex"), ...details, email, screen_name: screenName,
    player_id: player?._id ?? randomBytes(12).toString("hex"),
    existing_player: Boolean(player), ...(credentials ? { credentials } : {}),
    status: "pending", created_at: new Date(),
  };
  try {
    await database.collection<ArtistApplication>("artist_applications").insertOne(application);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ArtistExperienceError("An application is already awaiting review for this account.", 409);
    throw error;
  }
  return application._id;
}

export async function approveArtistApplication(database: Db, id: string, adminEmail: string) {
  await ensureArtistIndexes(database);
  await ensurePlayerAccountIndexes(database);
  const applications = database.collection<ArtistApplication>("artist_applications");
  const now = new Date();
  const application = await applications.findOneAndUpdate({
    _id: id,
    $or: [{ status: "pending" }, { status: "approving", approval_started_at: { $lte: new Date(now.getTime() - 120_000) } }],
  }, { $set: { status: "approving", approval_started_at: now } }, { returnDocument: "after" });
  if (!application) throw new ArtistExperienceError("The application is unavailable or is already being reviewed.", 409);
  try {
    const players = database.collection<ArtistPlayer>("players");
    const existing = await players.findOne({ _id: application.player_id });
    if (application.existing_player && (!existing?.active || existing.account_deletion)) {
      throw new ArtistExperienceError("The applicant's player account is no longer available.", 409);
    }
    if (existing?.artist_id && existing.artist_id !== id) {
      throw new ArtistExperienceError("This player is already linked to a different artist.", 409);
    }
    if (!application.existing_player) {
      const emailOwner = await findPlayerByAuthEmail(database, application.email);
      if (emailOwner && emailOwner._id !== application.player_id) {
        throw new ArtistExperienceError("This email now belongs to a player. Ask the applicant to apply from Account settings.", 409);
      }
    }
    await database.collection<ArtistRecord>("artists").updateOne({ _id: id }, { $setOnInsert: {
      _id: id, artist_name: application.name, date_of_birth: application.date_of_birth,
      portfolio_url: application.portfolio_url, bio: application.bio, social_links: {},
      feature_link: application.feature_link ?? "",
      player_id: application.player_id, created_from_application: id, created_at: now,
    } }, { upsert: true });
    if (!application.existing_player && !existing) {
      if (!application.credentials) throw new ArtistExperienceError("The application has no sign-in credentials.", 409);
      const player = createPlayerAccountRecord({
        playerId: application.player_id, email: application.email, screenName: application.screen_name,
        passwordSalt: application.credentials.salt, passwordHash: application.credentials.hash, now,
      });
      await insertPlayerAccountRecord(database, { ...player, account_type: "artist", artist_id: id });
    } else {
      const linked = await players.updateOne({
        _id: application.player_id, active: true, account_deletion: { $ne: true },
        $or: [{ artist_id: { $exists: false } }, { artist_id: id }],
      }, { $set: { account_type: "artist", artist_id: id, updated_at: now } });
      if (!linked.matchedCount) throw new ArtistExperienceError("The player account changed before approval.", 409);
    }
    await applications.updateOne({ _id: id, status: "approving" }, {
      $set: { status: "approved", approved_at: now, approved_by: adminEmail },
      $unset: { credentials: "", approval_started_at: "" },
    });
    return id;
  } catch (error) {
    const linked = await database.collection<ArtistPlayer>("players").findOne({ artist_id: id });
    if (!linked) await database.collection<ArtistRecord>("artists").deleteOne({ _id: id, created_from_application: id });
    await applications.updateOne({ _id: id, status: "approving" }, {
      $set: { status: "pending" }, $unset: { approval_started_at: "" },
    });
    if (isDuplicateKeyError(error)) throw new ArtistExperienceError("The applicant's email, player name, or artist name is now in use.", 409);
    throw error;
  }
}

export async function setArtistFeatured(database: Db, playerId: string, featured: boolean) {
  await ensureArtistIndexes(database);
  const players = database.collection<ArtistPlayer>("players");
  const filter = { _id: playerId, artist_id: { $type: "string" as const } };
  if (!featured) {
    const updated = await players.updateOne(filter, { $set: { artist_featured: false }, $unset: { artist_featured_slot: "" } });
    if (!updated.matchedCount) throw new ArtistExperienceError("Artist account not found.", 404);
    if (updated.modifiedCount) await database.collection("npcs").deleteMany({ owner_id: playerId, tutorial: { $ne: true } });
    return;
  }
  for (let slot = 1; slot <= MAX_FEATURED_ARTISTS; slot++) {
    try {
      const updated = await players.updateOne({ ...filter, active: true, artist_featured: { $ne: true } }, {
        $set: { artist_featured: true, artist_featured_slot: slot },
      });
      if (updated.matchedCount) {
        await database.collection("npcs").deleteMany({ owner_id: playerId, tutorial: { $ne: true } });
        return;
      }
      if (await players.findOne({ ...filter, active: true, artist_featured: true })) return;
      throw new ArtistExperienceError("Artist account not found.", 404);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  throw new ArtistExperienceError(`Only ${MAX_FEATURED_ARTISTS} artists can be featured. Unfeature one first.`, 409);
}

export async function getPublicArtistProfile(database: Db, playerId: string): Promise<PublicArtistProfile | null> {
  const player = await database.collection<ArtistPlayer>("players").findOne({
    _id: playerId, active: true, account_deletion: { $ne: true }, artist_id: { $type: "string" },
  }, { projection: { artist_id: 1, artist_featured: 1, "oauth_accounts.instagram": 1 } });
  if (!player?.artist_id) return null;
  const artist = await database.collection<ArtistRecord>("artists").findOne({ _id: player.artist_id });
  if (!artist) return null;
  const username = player.oauth_accounts?.instagram?.username;
  return {
    id: artist._id, playerId, name: artist.artist_name, bio: artist.bio ?? "",
    portfolioUrl: artist.portfolio_url ?? "", socialLinks: artist.social_links ?? {},
    featureLink: artist.feature_link ?? "",
    instagramUsername: player.oauth_accounts?.instagram?.id && username && /^[a-zA-Z0-9._]{1,30}$/.test(username) ? username : null,
    featured: player.artist_featured === true,
  };
}

export async function getArtistWorks(database: Db, artistId: string): Promise<Artwork[]> {
  const works = await database.collection<Artwork>("artworks").find({ artist_id: artistId, active: true }, {
    projection: {
      _id: 1, artist_id: 1, artist: 1, title: 1, date: 1, genre: 1, medium: 1, rarity: 1,
      value_scale: 1, height: 1, width: 1, active: 1, image: 1, effect_id: 1,
      art_style_adjustments: 1, detail_image_adjustments: 1, thumbnail_adjustment: 1,
      special_attributes: 1, image_width: 1, image_height: 1, nsfw: 1,
    },
  }).toArray();
  return works.sort((left, right) =>
    ARTWORK_RARITIES.indexOf(right.rarity) - ARTWORK_RARITIES.indexOf(left.rarity) || left.title.localeCompare(right.title));
}

export async function getFeaturedArtistGalleries(database: Db): Promise<FeaturedArtistGallery[]> {
  const players = await database.collection<ArtistPlayer>("players").find({
    active: true, account_deletion: { $ne: true }, artist_featured: true, artist_id: { $type: "string" },
  }).sort({ artist_featured_slot: 1 }).limit(MAX_FEATURED_ARTISTS).toArray();
  const profiles = await Promise.all(players.map(async (player): Promise<FeaturedArtistGallery | null> => {
    const profile = await getPublicArtistProfile(database, player._id);
    if (!profile) return null;
    const [rarest] = await getArtistWorks(database, profile.id);
    return { ...profile, thumbnail: rarest ? {
      _id: rarest._id, title: rarest.title, image: rarest.image, thumbnail_adjustment: rarest.thumbnail_adjustment,
    } : null };
  }));
  return profiles.filter((profile): profile is FeaturedArtistGallery => profile !== null);
}

export function validateArtistProfile(input: Record<string, unknown>) {
  const bio = text(input.bio, 5000);
  if (bio.length > 5000) throw new ArtistExperienceError("The bio must be at most 5,000 characters.");
  const socialLinks: ArtistSocialLinks = {};
  const links = input.socialLinks && typeof input.socialLinks === "object"
    ? input.socialLinks as Record<string, unknown> : {};
  for (const kind of ["instagram", "facebook", "bluesky", "youtube"] as const) {
    const url = validateArtistUrl(links[kind], false);
    if (url) socialLinks[kind] = url;
  }
  return {
    bio, portfolio_url: validateArtistUrl(input.portfolioUrl), social_links: socialLinks,
    feature_link: validateArtistUrl(input.featureLink, false),
  };
}

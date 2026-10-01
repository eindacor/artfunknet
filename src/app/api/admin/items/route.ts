import { NextResponse } from "next/server";
import type { Db } from "mongodb";

import { getCardCosmetic } from "@/components/item-cards/catalog";
import { requireAdminApi } from "@/server/admin-api";
import {
  buildAdminCreatedItem,
  type AdminItemAttributeInput,
  type AdminItemCustomization,
} from "@/server/admin-item-creator";
import { getGameplaySettings } from "@/server/game-settings";
import type { ArtworkEffect } from "@/server/artwork-effects-core";
import {
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import {
  ensureRaffleState,
  RAFFLE_MAX_POTENCY,
  RAFFLE_OWNER_ID,
  RAFFLE_STATE_ID,
  type RaffleState,
} from "@/server/raffle-gameplay";

type AdminPlayerSearchResult = {
  _id: string;
  screen_name: string;
  email: string;
  active: boolean;
  test_account?: boolean;
};

type AdminItemDestination =
  | { type: "player"; playerId: string }
  | { type: "lottery_buffer" };

type ParsedAdminItemRequest = {
  artworkId: string;
  customization: AdminItemCustomization;
  destination: AdminItemDestination;
};

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ players: [] });
  const escapedQuery = query.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const database = await getDatabase();
  const players = await database
    .collection<AdminPlayerSearchResult>("players")
    .find(
      {
        active: true,
        $or: [
          { screen_name: { $regex: escapedQuery, $options: "i" } },
          { email: { $regex: escapedQuery, $options: "i" } },
        ],
      },
      {
        projection: {
          screen_name: 1,
          email: 1,
          active: 1,
          test_account: 1,
        },
      },
    )
    .sort({ screen_name: 1 })
    .limit(20)
    .toArray();
  return NextResponse.json({
    players: players.map((player) => ({
      id: player._id,
      screenName: player.screen_name,
      email: player.email,
      testAccount: player.test_account === true,
    })),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Provide valid item preview data." },
      { status: 400 },
    );
  }
  if (!isRecord(rawBody)) {
    return NextResponse.json(
      { error: "Provide valid item preview data." },
      { status: 400 },
    );
  }
  const parsed = parseAdminItemDraft(rawBody.item);
  if (!parsed) {
    return NextResponse.json(
      { error: "Provide valid item preview data." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const context = await getAdminItemContext(database, parsed.artworkId);
  if (!context) {
    return NextResponse.json(
      { error: "The selected artwork or item configuration is unavailable." },
      { status: 404 },
    );
  }
  try {
    const item = buildAdminCreatedItem({
      artwork: context.artwork,
      attributes: context.attributes,
      customization: parsed.customization,
      effect: context.effect,
      lootData: context.metadata.loot_data,
      mintValueMultiplier: context.settings.active.mintValueMultiplier,
      owner: "admin-preview",
    });
    return NextResponse.json({
      item: {
        ...item,
        artwork: { ...context.artwork, ...item.artwork_overrides },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The item configuration is invalid.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Provide valid item creation data." },
      { status: 400 },
    );
  }
  const parsed = parseAdminItemRequest(rawBody);
  if (!parsed) {
    return NextResponse.json(
      { error: "Provide valid item creation data." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const context = await getAdminItemContext(database, parsed.artworkId);
  if (!context) {
    return NextResponse.json(
      { error: "The selected artwork or item configuration is unavailable." },
      { status: 404 },
    );
  }

  let owner: string;
  let player: AdminPlayerSearchResult | null = null;
  let raffleState: RaffleState | null = null;
  if (parsed.destination.type === "player") {
    player = await database
      .collection<AdminPlayerSearchResult>("players")
      .findOne({
        _id: parsed.destination.playerId,
        active: true,
      });
    if (!player) {
      return NextResponse.json(
        { error: "The selected player is unavailable." },
        { status: 404 },
      );
    }
    owner = player._id;
  } else {
    raffleState = await ensureRaffleState(database, context.settings.active);
    if (
      (raffleState.draw_lock &&
        new Date(raffleState.draw_lock.expires_at).getTime() > Date.now())
    ) {
      return NextResponse.json(
        { error: "That lottery buffer slot is unavailable during the drawing." },
        { status: 409 },
      );
    }
    owner = RAFFLE_OWNER_ID;
    parsed.customization.lottery = Math.max(1, parsed.customization.lottery);
  }

  let item: GameItem;
  try {
    item = buildAdminCreatedItem({
      artwork: context.artwork,
      attributes: context.attributes,
      customization: parsed.customization,
      effect: context.effect,
      lootData: context.metadata.loot_data,
      mintValueMultiplier: context.settings.active.mintValueMultiplier,
      owner,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The item configuration is invalid.",
      },
      { status: 400 },
    );
  }
  await database.collection<GameItem>("items").insertOne(item);

  if (parsed.destination.type === "lottery_buffer" && raffleState) {
    const appended = await database.collection<RaffleState>("metadata").updateOne(
      {
        _id: RAFFLE_STATE_ID,
        buffer_prizes: raffleState.buffer_prizes,
        draw_lock: { $exists: false },
      },
      {
        $set: {
          updated_at: new Date().toISOString(),
          updated_by: auth.session.email,
        },
        $push: {
          buffer_prizes: {
            item_id: item._id,
            potency: item.lottery,
          },
        },
      },
    );
    if (appended.modifiedCount !== 1) {
      await database.collection<GameItem>("items").deleteOne({ _id: item._id });
      return NextResponse.json(
        { error: "The lottery buffer changed before the item could be sent." },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({
    status: "ok",
    itemId: item._id,
    message:
      parsed.destination.type === "player"
        ? `${context.artwork.title} was sent to ${
            player?.screen_name ?? "the player"
          }.`
        : `${context.artwork.title} was added to the lottery buffer.`,
  });
}

function parseAdminItemRequest(value: unknown): ParsedAdminItemRequest | null {
  if (!isRecord(value) || !isRecord(value.item) || !isRecord(value.destination)) {
    return null;
  }
  const draft = parseAdminItemDraft(value.item);
  const destination = parseDestination(value.destination);
  return draft && destination ? { ...draft, destination } : null;
}

function parseAdminItemDraft(
  value: unknown,
): Omit<ParsedAdminItemRequest, "destination"> | null {
  if (!isRecord(value)) return null;
  const item = value;
  const artworkId = getString(item.artworkId, 1, 100);
  const cardRenderer = getString(item.cardRenderer, 1, 100);
  const source = getString(item.source, 1, 100);
  const cardCosmetic = cardRenderer ? getCardCosmetic(cardRenderer) : undefined;
  const attributes = parseAttributeGroups(item.attributes);
  const tags =
    Array.isArray(item.tags) &&
    item.tags.every(
      (tag) => typeof tag === "string" && tag.trim().length <= 50,
    )
      ? item.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 30)
      : null;
  const condition = getNumber(item.condition, 0, 1);
  const level = getInteger(item.level, 1, 100);
  const rollCount = getInteger(item.rollCount, 0, 1_000_000);
  const rerollSpent = getInteger(item.rerollSpent, 0, 1_000_000_000);
  const lottery = getInteger(item.lottery, 0, RAFFLE_MAX_POTENCY);
  const forgeryQuality = getNumber(item.forgeryQuality, 0, 1);
  const booleanKeys = [
    "mint",
    "foil",
    "unlocked",
    "seasonal",
    "original",
    "patreon",
    "vintage",
    "permanent",
    "debug",
    "misprint",
    "forgery",
    "forgeryIdentified",
  ] as const;
  if (
    !artworkId ||
    !cardCosmetic ||
    !source ||
    !attributes ||
    !tags ||
    condition === null ||
    level === null ||
    rollCount === null ||
    rerollSpent === null ||
    lottery === null ||
    forgeryQuality === null ||
    booleanKeys.some((key) => typeof item[key] !== "boolean")
  ) {
    return null;
  }

  return {
    artworkId,
    customization: {
      condition,
      mint: item.mint as boolean,
      level,
      rollCount,
      rerollSpent,
      foil: item.foil as boolean,
      unlocked: item.unlocked as boolean,
      seasonal: item.seasonal as boolean,
      lottery,
      original: item.original as boolean,
      patreon: item.patreon as boolean,
      vintage: item.vintage as boolean,
      permanent: item.permanent as boolean,
      debug: item.debug as boolean,
      cardRenderer: cardCosmetic.id,
      source,
      tags,
      misprint: item.misprint as boolean,
      forgery: item.forgery as boolean,
      forgeryQuality,
      forgeryIdentified: item.forgeryIdentified as boolean,
      attributes,
    },
  };
}

function parseDestination(value: Record<string, unknown>): AdminItemDestination | null {
  if (value.type === "player") {
    const playerId = getString(value.playerId, 1, 100);
    return playerId ? { type: "player", playerId } : null;
  }
  if (value.type === "lottery_buffer") {
    return { type: "lottery_buffer" };
  }
  return null;
}

function parseAttributeGroups(
  value: unknown,
): AdminItemCustomization["attributes"] | null {
  if (!isRecord(value)) return null;
  const locked = parseAttributeInputs(value.locked);
  const unlocked = parseAttributeInputs(value.unlocked);
  const special = parseAttributeInputs(value.special);
  return locked && unlocked && special ? { locked, unlocked, special } : null;
}

function parseAttributeInputs(value: unknown): AdminItemAttributeInput[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const parsed: AdminItemAttributeInput[] = [];
  for (const input of value) {
    if (!isRecord(input)) return null;
    const attributeId = getString(input.attributeId, 1, 100);
    const attributeValue = getNumber(input.value, 0, 1);
    if (!attributeId || attributeValue === null) return null;
    parsed.push({ attributeId, value: attributeValue });
  }
  return parsed;
}

function getString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimumLength &&
    normalized.length <= maximumLength
    ? normalized
    : null;
}

function getNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function getInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const number = getNumber(value, minimum, maximum);
  return number !== null && Number.isInteger(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getAdminItemContext(database: Db, artworkId: string) {
  const [artwork, attributes, metadata, settings] = await Promise.all([
    database.collection<Artwork>("artworks").findOne({ _id: artworkId }),
    database
      .collection<ItemAttribute>("attributes")
      .find({ active: true })
      .toArray(),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    getGameplaySettings(database),
  ]);
  if (!artwork || !metadata || attributes.length === 0) return null;
  const effect = artwork.effect_id
    ? await database
        .collection<ArtworkEffect>("artwork_effects")
        .findOne({ _id: artwork.effect_id })
    : null;
  return { artwork, attributes, metadata, settings, effect };
}

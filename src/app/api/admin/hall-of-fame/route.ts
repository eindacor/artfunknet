import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { Artwork, GameItem } from "@/server/gameplay";
import {
  getHallOfFameCandidateScanEnabled,
  getHallOfFameQualifier,
  getMatchingHallOfFameQualifiers,
  itemMatchesQualifierQuery,
  notifyHallOfFameInduction,
  setHallOfFameCandidateScanEnabled,
  type HallOfFameRecord,
  type HallOfFameSubmission,
} from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { getAdminSession } from "@/server/session";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchItemId = url.searchParams.get("itemId")?.trim();
  const database = await getDatabase();

  if (searchItemId) {
    const item = await database
      .collection<GameItem>("items")
      .findOne({ _id: searchItemId });
    if (!item) {
      return NextResponse.json(
        { error: "No game item found with that ID." },
        { status: 404 },
      );
    }
    const artwork = await database
      .collection<Artwork>("artworks")
      .findOne({ _id: item.artwork_id });
    const owner = await database
      .collection<{ _id: string; screen_name: string }>("players")
      .findOne({ _id: item.owner });
    const existingHoF = await database
      .collection<HallOfFameRecord>("hall_of_fame")
      .findOne({ item_id: item._id });
    const qualifierMatches = artwork
      ? getMatchingHallOfFameQualifiers(item, artwork.rarity)
      : [];
    const qualifierIds = qualifierMatches.map((qualifier) => qualifier.id);
    const [qualifierRecords, qualifierSubmissions] = await Promise.all([
      database
        .collection<HallOfFameRecord>("hall_of_fame")
        .find({ qualifier_id: { $in: qualifierIds } })
        .project<{ qualifier_id?: string }>({ qualifier_id: 1 })
        .toArray(),
      database
        .collection<HallOfFameSubmission>("hall_of_fame_submissions")
        .find({ qualifier_id: { $in: qualifierIds } })
        .project<{ qualifier_id: string }>({ qualifier_id: 1 })
        .toArray(),
    ]);
    const inductedQualifierIds = new Set(
      qualifierRecords
        .map((record) => record.qualifier_id)
        .filter((qualifierId): qualifierId is string => Boolean(qualifierId)),
    );
    const pendingQualifierIds = new Set(
      qualifierSubmissions.map((submission) => submission.qualifier_id),
    );

    return NextResponse.json({
      item,
      artwork,
      owner_screen_name: owner?.screen_name || item.owner,
      existing_hall_of_fame: existingHoF,
      qualifier_matches: qualifierMatches.map((qualifier) => ({
        ...qualifier,
        status: inductedQualifierIds.has(qualifier.id)
          ? "inducted"
          : pendingQualifierIds.has(qualifier.id)
            ? "pending"
            : "available",
      })),
    });
  }

  const [records, submissions, scanForCandidates] = await Promise.all([
    database
      .collection<HallOfFameRecord>("hall_of_fame")
      .find()
      .sort({ created_at: -1 })
      .toArray(),
    database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .find()
      .sort({ submitted_at: 1 })
      .toArray(),
    getHallOfFameCandidateScanEnabled(database),
  ]);

  return NextResponse.json({
    records,
    submissions,
    scan_for_candidates: scanForCandidates,
  });
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    title?: string;
    description?: string;
    qualifierId?: string;
  } | null;

  const itemId =
    typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const qualifierId =
    typeof body?.qualifierId === "string" ? body.qualifierId.trim() : "";

  if (!itemId || !title || !description) {
    return NextResponse.json(
      { error: "Item ID, Hall of Fame title, and description are required." },
      { status: 400 },
    );
  }
  if (title.length > 120 || description.length > 1_000) {
    return NextResponse.json(
      { error: "Titles are limited to 120 characters and descriptions to 1,000." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const item = await database
    .collection<GameItem>("items")
    .findOne({ _id: itemId });
  if (!item) {
    return NextResponse.json(
      { error: "Item could not be found." },
      { status: 404 },
    );
  }

  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: item.artwork_id });
  if (!artwork) {
    return NextResponse.json(
      { error: "Artwork metadata could not be found." },
      { status: 409 },
    );
  }
  const qualifier = qualifierId
    ? getHallOfFameQualifier(qualifierId)
    : undefined;
  if (
    qualifierId &&
    (!qualifier ||
      !itemMatchesQualifierQuery(item, artwork.rarity, qualifier.query))
  ) {
    return NextResponse.json(
      { error: "This item does not satisfy the selected Hall of Fame qualifier." },
      { status: 400 },
    );
  }
  const owner = await database
    .collection<{ _id: string; screen_name: string }>("players")
    .findOne({ _id: item.owner });
  const existingRecord = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .findOne(
      qualifierId
        ? { qualifier_id: qualifierId }
        : { item_id: item._id, qualifier_id: { $exists: false } },
    );
  if (existingRecord) {
    return NextResponse.json(
      {
        error: qualifierId
          ? "This qualifier is already represented in the Hall of Fame."
          : "This item already has a custom Hall of Fame record.",
      },
      { status: 409 },
    );
  }

  const snapshotArtwork = { ...artwork, ...item.artwork_overrides };
  const record: HallOfFameRecord = {
    _id: qualifierId || randomUUID(),
    item_id: item._id,
    item_snapshot: {
      ...item,
      artwork: snapshotArtwork,
      artwork_title: snapshotArtwork.title,
      artist_name: snapshotArtwork.artist,
    },
    title,
    description,
    created_at: new Date().toISOString(),
    ...(qualifierId ? { qualifier_id: qualifierId } : {}),
    player_id: item.owner,
    player_screen_name: owner?.screen_name || item.owner,
  };

  await database.collection<HallOfFameRecord>("hall_of_fame").insertOne(record);
  if (qualifierId) {
    await database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .deleteMany({ qualifier_id: qualifierId });
  }
  await notifyHallOfFameInduction(database, record).catch((error) => {
    console.error("Unable to notify player about Hall of Fame induction", error);
  });

  return NextResponse.json({ status: "ok", record });
}

export async function PATCH(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    submissionId?: string;
    decision?: "approve" | "deny";
  } | null;
  const submissionId =
    typeof body?.submissionId === "string" ? body.submissionId.trim() : "";
  if (!submissionId || !["approve", "deny"].includes(body?.decision ?? "")) {
    return NextResponse.json(
      { error: "A submission ID and valid decision are required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const submission = await database
    .collection<HallOfFameSubmission>("hall_of_fame_submissions")
    .findOne({ _id: submissionId });
  if (!submission) {
    return NextResponse.json(
      { error: "This Hall of Fame submission is no longer pending." },
      { status: 404 },
    );
  }

  if (body?.decision === "deny") {
    const removed = await database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .deleteOne({ _id: submission._id });
    if (removed.deletedCount !== 1) {
      return NextResponse.json(
        { error: "This Hall of Fame submission changed before it could be denied." },
        { status: 409 },
      );
    }
    return NextResponse.json({ status: "ok" });
  }

  const duplicate = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .findOne({ qualifier_id: submission.qualifier_id });
  if (duplicate) {
    return NextResponse.json(
      { error: "This qualifier is already in the Hall of Fame." },
      { status: 409 },
    );
  }

  const record: HallOfFameRecord = {
    _id: submission.qualifier_id,
    item_id: submission.item_id,
    item_snapshot: submission.item_snapshot,
    title: submission.title,
    description: submission.description,
    created_at: new Date().toISOString(),
    qualifier_id: submission.qualifier_id,
    player_id: submission.player_id,
    player_screen_name: submission.player_screen_name,
  };
  await database.collection<HallOfFameRecord>("hall_of_fame").insertOne(record);
  const removed = await database
    .collection<HallOfFameSubmission>("hall_of_fame_submissions")
    .deleteOne({ _id: submission._id });
  if (removed.deletedCount !== 1) {
    await database
      .collection<HallOfFameRecord>("hall_of_fame")
      .deleteOne({ _id: record._id });
    return NextResponse.json(
      { error: "This Hall of Fame submission changed before it could be approved." },
      { status: 409 },
    );
  }
  await notifyHallOfFameInduction(database, record).catch((error) => {
    console.error("Unable to notify player about Hall of Fame induction", error);
  });

  return NextResponse.json({ status: "ok", record });
}

export async function PUT(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    recordId?: string;
    title?: string;
    description?: string;
    scanForCandidates?: boolean;
  } | null;
  if (typeof body?.scanForCandidates === "boolean") {
    const database = await getDatabase();
    await setHallOfFameCandidateScanEnabled(
      database,
      body.scanForCandidates,
    );
    return NextResponse.json({
      status: "ok",
      scan_for_candidates: body.scanForCandidates,
    });
  }

  const recordId =
    typeof body?.recordId === "string" ? body.recordId.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";

  if (!recordId || !title || !description) {
    return NextResponse.json(
      { error: "Record ID, Hall of Fame title, and description are required." },
      { status: 400 },
    );
  }
  if (title.length > 120 || description.length > 1_000) {
    return NextResponse.json(
      { error: "Titles are limited to 120 characters and descriptions to 1,000." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const updated = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .updateOne(
      { _id: recordId },
      { $set: { title, description } },
    );
  if (updated.matchedCount !== 1) {
    return NextResponse.json(
      { error: "This Hall of Fame record was not found." },
      { status: 404 },
    );
  }

  const record = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .findOne({ _id: recordId });
  return NextResponse.json({ status: "ok", record });
}

export async function DELETE(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recordId = new URL(request.url).searchParams.get("recordId")?.trim();
  if (!recordId) {
    return NextResponse.json(
      { error: "A Hall of Fame record ID is required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const record = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .findOne({ _id: recordId });
  if (!record) {
    return NextResponse.json(
      { error: "This Hall of Fame record was not found." },
      { status: 404 },
    );
  }
  const removed = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .deleteOne({ _id: recordId });
  if (removed.deletedCount !== 1) {
    return NextResponse.json(
      { error: "This Hall of Fame record was not found." },
      { status: 404 },
    );
  }
  if (record.qualifier_id) {
    await database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .deleteMany({ qualifier_id: record.qualifier_id });
  }

  return NextResponse.json({ status: "ok" });
}

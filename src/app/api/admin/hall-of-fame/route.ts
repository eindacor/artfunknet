import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { Artwork, GameItem } from "@/server/gameplay";
import type { HallOfFameRecord } from "@/server/hall-of-fame";
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

    return NextResponse.json({
      item,
      artwork,
      owner_screen_name: owner?.screen_name || item.owner,
      existing_hall_of_fame: existingHoF,
    });
  }

  const records = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find()
    .sort({ created_at: -1 })
    .toArray();

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    itemId?: string;
    title?: string;
    description?: string;
  };

  const itemId = body.itemId?.trim();
  const title = body.title?.trim();
  const description = body.description?.trim();

  if (!itemId || !title || !description) {
    return NextResponse.json(
      { error: "Item ID, Hall of Fame title, and description are required." },
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
  const owner = await database
    .collection<{ _id: string; screen_name: string }>("players")
    .findOne({ _id: item.owner });

  const record: HallOfFameRecord = {
    _id: randomUUID(),
    item_id: item._id,
    item_snapshot: {
      ...item,
      artwork_title: artwork?.title,
      artist_name: artwork?.artist,
    },
    title,
    description,
    created_at: new Date().toISOString(),
    player_id: item.owner,
    player_screen_name: owner?.screen_name || item.owner,
  };

  await database.collection<HallOfFameRecord>("hall_of_fame").insertOne(record);

  return NextResponse.json({ status: "ok", record });
}

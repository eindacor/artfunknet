import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  getPlayerViewSettings,
} from "@/server/player-view-settings";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile?: {
    view_settings?: unknown;
  };
};

export async function PATCH(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The view settings request is invalid." },
      { status: 400 },
    );
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "The view settings request is invalid." },
      { status: 400 },
    );
  }
  const settingKeys = new Set<string>([
    "gallerySort",
    "galleryView",
    "inventorySort",
    "bulkSaleProtections",
  ]);
  if (
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !settingKeys.has(key))
  ) {
    return NextResponse.json(
      { error: "The view settings request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const players = database.collection<Player>("players");
  const player = await players.findOne({
    _id: auth.session.playerId,
    active: true,
  });
  if (!player) {
    return NextResponse.json(
      { error: "The player account is unavailable." },
      { status: 404 },
    );
  }

  const current = getPlayerViewSettings(player.profile?.view_settings);
  const candidate = {
    gallerySort:
      body.gallerySort === undefined
        ? current.gallerySort
        : body.gallerySort,
    galleryView:
      body.galleryView === undefined
        ? current.galleryView
        : body.galleryView,
    inventorySort:
      body.inventorySort === undefined
        ? current.inventorySort
        : body.inventorySort,
    bulkSaleProtections:
      body.bulkSaleProtections === undefined
        ? current.bulkSaleProtections
        : body.bulkSaleProtections,
  };
  const normalized = getPlayerViewSettings(candidate);
  if (JSON.stringify(candidate) !== JSON.stringify(normalized)) {
    return NextResponse.json(
      { error: "One or more view settings are invalid." },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date(),
  };
  if (body.gallerySort !== undefined) {
    updates["profile.view_settings.gallerySort"] = normalized.gallerySort;
  }
  if (body.galleryView !== undefined) {
    updates["profile.view_settings.galleryView"] = normalized.galleryView;
  }
  if (body.inventorySort !== undefined) {
    updates["profile.view_settings.inventorySort"] = normalized.inventorySort;
  }
  if (body.bulkSaleProtections !== undefined) {
    updates["profile.view_settings.bulkSaleProtections"] =
      normalized.bulkSaleProtections;
  }
  await players.updateOne(
    { _id: player._id, active: true },
    { $set: updates },
  );
  return NextResponse.json({ status: "ok", settings: normalized });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

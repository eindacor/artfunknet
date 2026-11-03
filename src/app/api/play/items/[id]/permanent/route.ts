import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getPermanentCollectionPermission } from "@/server/permanent-collection";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    pc_cap?: number;
    permanent_collection_operation?: { token: string; expires_at: string };
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    permanent?: unknown;
  } | null;
  const database = await getDatabase();
  const now = new Date();
  const token = randomUUID();
  const players = database.collection<Player>("players");
  const player = await players.findOneAndUpdate(
    {
      _id: auth.session.playerId,
      active: true,
      $or: [
        { "profile.permanent_collection_operation": { $exists: false } },
        {
          "profile.permanent_collection_operation.expires_at": {
            $lte: now.toISOString(),
          },
        },
      ],
    },
    {
      $set: {
        "profile.permanent_collection_operation": {
          token,
          expires_at: new Date(now.getTime() + 30_000).toISOString(),
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!player) {
    return NextResponse.json(
      { error: "Another permanent collection action is being processed." },
      { status: 409 },
    );
  }
  try {
    const items = database.collection<GameItem>("items");
    const ownedItems = await items
      .find({
        owner: player._id,
        $or: [{ status: { $in: ["claimed", "displayed"] } }, { permanent: true }],
      })
      .toArray();
    const item = ownedItems.find((candidate) => candidate._id === id);
    if (!item) {
      return NextResponse.json(
        { error: "This artwork is not available in your inventory." },
        { status: 409 },
      );
    }
    const permanent =
      typeof body?.permanent === "boolean" ? body.permanent : !item.permanent;
    if (permanent === Boolean(item.permanent)) {
      return NextResponse.json({ status: "ok", permanent });
    }
    const permission = getPermanentCollectionPermission(
      item,
      ownedItems,
      Math.max(0, player.profile.pc_cap ?? 12),
    );
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 409 });
    }
    const changed = await items.updateOne(
      {
        _id: item._id,
        owner: player._id,
        status: item.status,
        permanent: item.permanent ? true : { $ne: true },
      },
      {
        $set: { permanent },
        $pull: { tags: "for sale" },
      },
    );
    if (changed.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "This artwork changed before its permanent collection status could be updated." },
        { status: 409 },
      );
    }
    await players.updateOne(
      { _id: player._id },
      { $set: { "profile.last_activity": now.toISOString() } },
    );
    await refreshGalleryMetadata(database, player._id);
    return NextResponse.json({
      status: "ok",
      permanent,
      message: permanent
        ? `Added to your permanent collection. Visitors can see this artwork.${item.status === "displayed" ? " Featuring remains active." : " Feature it to earn gallery income and activate gallery bonuses."}`
        : `Removed from your permanent collection.${item.status === "displayed" ? " This artwork remains featured." : " This artwork is no longer shared in your gallery."}`,
    });
  } catch (error) {
    console.error("Unable to update permanent collection", error);
    return NextResponse.json(
      { error: "The permanent collection action could not be completed. Refresh the page to check the artwork's current status." },
      { status: 500 },
    );
  } finally {
    await players.updateOne(
      { _id: player._id, "profile.permanent_collection_operation.token": token },
      { $unset: { "profile.permanent_collection_operation": "" } },
    );
  }
}

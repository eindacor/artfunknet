import { NextResponse } from "next/server";

import {
  isHistorianSpecialItem,
  type ArtHistorianFulfilledTarget,
  type ArtHistorianQuest,
} from "@/server/art-historian-gameplay";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import type { GameItem } from "@/server/gameplay";
import { transferIfHallOfFameItem } from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type SendToHistorianRequest = {
  questId?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | SendToHistorianRequest
    | null;
  const questId =
    typeof body?.questId === "string" ? body.questId.trim() : "";
  if (!questId) {
    return NextResponse.json(
      { error: "Choose an Art Historian quest for this item." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["claimed", "displayed"] },
    permanent: { $ne: true },
    original: { $ne: true },
    repairing: { $ne: true },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item must be in your collection before it can be sent." },
      { status: 409 },
    );
  }

  const quest = await database
    .collection<ArtHistorianQuest>("quests")
    .findOne({
      _id: questId,
      owner_id: auth.session.playerId,
      target: item.artwork_id,
      "fulfilled_targets.artwork_id": { $ne: item.artwork_id },
    });
  if (!quest) {
    return NextResponse.json(
      { error: "This item is not an unfulfilled target for that quest." },
      { status: 409 },
    );
  }

  const fulfilledTarget: ArtHistorianFulfilledTarget = {
    artwork_id: item.artwork_id,
    item_id: item._id,
    item_snapshot: item,
    fulfilled_at: new Date().toISOString(),
    special: isHistorianSpecialItem(item),
  };
  const fulfilled = await database
    .collection<ArtHistorianQuest>("quests")
    .updateOne(
      {
        _id: quest._id,
        owner_id: auth.session.playerId,
        target: item.artwork_id,
        "fulfilled_targets.artwork_id": { $ne: item.artwork_id },
      },
      { $push: { fulfilled_targets: fulfilledTarget } },
    );
    if (fulfilled.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "That quest target was fulfilled by another action." },
      { status: 409 },
    );
  }

  try {
    const preserved = await transferIfHallOfFameItem(database, item);
    if (!preserved) {
      const removed = await database.collection<GameItem>("items").deleteOne({
        _id: item._id,
        owner: auth.session.playerId,
        status: item.status,
        permanent: { $ne: true },
        original: { $ne: true },
        repairing: { $ne: true },
      });
      if (removed.deletedCount !== 1) {
        throw new Error("The item changed before the Historian received it.");
      }
      await deleteCommunityReactions(database, "item", [item._id]).catch(
        (error) => {
          console.error(
            `Unable to remove reactions for Historian item ${item._id}`,
            error,
          );
        },
      );
    }
  } catch (error) {
    await database.collection<ArtHistorianQuest>("quests").updateOne(
      { _id: quest._id, owner_id: auth.session.playerId },
      { $pull: { fulfilled_targets: { item_id: item._id } } },
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The item could not be sent to the Historian.",
      },
      { status: 409 },
    );
  }

  if (item.status === "displayed") {
    await refreshGalleryMetadata(database, auth.session.playerId);
  }
  const fulfilledCount = (quest.fulfilled_targets?.length ?? 0) + 1;
  const fullyComplete = fulfilledCount >= quest.target.length;
  return NextResponse.json({
    status: "ok",
    autoClaimQuestId: fullyComplete ? quest._id : null,
    message: fullyComplete
      ? "The final requested artwork was sent to the Art Historian."
      : `Artwork sent to the Art Historian (${fulfilledCount}/${quest.target.length}).`,
  });
}

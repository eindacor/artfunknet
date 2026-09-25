import { NextResponse } from "next/server";

import {
  getFilteredBulkLootCandidates,
  parseBulkSaleProtections,
} from "@/server/bulk-sale";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import type { GameItem } from "@/server/gameplay";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const rawBody = await request.text().catch(() => "");
  const parseResult = parseBulkSaleProtections(rawBody);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: "The decline-all request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  await removeExpiredTransientItems(database);
  const { candidates, items } = await getFilteredBulkLootCandidates(
    database,
    auth.session.playerId,
    parseResult.protections,
    ["for_sale"],
  );
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "There are no dealer offers to decline." },
      { status: 409 },
    );
  }
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No dealer offers match the selected bulk-action options." },
      { status: 409 },
    );
  }

  const itemIds = items.map((item) => item._id);
  const result = await database.collection<GameItem>("items").deleteMany({
    _id: { $in: itemIds },
    owner: auth.session.playerId,
    status: "for_sale",
  });
  const remainingIds =
    result.deletedCount === itemIds.length
      ? new Set<string>()
      : new Set(
          (
            await database
              .collection<GameItem>("items")
              .find({ _id: { $in: itemIds } })
              .project<Pick<GameItem, "_id">>({ _id: 1 })
              .toArray()
          ).map((item) => item._id),
        );
  const deletedIds = itemIds.filter((itemId) => !remainingIds.has(itemId));

  await deleteCommunityReactions(database, "item", deletedIds);

  return NextResponse.json({
    status: "ok",
    declined: result.deletedCount,
    message: `${result.deletedCount} dealer ${
      result.deletedCount === 1 ? "offer" : "offers"
    } declined.`,
  });
}

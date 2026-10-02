import { NextResponse } from "next/server";

import {
  getFilteredBulkLootCandidates,
  parseBulkSaleProtections,
} from "@/server/bulk-sale";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import type { GameItem } from "@/server/gameplay";
import { transferHallOfFameItems } from "@/server/hall-of-fame";
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

  const dealerResult = await getFilteredBulkLootCandidates(
    database,
    auth.session.playerId,
    parseResult.protections,
    ["for_sale"],
  );
  if (dealerResult.candidates.length === 0) {
    return NextResponse.json(
      { error: "There are no dealer offers to decline." },
      { status: 409 },
    );
  }
  if (dealerResult.items.length === 0) {
    return NextResponse.json(
      {
        error: "No dealer offers match the selected bulk-action options.",
      },
      { status: 409 },
    );
  }

  const itemIds = dealerResult.items.map((item) => item._id);
  const preservedIds = await transferHallOfFameItems(
    database,
    dealerResult.items,
  );
  const deletableIds = itemIds.filter((itemId) => !preservedIds.has(itemId));
  const result = await database.collection<GameItem>("items").deleteMany({
    _id: { $in: deletableIds },
    owner: auth.session.playerId,
    status: "for_sale",
  });
  const remainingIds =
    result.deletedCount === deletableIds.length
      ? new Set<string>()
      : new Set(
          (
            await database
              .collection<GameItem>("items")
              .find({ _id: { $in: deletableIds } })
              .project<Pick<GameItem, "_id">>({ _id: 1 })
              .toArray()
          ).map((item) => item._id),
        );
  const deletedIds = deletableIds.filter((itemId) => !remainingIds.has(itemId));

  await deleteCommunityReactions(database, "item", deletedIds);

  const declined = deletedIds.length + preservedIds.size;
  return NextResponse.json({
    status: "ok",
    declined,
    message: `${declined} ${
      declined === 1 ? "offer was" : "offers were"
    } declined.`,
  });
}

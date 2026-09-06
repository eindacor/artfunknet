import { NextResponse } from "next/server";

import type { Auction, AuctionView } from "@/server/auction-gameplay";
import {
  refreshGalleryMetadata,
} from "@/server/gallery-metadata";
import { getCommunityReactionSummary } from "@/server/community-reactions";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";
import { getGalleryNpcs } from "@/server/npc-gameplay";
import { requirePlayerApi } from "@/server/player-api";
import { getPublicGalleryView } from "@/server/public-showcase";
import { prepareItemForPublicViewer } from "@/server/public-showcase-core";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  const database = await getDatabase();
  const gallery = await getPublicGalleryView(
    database,
    playerId,
    auth.session.playerId,
  );
  if (!gallery) {
    return NextResponse.json(
      { error: "This gallery is unavailable." },
      { status: 404 },
    );
  }

  const metadata = await refreshGalleryMetadata(database, playerId);
  const activeAuctions = await database
    .collection<Auction>("auctions")
    .find({
      seller_id: playerId,
      viewer: "public",
      expiration: { $gt: new Date().toISOString() },
      settlement_status: { $ne: "settling" },
    })
    .sort({ expiration: 1 })
    .toArray();
  const auctionItemDocuments = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: activeAuctions.map((auction) => auction.item_id) } })
    .toArray();
  const auctionItems = await hydrateGameItems(
    database,
    auctionItemDocuments.map((item) =>
      prepareItemForPublicViewer(item, auth.session.playerId),
    ),
  );
  const auctionItemById = new Map(
    auctionItems.map((item) => [item._id, item]),
  );
  const auctions = activeAuctions.flatMap<AuctionView>((auction) => {
    const item = auctionItemById.get(auction.item_id);
    return item
      ? [
          {
            ...auction,
            item,
            owned:
              playerId === auth.session.playerId &&
              gallery.items.some(
                (displayedItem) =>
                  displayedItem.artwork_id === item.artwork_id,
              ),
            questTarget: false,
            currentlyWinning:
              auction.current_winner_id === auth.session.playerId,
            privateAuction: false,
          },
        ]
      : [];
  });
  const legendaryIds = [
    ...new Set(
      [...gallery.items, ...auctionItems]
        .map((item) => item.active_unique_attribute)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [npcs, legendaryAttributes, reactions] = await Promise.all([
    getGalleryNpcs(database, playerId),
    getLegendaryAttributes(database, legendaryIds),
    getCommunityReactionSummary(
      database,
      "gallery",
      playerId,
      auth.session.playerId,
    ),
  ]);

  return NextResponse.json({
    owner: gallery.owner,
    items: gallery.items,
    auctions,
    metadata: metadata ? { ...metadata, reactions } : null,
    npcs: npcs.map((npc) => ({
      ...npc,
      alreadyMet: npc.players_met.includes(auth.session.playerId),
    })),
    legendaryAttributes: legendaryAttributes.map((attribute) => ({
      id: attribute._id,
      title: attribute.title,
      description: attribute.description,
      flavorText: attribute.flavor_text,
      code: attribute.code,
      active: attribute.active,
    })),
  });
}

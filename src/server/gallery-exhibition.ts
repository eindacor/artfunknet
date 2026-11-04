import "server-only";

import type { Db } from "mongodb";
import type { Auction, AuctionView } from "@/server/auction-gameplay";
import { getArtworkEffects } from "@/server/artwork-effects";
import { createArtistArtworkPreview } from "@/server/artist-artwork-preview";
import { getCommunityReactionSummary } from "@/server/community-reactions";
import { calculateGalleryRates, type GalleryRates } from "@/server/collection-gameplay";
import { getArtistWorks, getPublicArtistProfile } from "@/server/contributing-artists";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getGameplaySettings } from "@/server/game-settings";
import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getPlayerGalleryFinishes } from "@/server/player-gallery-finishes";
import { getPublicGalleryView } from "@/server/public-showcase";
import { prepareArtworkForPublicViewer, prepareItemForPublicViewer } from "@/server/public-showcase-core";

export async function getGalleryExhibition(database: Db, playerId: string, viewerId: string | null) {
  const gallery = await getPublicGalleryView(database, playerId, viewerId);
  if (!gallery) return null;

  const metadata = await refreshGalleryMetadata(database, playerId);
  const artist = await getPublicArtistProfile(database, playerId);
  const artistWorks = artist ? await getArtistWorks(database, artist.id) : [];
  const displayedArtworkIds = new Set(gallery.items.map(item => item.artwork_id));
  const items = [
    ...artistWorks.filter(work => !displayedArtworkIds.has(work._id)).map(createArtistArtworkPreview),
    ...gallery.items,
  ];
  const activeAuctions = viewerId ? await database.collection<Auction>("auctions").find({
    seller_id: playerId,
    viewer: "public",
    expiration: { $gt: new Date().toISOString() },
    settlement_status: { $ne: "settling" },
  }).sort({ expiration: 1 }).toArray() : [];
  const auctionItems = await hydrateGameItems(database,
    (await database.collection<GameItem>("items").find({
      _id: { $in: activeAuctions.map(auction => auction.item_id) },
    }).toArray()).map(item => prepareItemForPublicViewer(item, viewerId)),
  );
  const publicItem = (item: typeof items[number]) => viewerId === null
    ? { ...item, artwork: prepareArtworkForPublicViewer(item.artwork) }
    : item;
  const auctionItemById = new Map(auctionItems.map(item => [item._id, item]));
  const auctions = activeAuctions.flatMap<AuctionView>(auction => {
    const item = auctionItemById.get(auction.item_id);
    return item ? [{
      ...auction,
      item: publicItem(item),
      owned: playerId === viewerId && gallery.items.some(displayed => displayed.artwork_id === item.artwork_id),
      questTarget: false,
      currentlyWinning: auction.current_winner_id === viewerId,
      privateAuction: false,
    }] : [];
  });
  const effectIds = [...new Set([...items, ...auctionItems]
    .map(item => item.artwork.effect_id).filter((id): id is string => Boolean(id)))];
  const galleryId = metadata?._id ?? playerId;
  let rates: GalleryRates | null = null;
  if (viewerId) {
    const [displayedItems, settings] = await Promise.all([
      database.collection<GameItem>("items").find({ owner: playerId, status: "displayed" }).toArray(),
      getGameplaySettings(database),
    ]);
    rates = await calculateGalleryRates(
      database, gallery.owner.level, await hydrateGameItems(database, displayedItems), new Date(), settings.active,
    );
  }
  const [effects, reactions, finishes] = await Promise.all([
    getArtworkEffects(database, effectIds),
    viewerId ? getCommunityReactionSummary(database, "gallery", playerId, viewerId) : null,
    getPlayerGalleryFinishes(database, playerId, galleryId),
  ]);
  return {
    galleryId, finishes, owner: gallery.owner, items: items.map(publicItem), artist, artistWorks, auctions, rates,
    metadata: viewerId && metadata ? { ...metadata, reactions } : null,
    legendaryAttributes: effects.map(effect => ({
      id: effect._id, title: effect.title, description: effect.description,
      flavorText: effect.flavor_text, code: effect.code, active: effect.active,
    })),
  };
}

export type GalleryExhibitionData = NonNullable<Awaited<ReturnType<typeof getGalleryExhibition>>>;

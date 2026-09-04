import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type GameItem,
  type ItemAttribute,
} from "./gameplay.ts";

export type GalleryAttributeAggregate = {
  id: string;
  title: string;
  icon: string;
  type: string;
  count: number;
  totalRating: number;
};

export type GalleryMetadataSnapshot = {
  value: number;
  score: number;
  display_count: number;
  attributes: GalleryAttributeAggregate[];
  display_rarities: ArtworkRarity[];
  active_unique_attributes: string[];
  featured_item_id: string | null;
  featured_artwork_id: string | null;
  featured_value: number;
};

export function buildGalleryMetadataSnapshot(
  items: readonly GameItem[],
  rarityByArtworkId: ReadonlyMap<string, ArtworkRarity> = new Map(),
): GalleryMetadataSnapshot {
  const attributeMap = new Map<string, GalleryAttributeAggregate>();
  const activeUniqueAttributes = new Set<string>();
  let value = 0;
  let ratingTotal = 0;
  let featuredItem: GameItem | null = null;

  for (const item of items) {
    value += item.values.actual;
    if (
      !featuredItem ||
      item.values.actual > featuredItem.values.actual ||
      (item.values.actual === featuredItem.values.actual &&
        item._id.localeCompare(featuredItem._id) < 0)
    ) {
      featuredItem = item;
    }
    if (item.active_unique_attribute) {
      activeUniqueAttributes.add(item.active_unique_attribute);
    }

    for (const attribute of getItemAttributes(item)) {
      const rating = Number.isFinite(attribute.value)
        ? Math.max(0, attribute.value ?? 0)
        : 0;
      ratingTotal += rating;
      const existing = attributeMap.get(attribute._id);
      if (existing) {
        existing.count += 1;
        existing.totalRating += rating;
      } else {
        attributeMap.set(attribute._id, {
          id: attribute._id,
          title: attribute.title,
          icon: attribute.icon,
          type: attribute.type,
          count: 1,
          totalRating: rating,
        });
      }
    }
  }

  const attributes = [...attributeMap.values()]
    .map((attribute) => ({
      ...attribute,
      totalRating: Number(attribute.totalRating.toFixed(3)),
    }))
    .sort(
      (left, right) =>
        right.totalRating - left.totalRating ||
        right.count - left.count ||
        left.title.localeCompare(right.title),
    );
  const displayRarities = items
    .flatMap((item) => {
      const rarity = rarityByArtworkId.get(item.artwork_id);
      return rarity ? [rarity] : [];
    })
    .sort(
      (left, right) =>
        ARTWORK_RARITIES.indexOf(right) - ARTWORK_RARITIES.indexOf(left),
    );

  return {
    value,
    score: Math.floor(Number(ratingTotal.toFixed(6)) * 100),
    display_count: items.length,
    attributes,
    display_rarities: displayRarities,
    active_unique_attributes: [...activeUniqueAttributes],
    featured_item_id: featuredItem?._id ?? null,
    featured_artwork_id: featuredItem?.artwork_id ?? null,
    featured_value: featuredItem?.values.actual ?? 0,
  };
}

function getItemAttributes(item: GameItem): ItemAttribute[] {
  return [
    ...item.attributes.locked,
    ...item.attributes.unlocked,
    ...item.attributes.special,
  ];
}

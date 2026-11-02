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
  effectiveRating: number;
};

export type GalleryMetadataSnapshot = {
  value: number;
  score: number;
  display_count: number;
  permanent_count: number;
  permanent_item_ids: string[];
  item_count: number;
  display_capacity: number;
  attributes: GalleryAttributeAggregate[];
  display_rarities: ArtworkRarity[];
  active_unique_attributes: string[];
  featured_item_id: string | null;
  featured_artwork_id: string | null;
  featured_value: number;
};

export function buildGalleryMetadataSnapshot(
  items: readonly GameItem[],
  displayCapacity: number,
  rarityByArtworkId: ReadonlyMap<string, ArtworkRarity> = new Map(),
): GalleryMetadataSnapshot {
  const attributeMap = new Map<
    string,
    Omit<GalleryAttributeAggregate, "effectiveRating">
  >();
  const activeUniqueAttributes = new Set<string>();
  let value = 0;
  let ratingTotal = 0;
  const permanentItems = items.filter(
    (item) =>
      item.permanent &&
      (item.status === "claimed" || item.status === "displayed"),
  );
  const displayedItems = items.filter((item) => !item.permanent);
  const featuredItem =
    [...(permanentItems.length > 0 ? permanentItems : displayedItems)].sort(
      (left, right) =>
        right.values.actual - left.values.actual ||
        left._id.localeCompare(right._id),
    )[0] ?? null;

  for (const item of displayedItems) {
    value += item.values.actual;
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
      effectiveRating: Number(
        getEffectiveGalleryAttributeRating(
          attribute.totalRating,
          displayCapacity,
        ).toFixed(3),
      ),
    }))
    .sort(
      (left, right) =>
        right.totalRating - left.totalRating ||
        right.count - left.count ||
        left.title.localeCompare(right.title),
    );
  const displayRarities = displayedItems
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
    display_count: displayedItems.length,
    permanent_count: permanentItems.length,
    permanent_item_ids: permanentItems.map((item) => item._id).sort(),
    item_count: displayedItems.length + permanentItems.length,
    display_capacity: Math.max(0, Math.floor(displayCapacity)),
    attributes,
    display_rarities: displayRarities,
    active_unique_attributes: [...activeUniqueAttributes],
    featured_item_id: featuredItem?._id ?? null,
    featured_artwork_id: featuredItem?.artwork_id ?? null,
    featured_value: featuredItem?.values.actual ?? 0,
  };
}

export function getEffectiveGalleryAttributeRating(
  totalRating: number,
  displayCapacity: number,
): number {
  if (
    !Number.isFinite(totalRating) ||
    !Number.isFinite(displayCapacity) ||
    displayCapacity <= 0
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, totalRating / displayCapacity));
}

function getItemAttributes(item: GameItem): ItemAttribute[] {
  return [
    ...item.attributes.locked,
    ...item.attributes.unlocked,
    ...item.attributes.special,
  ];
}

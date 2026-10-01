import ItemCreator, {
  type AdminArtworkOption,
  type AdminAttributeOption,
} from "./item-creator";

import type { Artwork, ItemAttribute } from "@/server/gameplay";
import type { ArtworkEffect } from "@/server/artwork-effects-core";
import { getDatabase } from "@/server/mongodb";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";

export const dynamic = "force-dynamic";

export default async function AdminItemCreatorPage() {
  const database = await getDatabase();
  const [artworks, attributes, effects] = await Promise.all([
    database
      .collection<Artwork>("artworks")
      .find({})
      .project<Artwork>({ market_data: 0 })
      .sort({ active: -1, artist: 1, title: 1 })
      .toArray(),
    database
      .collection<ItemAttribute>("attributes")
      .find({ active: true })
      .sort({ active: -1, title: 1 })
      .toArray(),
    database.collection<ArtworkEffect>("artwork_effects").find({}).toArray(),
  ]);
  const effectById = new Map(effects.map((effect) => [effect._id, effect]));
  const artworkOptions: AdminArtworkOption[] = artworks.map((artwork) => ({
    ...artwork,
    effectAttributeIds:
      effectById.get(artwork.effect_id ?? "")?.linked_attributes ??
      artwork.special_attributes ??
      [],
  }));
  const attributeOptions: AdminAttributeOption[] = attributes.map(
    (attribute) => ({
      _id: attribute._id,
      title: attribute.title,
      type: attribute.type,
      active: attribute.active,
    }),
  );
  const legendaryAttributes: CardLegendaryAttribute[] = effects.map(
    (effect) => ({
      id: effect._id,
      title: effect.title,
      description: effect.description,
      flavorText: effect.flavor_text,
      code: effect.code,
      active: effect.active,
    }),
  );

  return (
    <main className="admin-tools admin-item-creator-page">
      <h1>Item creator</h1>
      <p>
        Build an exact item from any catalog artwork, then send it directly to
        a player or append it to the lottery reward buffer.
      </p>
      <ItemCreator
        attributes={JSON.parse(JSON.stringify(attributeOptions))}
        artworks={JSON.parse(JSON.stringify(artworkOptions))}
        legendaryAttributes={JSON.parse(JSON.stringify(legendaryAttributes))}
      />
    </main>
  );
}

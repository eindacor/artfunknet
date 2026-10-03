import { getConfiguredCardCosmetics } from "@/components/item-cards/catalog";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import {
  ARTWORK_RARITIES,
  getItemAttributes,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import type { ArtworkEffect } from "@/server/artwork-effects-core";
import { getDatabase } from "@/server/mongodb";
import { getCardRendererSettings } from "@/server/card-renderer-settings";

import ArtStyleCropEditor from "./art-style-crop-editor";
import CardDesignPreview from "./card-design-preview";
export const dynamic = "force-dynamic";

export default async function CardDesignsAdminPage() {
  const database = await getDatabase();
  const rendererSettings = await getCardRendererSettings(database);
  const activeRendererIds = new Set(rendererSettings.activeRendererIds);
  const [rawItems, artworks, attributes, effects, lootMetadata] =
    await Promise.all([
    database
      .collection<GameItem>("items")
      .find({
        status: { $in: ["unclaimed", "for_sale", "claimed", "displayed"] },
      })
      .sort({ date_created: -1 })
      .limit(SHOWCASE_CARD_RENDERER_IDS.length)
      .toArray(),
    database
      .collection<Artwork>("artworks")
      .find({ active: true })
      .project<Artwork>({ market_data: 0 })
      .toArray(),
    database
      .collection<ItemAttribute>("attributes")
      .find({ active: true })
      .toArray(),
    database.collection<ArtworkEffect>("artwork_effects").find({}).toArray(),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    ]);
  if (!lootMetadata) {
    throw new Error("Loot metadata has not been seeded.");
  }
  const items = await hydrateGameItems(database, rawItems);
  const galleryArtworks = ARTWORK_RARITIES.flatMap((rarity) =>
    artworks.filter((artwork) => artwork.rarity === rarity).slice(0, 8),
  );
  const effectById = new Map(effects.map((effect) => [effect._id, effect]));
  const createPreviewItems = (selectedArtworks: Artwork[]) =>
    items.length > 0 && selectedArtworks.length > 0
      ? selectedArtworks.map((artwork, index) => {
          const base = items[index % items.length];
          const previewItem = {
            ...base,
            _id: `preview-${base._id}-${artwork._id}`,
            artwork_id: artwork._id,
            artwork,
            attributes: getItemAttributes(
              artwork,
              false,
              attributes,
              effectById.get(artwork.effect_id ?? ""),
            ),
          };
          delete previewItem.artwork_overrides;
          return previewItem;
        })
      : items;
  const previewItems = createPreviewItems(galleryArtworks);
  const cropItems = createPreviewItems(artworks);
  const unlockedPreviewItems = previewItems.map((item) => ({
    ...item,
    unlocked: true,
    attributes: getItemAttributes(
      item.artwork,
      true,
      attributes,
      effectById.get(item.artwork.effect_id ?? ""),
    ),
  }));
  const cardLegendaryAttributes = effects.map((attribute) => ({
    id: attribute._id,
    title: attribute.title,
    description: attribute.description,
    flavorText: attribute.flavor_text,
    code: attribute.code,
    active: attribute.active,
  }));
  const optionById = new Map(
    getConfiguredCardCosmetics(rendererSettings.rendererNames).map((option) => [
      option.id,
      option,
    ]),
  );
  const defaultStyleName = optionById.get("museum")?.name ?? "Museum Label";
  const rendererOptions = SHOWCASE_CARD_RENDERER_IDS.map((id) => ({
    id,
    name: optionById.get(id)?.name ?? id,
  }));

  return (
    <main className="admin-tools card-design-admin">
      <h1>Card designs</h1>
      <section>
        <h2>Artwork crop adjustments</h2>
        <p>
          Choose an artwork and art style, drag the image into position, adjust
          its zoom, and accept the crop to save it on the artwork record.
        </p>
        {cropItems.length === 0 ? (
          <p>No game items are available for the crop preview.</p>
        ) : (
          <ArtStyleCropEditor
            items={cropItems}
            legendaryAttributes={cardLegendaryAttributes}
            rendererOptions={rendererOptions}
          />
        )}
      </section>
      <section>
        <h2>Renderer gallery</h2>
        <p>
          Each design is a separate renderer registered by ID. An item-level
          renderer overrides a player&apos;s preferred cosmetic renderer, while
          unrecognized or missing IDs fall back to {defaultStyleName}. The
          original renderer retains its stable internal ID.
        </p>
        {previewItems.length === 0 ? (
          <p>No game items are available for the design preview.</p>
        ) : (
          <div className="card-design-grid">
            {SHOWCASE_CARD_RENDERER_IDS.map((rendererId, index) => {
              const item = previewItems[index % previewItems.length];
              const option = optionById.get(rendererId);
              return (
                <CardDesignPreview
                  description={option?.description}
                  initialActive={activeRendererIds.has(rendererId)}
                  item={item}
                  items={previewItems}
                  key={rendererId}
                  legendaryAttributes={cardLegendaryAttributes}
                  lootData={lootMetadata.loot_data}
                  name={option?.name ?? rendererId}
                  number={option?.number}
                  rendererId={rendererId}
                  unlockedItems={unlockedPreviewItems}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

import {
  CARD_RENDERER_OPTIONS,
} from "@/components/item-cards/registry";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import {
  ARTWORK_RARITIES,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getCardRendererSettings } from "@/server/card-renderer-settings";

import CardDesignPreview from "./card-design-preview";
export const dynamic = "force-dynamic";

export default async function CardDesignsAdminPage() {
  const database = await getDatabase();
  const rendererSettings = await getCardRendererSettings(database);
  const activeRendererIds = new Set(rendererSettings.activeRendererIds);
  const [rawItems, artworks, attributes, lootMetadata] = await Promise.all([
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
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!lootMetadata) {
    throw new Error("Loot metadata has not been seeded.");
  }
  const items = await hydrateGameItems(database, rawItems);
  const previewArtworks = ARTWORK_RARITIES.flatMap((rarity) =>
    artworks.filter((artwork) => artwork.rarity === rarity).slice(0, 8),
  );
  const previewItems =
    items.length > 0 && previewArtworks.length > 0
      ? previewArtworks.map((artwork, index) => {
          const base = items[index % items.length];
          const previewItem = {
            ...base,
            _id: `preview-${base._id}-${artwork._id}`,
            artwork_id: artwork._id,
            artwork,
            active_unique_attribute: artwork.unique_attributes?.[0],
            attributes: getPreviewAttributes(artwork, attributes),
          };
          delete previewItem.artwork_overrides;
          return previewItem;
        })
      : items;
  const legendaryAttributeIds = [
    ...new Set(
      previewItems.flatMap((item) => item.artwork.unique_attributes ?? []),
    ),
  ];
  const legendaryAttributes = await getLegendaryAttributes(
    database,
    legendaryAttributeIds,
  );
  const cardLegendaryAttributes = legendaryAttributes.map((attribute) => ({
    id: attribute._id,
    title: attribute.title,
    description: attribute.description,
    flavorText: attribute.flavor_text,
    code: attribute.code,
    active: attribute.active,
  }));
  const optionById = new Map(
    CARD_RENDERER_OPTIONS.map((option) => [option.id, option]),
  );

  return (
    <main className="admin-tools card-design-admin">
      <h1>Card designs</h1>
      <section>
        <h2>Renderer gallery</h2>
        <p>
          Each design is a separate renderer registered by ID. An item-level
          renderer overrides a player&apos;s preferred cosmetic renderer, while
          unrecognized or missing IDs fall back to Museum Label. OG retains
          the original card design under its stable internal ID.
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
                  initialPrice={rendererSettings.rendererPrices[rendererId]}
                  item={item}
                  items={previewItems}
                  key={rendererId}
                  legendaryAttributes={cardLegendaryAttributes}
                  lootData={lootMetadata.loot_data}
                  name={option?.name ?? rendererId}
                  number={option?.number}
                  rendererId={rendererId}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function getPreviewAttributes(
  artwork: Artwork,
  attributes: ItemAttribute[],
): GameItem["attributes"] {
  const specialIds = new Set(artwork.special_attributes ?? []);
  const special = (artwork.special_attributes ?? [])
    .map((id) => attributes.find((attribute) => attribute._id === id))
    .filter((attribute): attribute is ItemAttribute => Boolean(attribute))
    .map((attribute) => ({ ...attribute, value: 0.9 }));
  const standard = attributes.filter(
    (attribute) => !specialIds.has(attribute._id),
  );

  if (artwork.rarity === "common") {
    return {
      locked: [],
      unlocked: standard.slice(0, 1).map((attribute) => ({
        ...attribute,
        value: 0.65,
      })),
      special,
    };
  }

  return {
    locked: standard.slice(0, 1).map((attribute) => ({
      ...attribute,
      value: 0.75,
    })),
    unlocked: standard.slice(1, 2).map((attribute) => ({
      ...attribute,
      value: 0.65,
    })),
    special,
  };
}

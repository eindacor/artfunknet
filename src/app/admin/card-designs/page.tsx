import ItemCard from "@/components/item-cards/item-card";
import {
  CARD_RENDERER_OPTIONS,
} from "@/components/item-cards/registry";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getCardRendererSettings } from "@/server/card-renderer-settings";

import CardRendererActivation from "./card-renderer-activation";
export const dynamic = "force-dynamic";

export default async function CardDesignsAdminPage() {
  const database = await getDatabase();
  const rendererSettings = await getCardRendererSettings(database);
  const activeRendererIds = new Set(rendererSettings.activeRendererIds);
  const rawItems = await database
    .collection<GameItem>("items")
    .find({
      status: { $in: ["unclaimed", "for_sale", "claimed", "displayed"] },
    })
    .sort({ date_created: -1 })
    .limit(SHOWCASE_CARD_RENDERER_IDS.length)
    .toArray();
  const items = await hydrateGameItems(database, rawItems);
  const legendaryAttributeIds = [
    ...new Set(
      items.flatMap((item) => item.artwork.unique_attributes ?? []),
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
        {items.length === 0 ? (
          <p>No game items are available for the design preview.</p>
        ) : (
          <div className="card-design-grid">
            {SHOWCASE_CARD_RENDERER_IDS.map((rendererId, index) => {
              const item = items[index % items.length];
              const option = optionById.get(rendererId);
              return (
                <article className="card-design-preview" key={rendererId}>
                  <header>
                    <span>
                      Style #
                      {option?.number.toString().padStart(2, "0")} ·{" "}
                      {rendererId}
                    </span>
                    <h3>{option?.name ?? rendererId}</h3>
                    <p>{option?.description}</p>
                    <CardRendererActivation
                      initialActive={activeRendererIds.has(rendererId)}
                      rendererId={rendererId}
                    />
                  </header>
                  <div className="card-design-stage">
                    <ItemCard
                      alreadyOwned={false}
                      forceRendererId={rendererId}
                      item={item}
                      legendaryAttributes={cardLegendaryAttributes}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

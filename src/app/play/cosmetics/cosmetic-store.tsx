import ItemCard from "@/components/item-cards/item-card";
import {
  type CardStyleInventory,
  getActiveCardCosmetics,
  getCardStyleInventory,
} from "@/components/item-cards/catalog";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function CosmeticStore({
  activeRendererIds,
  initialStyleInventory,
  sampleItem,
  legendaryAttributes,
  viewerId,
}: {
  activeRendererIds: string[];
  initialStyleInventory: CardStyleInventory;
  sampleItem: HydratedGameItem | null;
  legendaryAttributes: CardLegendaryAttribute[];
  viewerId: string;
}) {
  const styleInventory = getCardStyleInventory(initialStyleInventory);

  return (
    <main className="cosmetic-store">
      <header className="cosmetic-store-heading">
        <div>
          <p>Artfunkel cosmetics</p>
          <h1>Art style collection</h1>
          <span>
            Find styles on generated artwork. Donating that artwork recovers
            its style as a reusable consumable.
          </span>
        </div>
      </header>
      <div className="cosmetic-store-grid">
        {getActiveCardCosmetics(activeRendererIds).map(
          (cosmetic) => {
            const quantity = styleInventory[cosmetic.id] ?? 0;
            return (
              <article className="cosmetic-store-product" key={cosmetic.id}>
              <header>
                <span>
                  STYLE #{cosmetic.number.toString().padStart(2, "0")}
                </span>
                <h2>{cosmetic.name}</h2>
                <p>{cosmetic.description}</p>
              </header>
              <div className="cosmetic-store-preview">
                {sampleItem ? (
                  <ItemCard
                    forceRendererId={cosmetic.id}
                    item={sampleItem}
                    legendaryAttributes={legendaryAttributes}
                    viewerId={viewerId}
                  />
                ) : (
                  <p>No artwork is available for this preview.</p>
                )}
              </div>
              <footer>
                <div className="cosmetic-store-stock">
                  <strong>
                    {quantity > 0 ? `${quantity} reusable` : "Not recovered"}
                  </strong>
                  <span>
                    {quantity > 0
                      ? "Available in your style inventory"
                      : "Find this style on generated artwork"}
                  </span>
                </div>
                <span className="cosmetic-owned">
                  <i
                    aria-hidden="true"
                    className={`fa ${quantity > 0 ? "fa-check" : "fa-search"}`}
                  />{" "}
                  {quantity > 0 ? "discovered" : "undiscovered"}
                </span>
              </footer>
              </article>
            );
          },
        )}
      </div>
    </main>
  );
}

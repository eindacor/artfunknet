import ItemCard from "@/components/item-cards/item-card";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { ArtworkEffect } from "@/server/artwork-effects-core";
import type { GameItem } from "@/server/gameplay";
import { HALL_OF_FAME_OWNER_ID } from "@/server/hall-of-fame";
import { hydrateGameItems } from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function ArtfunkelInventoryPage() {
  const database = await getDatabase();
  const [items, effects] = await Promise.all([
    database
      .collection<GameItem>("items")
      .find({ owner: HALL_OF_FAME_OWNER_ID })
      .sort({ date_received: -1, date_created: -1, _id: 1 })
      .toArray(),
    database.collection<ArtworkEffect>("artwork_effects").find({}).toArray(),
  ]);
  const hydratedItems = await hydrateGameItems(database, items);
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
    <main className="admin-tools admin-artfunkel-inventory-page">
      <h1>Artfunkel Inc. inventory</h1>
      <p>
        Original and Hall of Fame items that leave player circulation are
        preserved here. {hydratedItems.length.toLocaleString()}{" "}
        {hydratedItems.length === 1 ? "item" : "items"} currently belong to
        Artfunkel Inc.
      </p>
      {hydratedItems.length > 0 ? (
        <div className="admin-artfunkel-inventory-grid">
          {hydratedItems.map((item) => (
            <ItemCard
              item={item}
              key={item._id}
              legendaryAttributes={legendaryAttributes}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
            />
          ))}
        </div>
      ) : (
        <p className="admin-artfunkel-inventory-empty">
          No items have been transferred to Artfunkel Inc.
        </p>
      )}
    </main>
  );
}

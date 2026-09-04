"use client";

import ItemCard from "@/components/item-cards/item-card";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";

import PlayerHeader from "../../play/player-header";

export default function AnonymousItemView({
  item,
  legendaryAttributes,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
}) {
  return (
    <div className="game-shell" data-player-state="null">
      <PlayerHeader anonymous />
      <main className="legacy-game null-player-game">
        <div className="legacy-container null-player-container">
          <div className="null-player-item-stage">
            <ItemCard
              interactive
              item={item}
              legendaryAttributes={legendaryAttributes}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

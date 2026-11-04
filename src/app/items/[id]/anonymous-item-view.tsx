"use client";

import ItemCard from "@/components/item-cards/item-card";
import type { CardLegendaryAttribute, ItemOwner } from "@/components/item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";

import PlayerHeader from "../../play/player-header";

export default function AnonymousItemView({
  item,
  legendaryAttributes,
  owner,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  owner: ItemOwner | null;
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
              owner={owner ?? undefined}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
              viewerId={null}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

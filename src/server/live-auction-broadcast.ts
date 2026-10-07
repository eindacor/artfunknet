import type { Db } from "mongodb";

import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import { getArtworkEffects } from "@/server/artwork-effects";
import {
  getLiveAuctionPublicView,
  type LiveAuctionPublicView,
} from "@/server/live-auction-event";

export type LiveAuctionBroadcastView = LiveAuctionPublicView & {
  legendaryAttributes: CardLegendaryAttribute[];
};

export async function getLiveAuctionBroadcastView(
  database: Db,
): Promise<LiveAuctionBroadcastView> {
  const view = await getLiveAuctionPublicView(database);
  const effectId = view.currentItem?.artwork.effect_id;
  const effects = effectId
    ? await getArtworkEffects(database, [effectId])
    : [];

  return {
    ...view,
    legendaryAttributes: effects.map((effect) => ({
      id: effect._id,
      title: effect.title,
      description: effect.description,
      flavorText: effect.flavor_text,
      code: effect.code,
      active: effect.active,
    })),
  };
}

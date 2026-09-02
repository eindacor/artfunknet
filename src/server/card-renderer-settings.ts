import type { Db } from "mongodb";

import {
  CARD_RENDERER_IDS,
  type CardRendererId,
} from "../components/item-cards/types.ts";
import { CARD_COSMETICS } from "../components/item-cards/catalog.ts";

type CardRendererSettingsDocument = {
  _id: string;
  inactive_renderer_ids?: string[];
  renderer_prices?: Partial<Record<CardRendererId, number>>;
};

export type CardRendererSettings = {
  activeRendererIds: CardRendererId[];
  rendererPrices: Record<CardRendererId, number>;
};

export async function getCardRendererSettings(
  database: Db,
): Promise<CardRendererSettings> {
  const document = await database
    .collection<CardRendererSettingsDocument>("metadata")
    .findOne({ _id: "card-renderer-settings" });
  const inactive = new Set(document?.inactive_renderer_ids ?? []);
  const rendererPrices = Object.fromEntries(
    CARD_COSMETICS.map((cosmetic) => [
      cosmetic.id,
      document?.renderer_prices?.[cosmetic.id] ?? cosmetic.price,
    ]),
  ) as Record<CardRendererId, number>;

  return {
    activeRendererIds: CARD_RENDERER_IDS.filter((id) => !inactive.has(id)),
    rendererPrices,
  };
}

export function isCardRendererActive(
  rendererId: CardRendererId,
  activeRendererIds: readonly string[],
): boolean {
  return activeRendererIds.includes(rendererId);
}

export function getCardRendererPrice(
  rendererId: CardRendererId,
  rendererPrices: Partial<Record<CardRendererId, number>>,
): number {
  return (
    rendererPrices[rendererId] ??
    CARD_COSMETICS.find((cosmetic) => cosmetic.id === rendererId)?.price ??
    0
  );
}

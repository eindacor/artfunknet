import type { Db } from "mongodb";

import {
  getConfiguredCardCosmetics,
  type CardCosmetic,
  type CardRendererNames,
} from "../components/item-cards/catalog.ts";
import {
  CARD_RENDERER_IDS,
  type CardRendererId,
} from "../components/item-cards/types.ts";

type CardRendererSettingsDocument = {
  _id: string;
  inactive_renderer_ids?: string[];
  renderer_names?: Record<string, string>;
};

export type CardRendererSettings = {
  activeRendererIds: CardRendererId[];
  rendererNames: CardRendererNames;
};

export async function getCardRendererSettings(
  database: Db,
): Promise<CardRendererSettings> {
  const document = await database
    .collection<CardRendererSettingsDocument>("metadata")
    .findOne({ _id: "card-renderer-settings" });
  const inactive = new Set(document?.inactive_renderer_ids ?? []);
  const rendererNames = Object.fromEntries(
    CARD_RENDERER_IDS.flatMap((id) => {
      const name = document?.renderer_names?.[id]?.trim();
      return name ? [[id, name]] : [];
    }),
  ) as CardRendererNames;

  return {
    activeRendererIds: CARD_RENDERER_IDS.filter((id) => !inactive.has(id)),
    rendererNames,
  };
}

export async function getCardRendererCatalog(
  database: Db,
): Promise<CardCosmetic[]> {
  const settings = await getCardRendererSettings(database);
  return getConfiguredCardCosmetics(settings.rendererNames);
}

export function isCardRendererActive(
  rendererId: CardRendererId,
  activeRendererIds: readonly string[],
): boolean {
  return activeRendererIds.includes(rendererId);
}

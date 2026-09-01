import type { Db } from "mongodb";

import {
  CARD_RENDERER_IDS,
  type CardRendererId,
} from "../components/item-cards/types.ts";

type CardRendererSettingsDocument = {
  _id: string;
  inactive_renderer_ids?: string[];
};

export type CardRendererSettings = {
  activeRendererIds: CardRendererId[];
};

export async function getCardRendererSettings(
  database: Db,
): Promise<CardRendererSettings> {
  const document = await database
    .collection<CardRendererSettingsDocument>("metadata")
    .findOne({ _id: "card-renderer-settings" });
  const inactive = new Set(document?.inactive_renderer_ids ?? []);

  return {
    activeRendererIds: CARD_RENDERER_IDS.filter((id) => !inactive.has(id)),
  };
}

export function isCardRendererActive(
  rendererId: CardRendererId,
  activeRendererIds: readonly string[],
): boolean {
  return activeRendererIds.includes(rendererId);
}

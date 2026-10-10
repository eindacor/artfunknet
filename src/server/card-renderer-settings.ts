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
  active_renderer_ids?: string[];
  inactive_renderer_ids?: string[];
  supporter_renderer_ids?: string[];
  renderer_names?: Record<string, string>;
  created_at?: Date;
  updated_at?: Date;
};

export type CardRendererSettings = {
  activeRendererIds: CardRendererId[];
  supporterRendererIds: CardRendererId[];
  rendererNames: CardRendererNames;
};

export async function getCardRendererSettings(
  database: Db,
): Promise<CardRendererSettings> {
  const collection =
    database.collection<CardRendererSettingsDocument>("metadata");
  let document = await collection
    .findOne({ _id: "card-renderer-settings" });
  if (!document?.active_renderer_ids) {
    const inactive = new Set(document?.inactive_renderer_ids ?? []);
    const activeRendererIds = CARD_RENDERER_IDS.filter(
      (id) => !inactive.has(id),
    );
    const now = new Date();
    await collection.updateOne(
      { _id: "card-renderer-settings" },
      {
        $set: {
          active_renderer_ids: activeRendererIds,
          supporter_renderer_ids: document?.supporter_renderer_ids ?? [],
          updated_at: now,
        },
        $unset: { inactive_renderer_ids: "" },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
    document = {
      ...document,
      _id: "card-renderer-settings",
      active_renderer_ids: activeRendererIds,
      inactive_renderer_ids: undefined,
      supporter_renderer_ids: document?.supporter_renderer_ids ?? [],
    };
  }
  const active = new Set(document.active_renderer_ids);
  const supporter = new Set(document.supporter_renderer_ids ?? []);
  const rendererNames = Object.fromEntries(
    CARD_RENDERER_IDS.flatMap((id) => {
      const name = document?.renderer_names?.[id]?.trim();
      return name ? [[id, name]] : [];
    }),
  ) as CardRendererNames;

  return {
    activeRendererIds: CARD_RENDERER_IDS.filter((id) => active.has(id)),
    supporterRendererIds: CARD_RENDERER_IDS.filter((id) =>
      supporter.has(id),
    ),
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

export function getSupporterAdjustedCardStyleWeights(
  rendererWeights: Readonly<Record<string, number>> | undefined,
  supporterRendererIds: readonly string[],
  supporter: boolean,
): Readonly<Record<string, number>> | undefined {
  if (supporter || supporterRendererIds.length === 0) {
    return rendererWeights;
  }
  const adjustedWeights = { ...rendererWeights };
  for (const rendererId of supporterRendererIds) {
    adjustedWeights[rendererId] = 0;
  }
  return adjustedWeights;
}

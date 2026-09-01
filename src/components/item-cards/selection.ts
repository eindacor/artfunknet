import {
  CARD_RENDERER_IDS,
  type CardRendererId,
} from "./types.ts";

export function isCardRendererId(
  value: string | undefined,
): value is CardRendererId {
  return Boolean(
    value && CARD_RENDERER_IDS.includes(value as CardRendererId),
  );
}

export function resolveCardRendererId({
  forcedRendererId,
  itemRendererId,
  preferredRendererId,
}: {
  forcedRendererId?: string;
  itemRendererId?: string;
  preferredRendererId?: string;
}): CardRendererId {
  if (isCardRendererId(forcedRendererId)) return forcedRendererId;
  if (isCardRendererId(itemRendererId)) return itemRendererId;
  if (isCardRendererId(preferredRendererId)) return preferredRendererId;
  return "legacy";
}

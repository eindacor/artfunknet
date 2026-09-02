import type { HydratedGameItem } from "@/server/item-artwork";
import type { CardStyleInventory } from "./catalog";

export const CARD_RENDERER_IDS = [
  "legacy",
  "museum",
  "arcade",
  "postcard",
  "gilded",
  "terminal",
  "prismatic",
  "blueprint",
  "zine",
  "celestial",
  "reliquary",
] as const;

export const SHOWCASE_CARD_RENDERER_IDS = CARD_RENDERER_IDS;

export type CardRendererId = (typeof CARD_RENDERER_IDS)[number];

export type CardLegendaryAttribute = {
  id: string;
  title: string;
  description: string;
  flavorText: string;
  code: string;
  active: boolean;
};

export type ItemCardRendererProps = {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  alreadyOwned: boolean;
  consigned?: boolean;
  researchTarget?: boolean;
};

export type ItemCardProps = Omit<ItemCardRendererProps, "alreadyOwned"> & {
  actions?: React.ReactNode;
  alreadyOwned?: boolean;
  forceRendererId?: string;
  interactive?: boolean;
  permissions?: ItemDialogPermissions;
  rendererId?: string;
  styleInventory?: CardStyleInventory;
};

export type ItemDialogPermissions = {
  canManageItem: boolean;
  canCustomizeCosmetic: boolean;
};

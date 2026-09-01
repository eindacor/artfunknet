import ArcadeCard from "./arcade-card";
import BlueprintCard from "./blueprint-card";
import { CARD_COSMETICS } from "./catalog";
import CelestialCard from "./celestial-card";
import GildedCard from "./gilded-card";
import MuseumCard from "./museum-card";
import OgCard from "./og-card";
import PostcardCard from "./postcard-card";
import PrismaticCard from "./prismatic-card";
import ReliquaryCard from "./reliquary-card";
import TerminalCard from "./terminal-card";
import ZineCard from "./zine-card";
import {
  type CardRendererId,
  type ItemCardRendererProps,
} from "./types";

export const CARD_RENDERERS: Record<
  CardRendererId,
  React.ComponentType<ItemCardRendererProps>
> = {
  legacy: OgCard,
  museum: MuseumCard,
  arcade: ArcadeCard,
  postcard: PostcardCard,
  gilded: GildedCard,
  terminal: TerminalCard,
  prismatic: PrismaticCard,
  blueprint: BlueprintCard,
  zine: ZineCard,
  celestial: CelestialCard,
  reliquary: ReliquaryCard,
};

export const CARD_RENDERER_OPTIONS = CARD_COSMETICS;

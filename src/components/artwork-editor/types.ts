import type { Artwork } from "@/server/gameplay";

export type ArtistCatalogEntry = {
  id: string;
  name: string;
  dateOfBirth: string;
  dateOfDeath: string;
  artworkCount: number;
};

export type ArtworkCatalogEntry = Pick<Artwork,
  "art_style_adjustments" | "detail_image_adjustments" | "thumbnail_adjustment"
> & {
  _id: string;
  artist_id: string;
  artist: string;
  title: string;
  date: number;
  genre: string;
  medium: string;
  rarity: Artwork["rarity"];
  value_scale: number;
  effect_id?: string;
  special_attributes?: string[];
  height: number;
  width: number;
  image_width?: number;
  image_height?: number;
  active: boolean;
  nsfw?: boolean;
  image?: {
    version?: number;
    storage?: {
      provider: "mock-s3" | "s3";
      bucket?: string;
      key: string;
    };
    variants?: {
      full?: {
        storage: {
          provider: "mock-s3" | "s3";
          bucket?: string;
          key: string;
        };
      };
    };
  };
  hasImage?: boolean;
};

export type ArtworkEditorMetadata = Pick<Artwork,
  "artist_id" | "title" | "date" | "genre" | "medium" | "rarity" | "height" |
  "active" | "art_style_adjustments" | "detail_image_adjustments" | "thumbnail_adjustment"
> & { nsfw: boolean; value_scale?: number; effect_id?: string; special_attributes?: string[] };

export const ARTWORK_EDITOR_RARITIES: Artwork["rarity"][] = [
  "common", "uncommon", "rare", "legendary", "masterpiece",
];

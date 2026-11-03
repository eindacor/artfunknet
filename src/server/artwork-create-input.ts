import {
  ARTWORK_DETAIL_IMAGE_COUNT,
  isValidArtworkDetailImageAdjustment,
  isValidArtworkImageAdjustment,
  roundArtworkDetailImageAdjustments,
  roundArtworkImageAdjustment,
} from "../components/item-cards/artwork-image-adjustments.ts";
import { isCardRendererId } from "../components/item-cards/selection.ts";
import { ARTWORK_RARITIES, type Artwork, type ArtworkRarity } from "./gameplay.ts";

export type ArtworkCreationMetadata = Pick<
  Artwork,
  "artist_id" | "title" | "date" | "genre" | "medium" | "rarity" | "height" |
  "active" | "art_style_adjustments" | "detail_image_adjustments" | "thumbnail_adjustment" | "feature_card_adjustment"
> & { nsfw: boolean };

export function validateArtworkInput(input: unknown):
  | { ok: true; value: ArtworkCreationMetadata }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "The artwork metadata is invalid." };
  }
  const data = input as Record<string, unknown>;
  const artistId = typeof data.artist_id === "string" ? data.artist_id.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const genre = typeof data.genre === "string" ? data.genre.trim() : "";
  const medium = typeof data.medium === "string" ? data.medium.trim() : "";
  const date = Number(data.date);
  const height = Number(data.height);
  const rarity = data.rarity as ArtworkRarity;
  if (!artistId || !title || !genre || !medium) {
    return { ok: false, error: "Complete all required artwork fields." };
  }
  if (!Number.isFinite(date) || !Number.isFinite(height) || height <= 0 ||
    !ARTWORK_RARITIES.includes(rarity)) {
    return { ok: false, error: "Provide valid artwork dimensions, date, and rarity." };
  }
  const adjustments = validateArtworkImageAdjustments(data);
  if (!adjustments.ok) return adjustments;
  return {
    ok: true,
    value: {
      artist_id: artistId, title, date, genre, medium, rarity, height,
      active: data.active !== false,
      nsfw: data.nsfw === true,
      ...adjustments.value,
    },
  };
}

export function validateArtworkImageAdjustments(data: Record<string, unknown>):
  | { ok: true; value: Pick<Artwork, "art_style_adjustments" | "detail_image_adjustments" | "thumbnail_adjustment" | "feature_card_adjustment"> }
  | { ok: false; error: string } {
  const styles = data.art_style_adjustments ?? {};
  if (!styles || typeof styles !== "object" || Array.isArray(styles) ||
    !Object.entries(styles).every(([id, adjustment]) =>
      isCardRendererId(id) && isValidArtworkImageAdjustment(adjustment))) {
    return { ok: false, error: "The art style image adjustments are invalid." };
  }
  const details = data.detail_image_adjustments ?? [];
  if (!Array.isArray(details) || details.length > ARTWORK_DETAIL_IMAGE_COUNT ||
    !details.every(isValidArtworkDetailImageAdjustment) ||
    new Set(details.map(adjustment => adjustment.slot)).size !== details.length) {
    return { ok: false, error: "Provide up to four unique artwork detail adjustments." };
  }
  const thumbnail = data.thumbnail_adjustment ?? { x: 0, y: 0, scale: 1 };
  if (!isValidArtworkImageAdjustment(thumbnail)) {
    return { ok: false, error: "The thumbnail image adjustment is invalid." };
  }
  const featureCard = data.feature_card_adjustment ?? thumbnail;
  if (!isValidArtworkImageAdjustment(featureCard)) {
    return { ok: false, error: "The feature card image adjustment is invalid." };
  }
  return {
    ok: true,
    value: {
      art_style_adjustments: Object.fromEntries(Object.entries(styles).map(
        ([id, adjustment]) => [id, roundArtworkImageAdjustment(
          adjustment as NonNullable<Artwork["thumbnail_adjustment"]>,
        )],
      )),
      detail_image_adjustments: roundArtworkDetailImageAdjustments(details),
      thumbnail_adjustment: roundArtworkImageAdjustment(thumbnail),
      feature_card_adjustment: roundArtworkImageAdjustment(featureCard),
    },
  };
}

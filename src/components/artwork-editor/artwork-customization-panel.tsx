"use client";

import { useState } from "react";
import ArtworkDetailImage from "@/components/artwork-detail-image";
import ArtworkThumbnail from "@/components/artwork-thumbnail";
import {
  getArtworkDetailImageSlots,
  getArtworkFeatureCardAdjustment,
  getArtworkImageAdjustment,
  getArtworkThumbnailAdjustment,
} from "@/components/item-cards/artwork-image-adjustments";
import { CARD_RENDERERS } from "@/components/item-cards/registry";
import RenderCardPreview from "@/components/item-cards/render-card-preview";
import { ArtworkImageSourceContext } from "@/components/item-cards/shared";
import type { CardRendererId } from "@/components/item-cards/types";
import type { Artwork, ArtworkArtStyleAdjustment, ArtworkDetailImageAdjustments } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";
import ArtworkCropControl from "./artwork-crop-control";

export default function ArtworkCustomizationPanel({
  artwork, sourceUrl, rendererOptions, disabled,
  onStyleChange, onDetailChange, onThumbnailChange, onFeatureCardChange,
}: {
  artwork: Artwork;
  sourceUrl: string;
  rendererOptions: { id: CardRendererId; name: string }[];
  disabled: boolean;
  onStyleChange: (id: CardRendererId, adjustment: ArtworkArtStyleAdjustment) => void;
  onDetailChange: (adjustments: ArtworkDetailImageAdjustments) => void;
  onThumbnailChange: (adjustment: ArtworkArtStyleAdjustment) => void;
  onFeatureCardChange: (adjustment: ArtworkArtStyleAdjustment) => void;
}) {
  const [rendererId, setRendererId] = useState<CardRendererId>("museum");
  const Renderer = CARD_RENDERERS[rendererId];
  const [slots, setSlots] = useState(() => getArtworkDetailImageSlots(artwork.detail_image_adjustments ?? []));
  const thumbnail = getArtworkThumbnailAdjustment(artwork);
  const featureCard = getArtworkFeatureCardAdjustment(artwork);
  const item: HydratedGameItem = {
    _id: "draft", artwork_id: artwork._id, artwork, card_renderer: rendererId,
    condition: 1, mint: false, mint_value_multiplier: 1,
    attributes: { locked: [], unlocked: [], special: [] },
    owner: "preview", transaction_history: [], status: "claimed", revealed: true,
    source: "preview", date_created: "2026-01-01", date_received: "2026-01-01",
    level: 0, roll_count: 0, reroll_spent: 0, foil: false, unlocked: false,
    seasonal: false, lottery: 0, original: false, patreon: false, vintage: false,
    authenticity: { forgery: false, forgery_quality: 0, liable: "", liability_pending: false,
      identified: false, fee: 0, original_owner: "" },
    tags: [], misprint: false, permanent: true, repairing: false, debug: false,
    odds: "", values: { sell: 0, purchase: 0, actual: 0, auction_min: 0, collector: 0, dealer: 0 },
    reroll_cost: 0,
  };
  function updateDetail(index: number, adjustment: ArtworkArtStyleAdjustment, enabled = slots[index].enabled) {
    const next = slots.map((slot, slotIndex) => slotIndex === index ? { adjustment, enabled } : slot);
    setSlots(next);
    onDetailChange(next.flatMap((slot, slotIndex) =>
      slot.enabled ? [{ slot: slotIndex, ...slot.adjustment }] : [],
    ));
  }
  return (
    <details className="min-w-0 rounded-lg border border-white/10 bg-white/5">
      <summary className="cursor-pointer px-4 py-3 font-semibold">Art style customization</summary>
      <div className="grid min-w-0 gap-6 border-t border-white/10 p-4">
        <label className="grid gap-2">
          Art style
          <select aria-label="Art style" className="rounded-md border border-white/20 bg-[#19171d] px-3 py-2"
            value={rendererId} disabled={disabled} onChange={event => setRendererId(event.target.value as CardRendererId)}>
            {rendererOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <p>Drag each preview to reposition its image and adjust its zoom. Art styles, thumbnails, and feature cards keep separate crops.</p>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <ArtworkCropControl label="Art style crop" card disabled={disabled}
            adjustment={getArtworkImageAdjustment(artwork, rendererId)}
            onChange={adjustment => onStyleChange(rendererId, adjustment)}>
            <ArtworkImageSourceContext value={sourceUrl}>
              <article className={`rendered-item-card rendered-item-card-${rendererId}`} data-rarity={artwork.rarity}>
                <RenderCardPreview foil={false}>
                  <Renderer item={item} legendaryAttributes={[]} alreadyOwned={false} />
                </RenderCardPreview>
              </article>
            </ArtworkImageSourceContext>
          </ArtworkCropControl>
          <ArtworkCropControl label="Thumbnail crop" disabled={disabled}
            adjustment={thumbnail} onChange={onThumbnailChange}>
            <ArtworkThumbnail artworkId={artwork._id} sourceUrl={sourceUrl}
              adjustment={thumbnail} alt={`${artwork.title} thumbnail`} size={240} />
          </ArtworkCropControl>
        </div>
        <ArtworkCropControl label="Feature card crop" disabled={disabled}
          frameClassName="home-featured-card w-full max-w-[360px]"
          adjustment={featureCard} onChange={onFeatureCardChange}>
          <ArtworkThumbnail artworkId={artwork._id} sourceUrl={sourceUrl}
            adjustment={featureCard} alt={`${artwork.title} feature card`}
            className="home-featured-image" size={360} variant="card" />
          <span aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 border-t border-dashed border-white/90 [filter:drop-shadow(0_1px_1px_#000)]" />
        </ArtworkCropControl>
        <section className="grid gap-4" aria-label="Full-image details">
          <h2 className="text-xl font-bold">Full-image details</h2>
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
            {slots.map((slot, index) => <div className="grid min-w-0 gap-3" key={index}>
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={disabled} checked={slot.enabled}
                  onChange={event => updateDetail(index, slot.adjustment, event.target.checked)} />
                Enable detail {index + 1}
              </label>
              <ArtworkCropControl label={`Detail ${index + 1}`} disabled={disabled || !slot.enabled}
                adjustment={slot.adjustment} onChange={adjustment => updateDetail(index, adjustment)}>
                <ArtworkDetailImage artworkId={artwork._id} sourceUrl={sourceUrl}
                  adjustment={slot.adjustment} alt={`${artwork.title} detail ${index + 1}`} />
              </ArtworkCropControl>
            </div>)}
          </div>
        </section>
      </div>
    </details>
  );
}

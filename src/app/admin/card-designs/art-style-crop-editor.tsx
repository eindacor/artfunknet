"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import {
  ARTWORK_IMAGE_SCALE_MAX,
  ARTWORK_IMAGE_SCALE_MIN,
  ARTWORK_IMAGE_TRANSLATION_MAX,
  ARTWORK_IMAGE_TRANSLATION_MIN,
  getArtworkImageAdjustment,
  roundArtworkImageAdjustment,
} from "@/components/item-cards/artwork-image-adjustments";
import ItemCard from "@/components/item-cards/item-card";
import type {
  CardLegendaryAttribute,
  CardRendererId,
} from "@/components/item-cards/types";
import type { ArtworkArtStyleAdjustment } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

type RendererOption = {
  id: CardRendererId;
  name: string;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startAdjustment: ArtworkArtStyleAdjustment;
  width: number;
  height: number;
};

export default function ArtStyleCropEditor({
  items,
  legendaryAttributes,
  rendererOptions,
}: {
  items: HydratedGameItem[];
  legendaryAttributes: CardLegendaryAttribute[];
  rendererOptions: RendererOption[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [rendererId, setRendererId] =
    useState<CardRendererId>("museum");
  const [acceptedAdjustments, setAcceptedAdjustments] = useState<
    Record<string, ArtworkArtStyleAdjustment>
  >({});
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const matchingItems = useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) =>
            [
              item.artwork.title,
              item.artwork.artist,
              item.artwork.rarity,
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        : [],
    [items, normalizedQuery],
  );
  const visibleMatchingItems = matchingItems.slice(0, 40);
  const selectedItem = selectedArtworkId
    ? items.find((item) => item.artwork_id === selectedArtworkId)
    : undefined;
  const adjustmentKey = `${selectedArtworkId}:${rendererId}`;
  const initialAdjustment = selectedItem
    ? acceptedAdjustments[adjustmentKey] ??
      getArtworkImageAdjustment(selectedItem.artwork, rendererId)
    : null;

  return (
    <div className="art-style-crop-editor">
      <div className="art-style-crop-controls">
        <label>
          Artwork search
          <input
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSelectedArtworkId("");
            }}
            placeholder="Search title, artist, or rarity"
            type="search"
            value={searchQuery}
          />
        </label>
        <label>
          Art style
          <select
            onChange={(event) =>
              setRendererId(event.target.value as CardRendererId)
            }
            value={rendererId}
          >
            {rendererOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {normalizedQuery && matchingItems.length > 0 ? (
        <div
          aria-label="Artwork search results"
          className="art-style-crop-search-results"
          role="listbox"
        >
          {visibleMatchingItems.map((item) => (
            <button
              aria-selected={selectedArtworkId === item.artwork_id}
              className={
                selectedArtworkId === item.artwork_id ? "selected" : undefined
              }
              key={item.artwork_id}
              onClick={() => setSelectedArtworkId(item.artwork_id)}
              role="option"
              type="button"
            >
              <ArtworkThumbnail
                alt=""
                artworkId={item.artwork_id}
                size={52}
                variant="thumb"
              />
              <span>
                <strong>{item.artwork.title}</strong>
                <small>{item.artwork.artist}</small>
              </span>
            </button>
          ))}
          {matchingItems.length > visibleMatchingItems.length ? (
            <p>
              Showing the first {visibleMatchingItems.length} of{" "}
              {matchingItems.length} matches. Refine the search to see more.
            </p>
          ) : null}
        </div>
      ) : null}
      {selectedItem && initialAdjustment ? (
        <ArtStyleCropWorkspace
          initialAdjustment={initialAdjustment}
          item={selectedItem}
          key={adjustmentKey}
          legendaryAttributes={legendaryAttributes}
          onAccepted={(adjustment) =>
            setAcceptedAdjustments((current) => ({
              ...current,
              [adjustmentKey]: adjustment,
            }))
          }
          rendererId={rendererId}
        />
      ) : (
        <div className="art-style-crop-null-state">
          <p>
            {normalizedQuery
              ? matchingItems.length > 0
                ? "Click an artwork from the search results to begin."
                : "No artwork matches this search."
              : "Search for an artwork to begin."}
          </p>
        </div>
      )}
    </div>
  );
}

function ArtStyleCropWorkspace({
  initialAdjustment,
  item: selectedItem,
  legendaryAttributes,
  onAccepted,
  rendererId,
}: {
  initialAdjustment: ArtworkArtStyleAdjustment;
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  onAccepted: (adjustment: ArtworkArtStyleAdjustment) => void;
  rendererId: CardRendererId;
}) {
  const router = useRouter();
  const dragState = useRef<DragState | null>(null);
  const [savedAdjustment, setSavedAdjustment] = useState(initialAdjustment);
  const [adjustment, setAdjustment] = useState(initialAdjustment);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const previewItem = useMemo(() => {
    return {
      ...selectedItem,
      card_renderer: rendererId,
      foil: false,
      seasonal: false,
      artwork: {
        ...selectedItem.artwork,
        art_style_adjustments: {
          ...selectedItem.artwork.art_style_adjustments,
          [rendererId]: adjustment,
        },
      },
    };
  }, [adjustment, rendererId, selectedItem]);

  const dirty =
    adjustment.x !== savedAdjustment.x ||
    adjustment.y !== savedAdjustment.y ||
    adjustment.scale !== savedAdjustment.scale;

  function updateScale(scale: number) {
    setMessage("");
    setAdjustment((current) =>
      roundArtworkImageAdjustment({
        ...current,
        scale: clamp(scale, ARTWORK_IMAGE_SCALE_MIN, ARTWORK_IMAGE_SCALE_MAX),
      }),
    );
  }

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const image =
      event.currentTarget.querySelector<HTMLElement>(
        ".render-card-artwork-image",
      ) ??
      event.currentTarget.querySelector<HTMLElement>(".render-card");
    if (!image) return;
    const bounds = image.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAdjustment: adjustment,
      width: bounds.width,
      height: bounds.height,
    };
    setMessage("");
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setAdjustment(
      roundArtworkImageAdjustment({
        ...drag.startAdjustment,
        x: clamp(
          drag.startAdjustment.x +
            ((event.clientX - drag.startClientX) / drag.width) * 100,
          ARTWORK_IMAGE_TRANSLATION_MIN,
          ARTWORK_IMAGE_TRANSLATION_MAX,
        ),
        y: clamp(
          drag.startAdjustment.y +
            ((event.clientY - drag.startClientY) / drag.height) * 100,
          ARTWORK_IMAGE_TRANSLATION_MIN,
          ARTWORK_IMAGE_TRANSLATION_MAX,
        ),
      }),
    );
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function acceptAdjustment() {
    if (!dirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/artworks/${encodeURIComponent(selectedItem.artwork_id)}/art-style-adjustments`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rendererId, adjustment }),
        },
      );
      const body = (await response.json()) as {
        adjustment?: ArtworkArtStyleAdjustment;
        error?: string;
      };
      if (!response.ok || !body.adjustment) {
        throw new Error(
          body.error ?? "The art style adjustment could not be saved.",
        );
      }
      setAdjustment(body.adjustment);
      setSavedAdjustment(body.adjustment);
      onAccepted(body.adjustment);
      setMessage("Adjustment accepted.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The art style adjustment could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="art-style-crop-workspace">
      <div className="art-style-crop-controls art-style-crop-adjustment-controls">
        <div className="art-style-crop-zoom" aria-label="Artwork zoom controls">
          <label htmlFor="art-style-crop-zoom">Zoom</label>
          <input
            disabled={saving}
            id="art-style-crop-zoom"
            max={ARTWORK_IMAGE_SCALE_MAX}
            min={ARTWORK_IMAGE_SCALE_MIN}
            onChange={(event) => updateScale(Number(event.target.value))}
            step={0.05}
            type="range"
            value={adjustment.scale}
          />
          <output>{Math.round(adjustment.scale * 100)}%</output>
        </div>
        <button
          className="art-style-crop-accept"
          disabled={saving || !dirty}
          onClick={() => void acceptAdjustment()}
          type="button"
        >
          {saving ? "Saving..." : "Accept"}
        </button>
      </div>
      <p className="art-style-crop-values">
        Drag the artwork in the card to reposition it. X:{" "}
        {adjustment.x.toFixed(1)}%, Y: {adjustment.y.toFixed(1)}%, scale:{" "}
        {adjustment.scale.toFixed(2)}
      </p>
      {error ? <p className="art-style-crop-error" role="alert">{error}</p> : null}
      {message ? <p className="art-style-crop-message" role="status">{message}</p> : null}
      <div
        className="art-style-crop-stage"
        onPointerCancel={endDrag}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <ItemCard
          alreadyOwned={false}
          forceRendererId={rendererId}
          interactive={false}
          item={previewItem}
          key={[
            selectedItem.artwork_id,
            rendererId,
            adjustment.x,
            adjustment.y,
            adjustment.scale,
          ].join(":")}
          legendaryAttributes={legendaryAttributes}
        />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

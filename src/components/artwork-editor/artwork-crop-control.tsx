"use client";

import { useId, useRef, type ReactNode } from "react";
import {
  ARTWORK_IMAGE_SCALE_MAX,
  ARTWORK_IMAGE_SCALE_MIN,
  normalizeArtworkImageAdjustment,
  roundArtworkImageAdjustment,
} from "@/components/item-cards/artwork-image-adjustments";
import type { ArtworkArtStyleAdjustment } from "@/server/gameplay";

export default function ArtworkCropControl({
  label, adjustment, onChange, children, disabled = false, card = false, frameClassName = "",
}: {
  label: string;
  adjustment: ArtworkArtStyleAdjustment;
  onChange: (adjustment: ArtworkArtStyleAdjustment) => void;
  children: ReactNode;
  disabled?: boolean;
  card?: boolean;
  frameClassName?: string;
}) {
  const id = useId();
  const drag = useRef<{
    pointerId: number; x: number; y: number; width: number; height: number;
    adjustment: ArtworkArtStyleAdjustment;
  } | null>(null);
  function update(values: Partial<ArtworkArtStyleAdjustment>) {
    onChange(roundArtworkImageAdjustment(normalizeArtworkImageAdjustment({ ...adjustment, ...values })));
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <section aria-label={label} className="grid min-w-0 grid-cols-1 gap-3">
      <h3 className="font-semibold">{label}</h3>
      <div className={`${card ? "art-style-crop-stage" : `artwork-detail-crop-frame${disabled ? " disabled" : ""}`} ${frameClassName}`.trim()}
        onPointerDown={event => {
          if (disabled || event.button !== 0) return;
          const image = event.currentTarget.querySelector(".render-card-artwork-image") ?? event.currentTarget;
          const bounds = image.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            width: bounds.width, height: bounds.height, adjustment };
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (disabled || !start || start.pointerId !== event.pointerId) return;
          onChange(roundArtworkImageAdjustment(normalizeArtworkImageAdjustment({
            ...start.adjustment,
            x: start.adjustment.x + (event.clientX - start.x) / start.width * 100,
            y: start.adjustment.y + (event.clientY - start.y) / start.height * 100,
          })));
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; }}
      >{children}</div>
      <label className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2" htmlFor={id}>
        Zoom
        <input id={id} className="min-w-0 w-full" disabled={disabled} type="range" min={ARTWORK_IMAGE_SCALE_MIN}
          max={ARTWORK_IMAGE_SCALE_MAX} step="0.05" value={adjustment.scale}
          onChange={event => update({ scale: Number(event.target.value) })} />
        <output>{Math.round(adjustment.scale * 100)}%</output>
      </label>
      <button className="justify-self-start text-sm text-[var(--accent)]" disabled={disabled}
        onClick={() => onChange({ x: 0, y: 0, scale: 1 })} type="button">Reset crop</button>
    </section>
  );
}

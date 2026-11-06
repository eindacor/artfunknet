"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ARTWORK_EDITOR_RARITIES, type ArtworkCatalogEntry } from "@/components/artwork-editor/types";
import { getArtworkBaseGenerationWeight } from "@/server/artwork-generation-weight";

export type DistributionArtwork = Pick<ArtworkCatalogEntry, "_id" | "title" | "rarity" | "active" | "value_scale">;
type SaveValueScale = (id: string, value: number) => Promise<boolean>;

function arrangeDots(artworks: readonly DistributionArtwork[]) {
  const lanes: number[] = [];
  const dots = [...artworks].sort((a, b) => a.value_scale - b.value_scale || a._id.localeCompare(b._id)).map(artwork => {
    let lane = lanes.findIndex(last => artwork.value_scale - last >= 0.05);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = artwork.value_scale;
    return { artwork, lane };
  });
  return { dots, height: Math.max(1, lanes.length) * 26 };
}

export default function ArtworkValueDistribution({
  artworks, pending, onSave,
}: {
  artworks: readonly DistributionArtwork[];
  pending: boolean;
  onSave: SaveValueScale;
}) {
  const rows = useMemo(() => ARTWORK_EDITOR_RARITIES.map(rarity => {
    const active = artworks.filter(artwork => artwork.active && artwork.rarity === rarity);
    return {
      rarity, ...arrangeDots(active),
      totalWeight: active.reduce((sum, artwork) => sum + getArtworkBaseGenerationWeight(artwork.value_scale), 0),
    };
  }), [artworks]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function save(artwork: DistributionArtwork, value: number) {
    setStatus(`Saving ${artwork.title}...`);
    setError("");
    try {
      if (!await onSave(artwork._id, value)) throw new Error("Value scale could not be saved. Please try again.");
      setStatus(`Saved ${artwork.title}: ${value.toFixed(2)}.`);
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Value scale could not be saved.");
    }
  }

  return (
    <details className="rounded-lg border border-white/10 bg-white/5">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Artwork value scale distribution</summary>
      <div className="border-t border-white/10 p-4">
        <p className="mb-3 text-sm text-[var(--muted)]">Active artwork only. Drag a dot to adjust its value scale; release to save. Arrow keys also adjust the value. Overlapping dots are stacked.</p>
        <div className="max-h-[32rem] overflow-auto px-3 pb-2">
          <div className="grid min-w-[42rem] grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-4">
            <span />
            <div className="flex justify-between text-xs text-[var(--muted)]"><span>0</span><span>0.5</span><span>1</span></div>
            {rows.map(({ rarity, dots, height, totalWeight }) => (
              <div className="contents" key={rarity}>
                <span className={`rarity-text ${rarity} pt-1 text-sm font-semibold capitalize`}>
                  {rarity} ({dots.length})
                  <span className="block text-xs font-normal normal-case text-[var(--muted)]" data-value-scale-total-weight={rarity}>Total weight: {totalWeight}</span>
                </span>
                <div className={`rarity-text ${rarity} relative`} style={{ height }} data-value-scale-rarity={rarity}>
                  <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[13px] h-px bg-white/30" />
                  {dots.map(({ artwork, lane }) => (
                    <ValueScaleDot key={artwork._id} artwork={artwork} lane={lane} disabled={pending} onSave={save} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p role="status" className="mt-2 text-sm text-[var(--muted)]">{status}</p>
        {error ? <p role="alert" className="mt-2 text-sm text-red-400">{error}</p> : null}
      </div>
    </details>
  );
}

function ValueScaleDot({ artwork, lane, disabled, onSave }: {
  artwork: DistributionArtwork;
  lane: number;
  disabled: boolean;
  onSave: (artwork: DistributionArtwork, value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const interaction = useRef<{ value: number; initial: number; pointer?: { id: number; x: number; width: number } } | null>(null);
  const committing = useRef(false);
  const value = draft ?? artwork.value_scale;
  const weight = getArtworkBaseGenerationWeight(value);

  function preview(next: number) {
    const clamped = Math.round(Math.max(0, Math.min(1, next)) * 100) / 100;
    if (interaction.current) interaction.current.value = clamped;
    setDraft(clamped);
  }

  async function commit() {
    if (committing.current) return;
    const current = interaction.current;
    interaction.current = null;
    if (!current || current.value === current.initial) {
      setDraft(null);
      return;
    }
    committing.current = true;
    setSaving(true);
    try {
      await onSave(artwork, current.value);
    } finally {
      committing.current = false;
      setSaving(false);
      setDraft(null);
    }
  }

  function cancel() {
    interaction.current = null;
    if (!committing.current) setDraft(null);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = interaction.current;
    if (current?.pointer?.id !== event.pointerId) return;
    if (event.clientX === current.pointer.x) {
      current.value = current.initial;
      setDraft(current.initial);
      return;
    }
    preview(current.initial + (event.clientX - current.pointer.x) / current.pointer.width);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || saving || interaction.current?.pointer) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    const step = event.shiftKey ? 0.1 : 0.01;
    const current = interaction.current?.value ?? artwork.value_scale;
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1
      : ["ArrowRight", "ArrowUp"].includes(event.key) ? current + step
        : ["ArrowLeft", "ArrowDown"].includes(event.key) ? current - step : null;
    if (next === null) return;
    event.preventDefault();
    interaction.current ??= { value: current, initial: artwork.value_scale };
    preview(next);
  }

  return (
    <button
      type="button"
      role="slider"
      aria-label={`${artwork.title} value scale`}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
      aria-valuetext={`${value.toFixed(2)}, weight: ${weight}`}
      aria-busy={saving || undefined}
      title={`${artwork.title} (value scale: ${value.toFixed(2)}, weight: ${weight})`}
      disabled={disabled || saving}
      className="absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none select-none rounded-full border-2 border-[#19171d] bg-current outline-offset-2 hover:z-20 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-wait"
      style={{ left: `${value * 100}%`, top: 13 + lane * 26, cursor: disabled || saving ? undefined : "ew-resize" }}
      onPointerDown={event => {
        if (disabled || saving || event.button !== 0 || interaction.current) return;
        const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
        if (width <= 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        interaction.current = { value, initial: value, pointer: { id: event.pointerId, x: event.clientX, width } };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={event => {
        if (interaction.current?.pointer?.id !== event.pointerId) return;
        move(event);
        void commit();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={keyDown}
      onKeyUp={event => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) && !interaction.current?.pointer) void commit();
      }}
      onBlur={() => { if (!interaction.current?.pointer) void commit(); }}
    >
      {lane > 0 ? <span aria-hidden="true" className="pointer-events-none absolute bottom-1/2 left-1/2 -z-10 w-px bg-current opacity-30" style={{ height: lane * 26 }} /> : null}
    </button>
  );
}

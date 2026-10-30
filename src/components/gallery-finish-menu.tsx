"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  GALLERY_FINISH_PRESETS,
  GALLERY_FINISH_SLOTS,
  galleryColorToHex,
  hexToGalleryColor,
  parseGalleryFinishUpdate,
  type GalleryFinishSlot,
  type GalleryFinishes,
} from "@/server/gallery-finishes";

export default function GalleryFinishMenu({
  finishes,
  galleryId,
  onChange,
}: {
  finishes: GalleryFinishes;
  galleryId: string;
  onChange: (finishes: GalleryFinishes) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [saved, setSaved] = useState(finishes);
  const [hexDrafts, setHexDrafts] = useState<Partial<Record<GalleryFinishSlot, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(finishes) !== JSON.stringify(saved);
  const invalid = Object.values(hexDrafts).some(
    (hex) => hexToGalleryColor(hex) === null,
  );

  useEffect(() => () => request.current?.abort(), []);

  function changeColor(slot: GalleryFinishSlot, hex: string) {
    setHexDrafts((current) => ({ ...current, [slot]: hex }));
    setError("");
    const color = hexToGalleryColor(hex);
    if (color) onChange({ ...finishes, [slot]: color });
  }

  async function save() {
    if (saving || !dirty || invalid) return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/play/gallery-finishes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ galleryId, finishes }),
        signal: controller.signal,
      });
      const body = (await response.json()) as { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        throw new Error(body.error ?? "Finish colors could not be saved.");
      }
      const update = parseGalleryFinishUpdate(body);
      if (!update || update.galleryId !== galleryId) {
        throw new Error("The saved finish colors could not be loaded.");
      }
      setSaved(update.finishes);
      onChange(update.finishes);
      router.refresh();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error
          ? failure.message
          : "Finish colors could not be saved.");
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <section
      aria-label="Gallery finishes"
      className="visited-gallery-player-panel gallery-finish-panel"
    >
      <form onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}>
        {GALLERY_FINISH_SLOTS.map((slot) => {
          const label = slot[0].toUpperCase() + slot.slice(1);
          const color = galleryColorToHex(finishes[slot]);
          const hex = hexDrafts[slot] ?? color;
          return (
            <fieldset disabled={saving} key={slot}>
              <legend>{label}</legend>
              <div aria-label={`${label} suggested colors`} className="gallery-finish-swatches">
                {GALLERY_FINISH_PRESETS[slot].map((preset) => (
                  <button
                    aria-label={`${label} ${preset}`}
                    aria-pressed={preset === color}
                    key={preset}
                    onClick={() => changeColor(slot, preset)}
                    style={{ backgroundColor: preset }}
                    title={preset}
                    type="button"
                  />
                ))}
              </div>
              <div className="gallery-finish-custom">
                <input
                  aria-label={`${label} color picker`}
                  onChange={(event) => changeColor(slot, event.target.value)}
                  type="color"
                  value={color}
                />
                <label htmlFor={`${id}-${slot}`}>Hex</label>
                <input
                  aria-invalid={hexToGalleryColor(hex) === null}
                  aria-label={`${label} hex color`}
                  autoComplete="off"
                  id={`${id}-${slot}`}
                  maxLength={7}
                  onBlur={() => {
                    if (hexToGalleryColor(hex)) {
                      setHexDrafts((current) => ({ ...current, [slot]: color }));
                    }
                  }}
                  onChange={(event) => changeColor(slot, event.target.value)}
                  pattern="#?(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})"
                  required
                  spellCheck={false}
                  type="text"
                  value={hex}
                />
              </div>
            </fieldset>
          );
        })}
        <div className="gallery-finish-save">
          <button disabled={saving || !dirty || invalid} type="submit">
            {saving ? "Saving..." : "Save finishes"}
          </button>
          <p role={error ? "alert" : "status"}>
            {error || (invalid
              ? "Enter a valid hex color, such as #626859."
              : dirty ? "Unsaved changes." : "Colors saved.")}
          </p>
        </div>
      </form>
    </section>
  );
}

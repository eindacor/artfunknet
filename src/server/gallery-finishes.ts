export const GALLERY_FINISH_SLOTS = [
  "ceiling",
  "wall",
  "floor",
  "trim",
  "frame",
  "matte",
] as const;

export type GalleryFinishSlot = (typeof GALLERY_FINISH_SLOTS)[number];
// Components are normalized sRGB, matching browser color pickers and hex codes.
export type GalleryColor = [number, number, number];
export const GALLERY_FINISH_WIDTH_SLOTS = ["frame_width", "matte_width"] as const;
export type GalleryFinishWidthSlot = (typeof GALLERY_FINISH_WIDTH_SLOTS)[number];
// Widths are stored in meters, matching the gallery scene.
export const GALLERY_FINISH_WIDTH_LIMITS = {
  frame_width: { min: 0.01, max: 0.15, step: 0.001, default: 0.045 },
  matte_width: { min: 0, max: 0.2, step: 0.001, default: 0.06 },
} as const;
export type GalleryFinishes = Record<GalleryFinishSlot, GalleryColor> &
  Record<GalleryFinishWidthSlot, number>;
export type PlayerGalleryFinishes = Record<string, GalleryFinishes>;

export const GALLERY_FINISH_PRESETS: Record<GalleryFinishSlot, readonly string[]> = {
  ceiling: ["#cec7b6", "#f8f6f0", "#e8e4db", "#d8dfe3", "#b7b0a2", "#555b60"],
  wall: ["#626859", "#e8dfcd", "#c8c0b3", "#4f6673", "#704a4b", "#292b30"],
  floor: ["#705039", "#b08a5b", "#5b4135", "#d7cdbb", "#7d827c", "#303237"],
  trim: ["#705039", "#f8f6f0", "#b08a5b", "#5b4135", "#7d827c", "#303237"],
  frame: ["#966932", "#2a2520", "#f0ede6", "#c2a15f", "#715444", "#a5a8aa"],
  matte: ["#eee8dc", "#fffdf7", "#d7d1c5", "#a7a29a", "#33363b", "#18292a"],
};

export function hexToGalleryColor(value: string): GalleryColor | null {
  let hex = value.trim().replace(/^#/, "");
  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return null;
  if (hex.length === 3) {
    hex = [...hex].map((component) => component.repeat(2)).join("");
  }
  return [0, 2, 4].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  ) as GalleryColor;
}

export function galleryColorToHex(color: GalleryColor): string {
  return `#${color.map((component) =>
    Math.round(component * 255).toString(16).padStart(2, "0"),
  ).join("")}`;
}

export const DEFAULT_GALLERY_FINISHES: GalleryFinishes = {
  ...Object.fromEntries(
    GALLERY_FINISH_SLOTS.map((slot) => [
      slot,
      hexToGalleryColor(GALLERY_FINISH_PRESETS[slot][0])!,
    ]),
  ) as Record<GalleryFinishSlot, GalleryColor>,
  frame_width: GALLERY_FINISH_WIDTH_LIMITS.frame_width.default,
  matte_width: GALLERY_FINISH_WIDTH_LIMITS.matte_width.default,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGalleryColor(value: unknown): value is GalleryColor {
  return Array.isArray(value) && value.length === 3 && value.every(
    (component) => typeof component === "number" &&
      Number.isFinite(component) && component >= 0 && component <= 1,
  );
}

function isGalleryWidth(slot: GalleryFinishWidthSlot, value: unknown): value is number {
  const { min, max } = GALLERY_FINISH_WIDTH_LIMITS[slot];
  return typeof value === "number" && Number.isFinite(value) &&
    value >= min && value <= max;
}

export function getGalleryFinishes(value: unknown): GalleryFinishes {
  const record = isRecord(value) ? value : {};
  const colors = Object.fromEntries(GALLERY_FINISH_SLOTS.map((slot) => {
    const color = Object.hasOwn(record, slot) && isGalleryColor(record[slot])
      ? record[slot]
      : DEFAULT_GALLERY_FINISHES[slot];
    return [slot, [...color]];
  })) as Record<GalleryFinishSlot, GalleryColor>;
  return {
    ...colors,
    frame_width: isGalleryWidth("frame_width", record.frame_width)
      ? record.frame_width : DEFAULT_GALLERY_FINISHES.frame_width,
    matte_width: isGalleryWidth("matte_width", record.matte_width)
      ? record.matte_width : DEFAULT_GALLERY_FINISHES.matte_width,
  };
}

export function isGalleryFinishId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[a-z\d_-]{1,128}$/i.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value);
}

export function parseGalleryFinishUpdate(value: unknown): {
  galleryId: string;
  finishes: GalleryFinishes;
} | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "galleryId") ||
    !Object.hasOwn(value, "finishes") ||
    !isGalleryFinishId(value.galleryId) ||
    !isRecord(value.finishes)
  ) return null;
  const finishes = value.finishes;
  if (
    Object.keys(finishes).length !==
      GALLERY_FINISH_SLOTS.length + GALLERY_FINISH_WIDTH_SLOTS.length ||
    !GALLERY_FINISH_SLOTS.every((slot) =>
      Object.hasOwn(finishes, slot) && isGalleryColor(finishes[slot]),
    ) ||
    !GALLERY_FINISH_WIDTH_SLOTS.every((slot) =>
      Object.hasOwn(finishes, slot) && isGalleryWidth(slot, finishes[slot]),
    )
  ) return null;
  return {
    galleryId: value.galleryId,
    finishes: getGalleryFinishes(finishes),
  };
}

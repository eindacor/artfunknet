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
export type GalleryFinishes = Record<GalleryFinishSlot, GalleryColor>;
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

export const DEFAULT_GALLERY_FINISHES = Object.fromEntries(
  GALLERY_FINISH_SLOTS.map((slot) => [
    slot,
    hexToGalleryColor(GALLERY_FINISH_PRESETS[slot][0])!,
  ]),
) as GalleryFinishes;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGalleryColor(value: unknown): value is GalleryColor {
  return Array.isArray(value) && value.length === 3 && value.every(
    (component) => typeof component === "number" &&
      Number.isFinite(component) && component >= 0 && component <= 1,
  );
}

export function getGalleryFinishes(value: unknown): GalleryFinishes {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(GALLERY_FINISH_SLOTS.map((slot) => {
    const color = Object.hasOwn(record, slot) && isGalleryColor(record[slot])
      ? record[slot]
      : DEFAULT_GALLERY_FINISHES[slot];
    return [slot, [...color]];
  })) as GalleryFinishes;
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
    Object.keys(finishes).length !== GALLERY_FINISH_SLOTS.length ||
    !GALLERY_FINISH_SLOTS.every((slot) =>
      Object.hasOwn(finishes, slot) && isGalleryColor(finishes[slot]),
    )
  ) return null;
  return {
    galleryId: value.galleryId,
    finishes: getGalleryFinishes(finishes),
  };
}

export const MAX_ITEM_TAGS = 20;
export const MAX_ITEM_TAG_LENGTH = 40;

export function normalizeItemTags(
  value: unknown,
): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Tags must be provided as a list." };
  }

  const tags: string[] = [];
  for (const rawTag of value) {
    if (typeof rawTag !== "string") {
      return { ok: false, error: "Every tag must be text." };
    }
    const tag = rawTag.trim().replace(/\s+/g, " ").toLowerCase();
    if (!tag) continue;
    if (tag.length > MAX_ITEM_TAG_LENGTH) {
      return {
        ok: false,
        error: `Tags cannot exceed ${MAX_ITEM_TAG_LENGTH} characters.`,
      };
    }
    if (/[\u0000-\u001f\u007f]/.test(tag)) {
      return { ok: false, error: "Tags cannot contain control characters." };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }

  if (tags.length > MAX_ITEM_TAGS) {
    return {
      ok: false,
      error: `Items cannot have more than ${MAX_ITEM_TAGS} tags.`,
    };
  }
  return { ok: true, tags };
}

export function parseItemTagInput(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

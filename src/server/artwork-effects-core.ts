export type ArtworkEffectType = "legendary" | "masterpiece";
export type ArtworkEffectParameter = boolean | number | string;

export type ArtworkEffect = {
  _id: string;
  effect_type: ArtworkEffectType;
  title: string;
  description: string;
  flavor_text: string;
  code: string;
  active: boolean;
  linked_attributes: [string, string] | [string];
  parameters: Record<string, ArtworkEffectParameter>;
  created_at?: string;
  updated_at?: string;
};

export function validateArtworkEffectLinks(
  effectType: ArtworkEffectType,
  attributeIds: readonly string[],
): [string, string] | [string] {
  const uniqueIds = [...new Set(attributeIds.filter(Boolean))];
  const expected = effectType === "legendary" ? 2 : 1;
  if (uniqueIds.length !== expected) {
    throw new Error(
      `${effectType} effects must link exactly ${expected} distinct attribute${expected === 1 ? "" : "s"}.`,
    );
  }
  return (effectType === "legendary"
    ? [...uniqueIds].sort()
    : uniqueIds) as [string, string] | [string];
}

export function normalizeLegendaryPair(attributeIds: readonly string[]): string {
  return (validateArtworkEffectLinks(
    "legendary",
    attributeIds,
  ) as [string, string]).join(":");
}

export function getArtworkEffectNumberParameter(
  effect: ArtworkEffect | null,
  key: string,
  fallback: number,
): number {
  const value = effect?.parameters[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export function selectLeastRepresentedEffect<T extends { _id: string }>(
  effects: readonly T[],
  counts: ReadonlyMap<string, number>,
  random: () => number = Math.random,
): T | null {
  if (effects.length === 0) return null;
  const minimum = Math.min(...effects.map((effect) => counts.get(effect._id) ?? 0));
  const tied = effects.filter(
    (effect) => (counts.get(effect._id) ?? 0) === minimum,
  );
  return tied[Math.floor(Math.min(Math.max(random(), 0), 0.999999999999) * tied.length)];
}

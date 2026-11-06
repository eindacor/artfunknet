"use client";

import { useRef, useState } from "react";
import { ARTWORK_EDITOR_RARITIES as RARITIES } from "@/components/artwork-editor/types";
import ArtworkValueDistribution, { type DistributionArtwork } from "./artwork-value-distribution";

export type ArtworkEffectDistribution = {
  id: string;
  title: string;
  effectType: "legendary" | "masterpiece";
  artworkCount: number;
};

export default function LootPoolArtworks({
  initialArtworks,
  effectDistribution,
}: {
  initialArtworks: DistributionArtwork[];
  effectDistribution: ArtworkEffectDistribution[];
}) {
  const [artworks, setArtworks] = useState(initialArtworks);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);

  async function saveValueScale(id: string, value: number) {
    if (saving.current) return false;
    saving.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/artworks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "value-scale", value_scale: value }),
      });
      const result = await response.json() as { artwork: DistributionArtwork; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Update failed.");
      setArtworks(current => current.map(artwork =>
        artwork._id === id ? { ...artwork, value_scale: result.artwork.value_scale } : artwork,
      ));
      return true;
    } finally {
      setPending(false);
      saving.current = false;
    }
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Artwork breakdown</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {RARITIES.map(rarity => (
            <div
              className="rounded-md border border-white/10 bg-black/10 px-3 py-2"
              key={rarity}
            >
              <p className={`rarity-text ${rarity} capitalize`}>{rarity}</p>
              <p className="mt-1 text-2xl font-bold">{artworks.filter(artwork => artwork.rarity === rarity).length}</p>
            </div>
          ))}
        </div>
      </div>
      <ArtworkValueDistribution artworks={artworks} pending={pending} onSave={saveValueScale} />
      <details className="rounded-lg border border-white/10 bg-white/5">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Artwork effect distribution
        </summary>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1 border-t border-white/10 p-2">
          {effectDistribution.map(effect => (
            <span
              className={`rarity-text ${effect.effectType} grid grid-cols-[minmax(0,1fr)_2.25rem] items-center rounded border border-white/10 bg-black/10 px-2 py-1 text-xs font-semibold`}
              key={effect.id}
            >
              <span className="break-words">{effect.title}</span>
              <span className="border-l border-white/10 pl-2 text-right text-white">
                {effect.artworkCount}
              </span>
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}

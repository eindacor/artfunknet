"use client";

import { useState } from "react";

import type {
  SeasonalArtworkSelections,
} from "@/server/seasonal-artwork";

const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

export type SeasonalArtworkOption = {
  id: string;
  artist: string;
  title: string;
  rarity: (typeof RARITIES)[number];
};

export default function SeasonalArtworkForm({
  initialSelections,
  artworks,
}: {
  initialSelections: SeasonalArtworkSelections;
  artworks: SeasonalArtworkOption[];
}) {
  const [selections, setSelections] = useState(initialSelections);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateSelection(
    rarity: (typeof RARITIES)[number],
    artworkId: string | null,
  ) {
    const previousSelections = selections;
    const nextSelections = {
      ...selections,
      [rarity]: artworkId,
    };
    setSelections(nextSelections);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/seasonal-artwork", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selections: nextSelections }),
      });
      const body = (await response.json()) as {
        error?: string;
        selections?: SeasonalArtworkSelections;
      };
      if (!response.ok || !body.selections) {
        throw new Error(body.error ?? "Seasonal artwork could not be saved.");
      }
      setSelections(body.selections);
    } catch (saveError) {
      setSelections(previousSelections);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Seasonal artwork could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="seasonal-artwork-form">
      <div className="seasonal-artwork-grid">
        {RARITIES.map((rarity) => (
          <label key={rarity}>
            <span>{rarity}</span>
            <select
              disabled={busy}
              onChange={(event) =>
                void updateSelection(rarity, event.target.value || null)
              }
              value={selections[rarity] ?? ""}
            >
              <option value="">No seasonal artwork</option>
              {artworks
                .filter((artwork) => artwork.rarity === rarity)
                .map((artwork) => (
                  <option key={artwork.id} value={artwork.id}>
                    {artwork.title} — {artwork.artist}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";

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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/seasonal-artwork", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const body = (await response.json()) as {
        error?: string;
        selections?: SeasonalArtworkSelections;
      };
      if (!response.ok || !body.selections) {
        throw new Error(body.error ?? "Seasonal artwork could not be saved.");
      }
      setSelections(body.selections);
      setMessage("Seasonal artwork settings saved.");
    } catch (saveError) {
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
    <form className="seasonal-artwork-form" onSubmit={submit}>
      <div className="seasonal-artwork-grid">
        {RARITIES.map((rarity) => (
          <label key={rarity}>
            <span>{rarity}</span>
            <select
              disabled={busy}
              onChange={(event) =>
                setSelections((current) => ({
                  ...current,
                  [rarity]: event.target.value || null,
                }))
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
      <button disabled={busy} type="submit">
        {busy ? "saving..." : "save seasonal artwork"}
      </button>
      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </form>
  );
}

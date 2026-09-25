"use client";

import { FormEvent, useEffect, useState } from "react";

import type { Artwork, GameItem } from "@/server/gameplay";
import type { HallOfFameRecord } from "@/server/hall-of-fame";

export default function AdminHallOfFamePage() {
  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [searchResult, setSearchResult] = useState<{
    item: GameItem;
    artwork: Artwork | null;
    owner_screen_name: string;
    existing_hall_of_fame: HallOfFameRecord | null;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [records, setRecords] = useState<HallOfFameRecord[]>([]);

  async function loadRecords() {
    try {
      const response = await fetch("/api/admin/hall-of-fame");
      if (response.ok) {
        const data = await response.json();
        setRecords(data.records || []);
      }
    } catch {
      // Ignore initial load failure
    }
  }

  useEffect(() => {
    loadRecords();
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSearchResult(null);
    if (!searchId.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/hall-of-fame?itemId=${encodeURIComponent(searchId.trim())}`,
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Search failed.");
      } else {
        setSearchResult(data);
        if (data.existing_hall_of_fame) {
          setTitle(data.existing_hall_of_fame.title);
          setDescription(data.existing_hall_of_fame.description);
        } else {
          setTitle("");
          setDescription("");
        }
      }
    } catch {
      setError("An unexpected error occurred during search.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!searchResult) return;
    setError("");
    setMessage("");

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/hall-of-fame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: searchResult.item._id,
          title,
          description,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Submission failed.");
      } else {
        setMessage("Item successfully added to the Hall of Fame!");
        loadRecords();
      }
    } catch {
      setError("An unexpected error occurred while saving.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--accent)]">Hall of Fame Management</h1>
        <p className="text-sm text-[var(--muted)]">
          Search for any game item by ID, inspect details, and induct it into the Hall of Fame with a custom title and description.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400">
          {message}
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-4">
        <input
          className="flex-1 rounded border border-white/20 bg-black/40 px-4 py-2 text-sm"
          placeholder="Enter Game Item ID (UUID)..."
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
        />
        <button
          className="rounded bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          disabled={searching}
          type="submit"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searchResult && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Item ID</p>
              <p className="font-mono">{searchResult.item._id}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Artwork</p>
              <p className="font-semibold">{searchResult.artwork?.title || "Unknown Title"}</p>
              <p className="text-xs text-[var(--muted)]">by {searchResult.artwork?.artist || "Unknown Artist"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Rarity / Level</p>
              <p className="capitalize">{searchResult.artwork?.rarity} (Lvl {searchResult.item.level})</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Owner</p>
              <p>{searchResult.owner_screen_name}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Attributes</p>
              <p>Condition: {(searchResult.item.condition * 100).toFixed(0)}% | Foil: {searchResult.item.foil ? "Yes" : "No"} | Mint: {searchResult.item.mint ? "Yes" : "No"} | Unlocked: {searchResult.item.unlocked ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Status</p>
              <p className="capitalize">{searchResult.item.status}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/10 pt-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Hall of Fame Title</label>
              <input
                className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                placeholder="e.g. Masterpiece of the Millennium"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Description</label>
              <textarea
                className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                rows={3}
                placeholder="Explain why this artwork is enshrined..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <button
              className="rounded bg-emerald-500 px-6 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Saving..." : "Submit to Hall of Fame"}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4 border-t border-white/10 pt-6">
        <h2 className="text-lg font-bold text-white">Enshrined Hall of Fame Records ({records.length})</h2>
        {records.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No Hall of Fame records exist yet.</p>
        ) : (
          <div className="grid gap-4">
            {records.map((rec) => (
              <div key={rec._id} className="rounded border border-white/10 bg-black/20 p-4 space-y-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-[var(--accent)]">{rec.title}</h3>
                  <span className="text-xs text-[var(--muted)]">{new Date(rec.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm">{rec.description}</p>
                <div className="flex gap-4 text-xs text-[var(--muted)] pt-2">
                  <span>Artwork: <strong>{rec.item_snapshot?.artwork_title || rec.item_id}</strong></span>
                  <span>Owner: <strong>{rec.player_screen_name || rec.player_id || "System"}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

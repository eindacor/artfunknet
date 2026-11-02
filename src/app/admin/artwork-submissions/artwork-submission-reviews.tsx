"use client";

import { useState } from "react";
import ArtworkEditorPanel from "@/components/artwork-editor/artwork-editor-panel";
import type { ArtistCatalogEntry, ArtworkCatalogEntry, ArtworkEditorMetadata } from "@/components/artwork-editor/types";
import type { CardRendererId } from "@/components/item-cards/types";

export default function ArtworkSubmissionReviews({ initialWorks, artists, rendererOptions }: {
  initialWorks: ArtworkCatalogEntry[];
  artists: ArtistCatalogEntry[];
  rendererOptions: { id: CardRendererId; name: string }[];
}) {
  const [works, setWorks] = useState(initialWorks);
  const [selectedId, setSelectedId] = useState(initialWorks[0]?._id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = works.find(work => work._id === selectedId);
  function remove(id: string) {
    const remaining = works.filter(work => work._id !== id);
    setWorks(remaining); setSelectedId(remaining[0]?._id ?? "");
  }
  async function approve(metadata: ArtworkEditorMetadata) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/artworks/${selected._id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...metadata, action: "approve" }),
      });
      const result = await response.json() as { artwork: ArtworkCatalogEntry; error?: string };
      if (!response.ok) throw new Error(result.error ?? "The artwork could not be accepted.");
      remove(selected._id);
      return result.artwork;
    } finally { setBusy(false); }
  }
  async function deny() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/artworks/${selected._id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The submission could not be removed.");
      remove(selected._id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The submission could not be removed."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="grid content-start gap-3">
      {!works.length ? <p>No pending artwork submissions.</p> : works.map(work =>
        <button aria-pressed={work._id === selectedId} className="rounded-lg border border-white/20 p-3 text-left aria-pressed:border-[var(--accent)]" disabled={busy} key={work._id} onClick={() => { setSelectedId(work._id); setError(""); }} type="button">
          <strong className="block">{work.title}</strong><span>{work.artist}</span>
        </button>)}
      {error ? <p className="text-red-400" role="alert">{error}</p> : null}
    </aside>
    {selected ? <ArtworkEditorPanel key={selected._id} mode="review" artwork={selected} artists={artists}
      rendererOptions={rendererOptions}
      pending={busy} showActiveInGame={false} submitLabel="Accept artwork" deleteLabel="Deny and delete submission"
      onSave={approve} onDelete={() => void deny()} onUploaded={artwork => setWorks(current => current.map(work => work._id === artwork._id ? artwork : work))} /> : null}
  </div>;
}

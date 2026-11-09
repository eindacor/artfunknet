"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ArtworkEditorPanel from "@/components/artwork-editor/artwork-editor-panel";
import type { ArtistCatalogEntry, ArtworkCatalogEntry, ArtworkEditorMetadata } from "@/components/artwork-editor/types";
import type { CardRendererId } from "@/components/item-cards/types";
import { getArtworkImageUrl } from "@/server/artwork-image-url";

export type ArtworkChangeReview = {
  changeId: string;
  artwork: ArtworkCatalogEntry;
  current: ArtworkCatalogEntry | null;
  hasNewImage: boolean;
  revision: number;
};
type Review = {
  artwork: ArtworkCatalogEntry;
  changeId?: string;
  current?: ArtworkCatalogEntry | null;
  hasNewImage?: boolean;
  revision?: number;
};
const reviewId = (review: Review) => review.changeId ?? review.artwork._id;

export default function ArtworkSubmissionReviews({ initialWorks, initialChanges = [], artists, rendererOptions }: {
  initialWorks: ArtworkCatalogEntry[];
  initialChanges?: ArtworkChangeReview[];
  artists: ArtistCatalogEntry[];
  rendererOptions: { id: CardRendererId; name: string }[];
}) {
  const router = useRouter();
  const [works, setWorks] = useState<Review[]>(() => [...initialWorks.map(artwork => ({ artwork })), ...initialChanges]);
  const [selectedId, setSelectedId] = useState(initialWorks[0]?._id ?? initialChanges[0]?.changeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = works.find(work => reviewId(work) === selectedId);
  function remove(id: string, saved?: ArtworkCatalogEntry) {
    const remaining = works.filter(work => reviewId(work) !== id).flatMap(work => {
      if (!saved || work.artwork._id !== saved._id) return [work];
      if (!work.changeId) return saved.submission_status === "pending" && !saved.active ? [{ artwork: saved }] : [];
      const proposed = work.artwork;
      const imageSource = work.hasNewImage ? proposed : saved;
      return [{ ...work, current: saved, artwork: {
        ...saved, title: proposed.title, date: proposed.date, genre: proposed.genre, medium: proposed.medium,
        height: proposed.height, nsfw: proposed.nsfw,
        image: imageSource.image, image_width: imageSource.image_width, image_height: imageSource.image_height,
        width: Number((proposed.height * imageSource.width / imageSource.height).toFixed(2)),
      } }];
    });
    setWorks(remaining); setSelectedId(remaining[0] ? reviewId(remaining[0]) : "");
  }
  async function approve(metadata: ArtworkEditorMetadata) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(selected.changeId
        ? `/api/admin/artwork-changes/${selected.changeId}` : `/api/admin/artworks/${selected.artwork._id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(selected.changeId
          ? { ...metadata, expectedRevision: selected.revision ?? 0 } : { ...metadata, action: "approve" }),
      });
      const result = await response.json() as { artwork: ArtworkCatalogEntry; error?: string };
      if (!response.ok) throw new Error(result.error ?? "The artwork could not be accepted.");
      remove(reviewId(selected), result.artwork);
      router.refresh();
      return result.artwork;
    } finally { setBusy(false); }
  }
  async function deny() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(selected.changeId
        ? `/api/admin/artwork-changes/${selected.changeId}` : `/api/admin/artworks/${selected.artwork._id}`, {
        method: "DELETE",
        ...(selected.changeId ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision: selected.revision ?? 0 }),
        } : {}),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The submission could not be removed.");
      remove(reviewId(selected));
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The submission could not be removed."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="grid content-start gap-3">
      {!works.length ? <p>No pending artwork submissions.</p> : works.map(work =>
        <button aria-pressed={reviewId(work) === selectedId} className="rounded-lg border border-white/20 p-3 text-left aria-pressed:border-[var(--accent)]" disabled={busy} key={reviewId(work)} onClick={() => { setSelectedId(reviewId(work)); setError(""); }} type="button">
          <strong className="block">{work.artwork.title}</strong><span>{work.artwork.artist}</span>
          {work.changeId ? <span className="block text-sm text-[var(--accent)]">Proposed changes</span> : null}
        </button>)}
      {error ? <p className="text-red-400" role="alert">{error}</p> : null}
    </aside>
    <div className="min-w-0 space-y-5">
    {selected?.changeId ? <section className="space-y-3 rounded-lg border border-white/20 p-4">
      <h2 className="text-xl font-bold">Current artwork</h2>
      <p className="text-sm text-[var(--muted)]">Accepting applies the proposed image and details below without changing rarity, value scale, effects, or active status. Denying leaves the artwork unchanged.</p>
      {selected.current ? <>
        <Image alt={`Current image for ${selected.current.title}`}
          src={getArtworkImageUrl(selected.current._id, "card", selected.current.image, false, "admin")}
          className="max-h-64 h-auto w-full object-contain" width={720} height={480} unoptimized />
        <dl className="grid gap-2 sm:grid-cols-2">{([
          ["Title", selected.current.title], ["Date", selected.current.date], ["Genre or style", selected.current.genre],
          ["Medium", selected.current.medium], ["Height (cm)", selected.current.height], ["NSFW", selected.current.nsfw ? "Yes" : "No"],
        ] as const).map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}</dl>
      </> : <p role="alert">The original artwork was removed. Deny this request to discard it.</p>}
      <h2 className="text-xl font-bold">Proposed artwork</h2>
    </section> : null}
    {selected ? <ArtworkEditorPanel key={reviewId(selected)} mode="review" artwork={selected.artwork} artists={artists}
      rendererOptions={rendererOptions}
      imagePreviewUrl={selected.changeId && selected.hasNewImage ? `/api/admin/artwork-changes/${selected.changeId}/image` : undefined}
      allowImageUpload={!selected.changeId} showRarity={!selected.changeId}
      pending={busy} showActiveInGame={false} submitLabel={selected.changeId ? "Accept changes" : "Accept artwork"}
      deleteLabel={selected.changeId ? "Deny changes" : "Deny and delete submission"}
      onSave={approve} onDelete={() => void deny()}
      onUploaded={artwork => setWorks(current => current.map(work => reviewId(work) === reviewId(selected) ? { ...work, artwork } : work))} /> : null}
    </div>
  </div>;
}

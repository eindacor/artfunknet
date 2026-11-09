"use client";

import { useState, type FormEvent } from "react";
import ArtworkEditorPanel from "@/components/artwork-editor/artwork-editor-panel";
import type { ArtworkCatalogEntry, ArtworkEditorMetadata } from "@/components/artwork-editor/types";
import type { CardRendererId } from "@/components/item-cards/types";
import { ARTIST_AGREEMENT_VERSION, ARTIST_UPLOAD_AGREEMENT, type PublicArtistProfile } from "@/server/artist-types";
import { ARTIST_FEATURE_LINK_HELP } from "@/shared/artist-feature-link";

export type WorkSummary = {
  id: string;
  title: string;
  status: string;
  artwork: ArtworkCatalogEntry;
  pendingChange: boolean;
  proposedImage: boolean;
};
export default function ArtistWorkspace({ artist, initialWorks, rendererOptions }: {
  artist: PublicArtistProfile; initialWorks: WorkSummary[]; rendererOptions: { id: CardRendererId; name: string }[];
}) {
  const [agreed, setAgreed] = useState(false);
  const [works, setWorks] = useState(initialWorks);
  const [message, setMessage] = useState("");
  const [submittingId, setSubmittingId] = useState("");
  async function submit(metadata: ArtworkEditorMetadata, file: File | null) {
    if (!file || !agreed) throw new Error("Select an image and accept the submission agreement.");
    const body = new FormData();
    body.set("image", file);
    body.set("metadata", JSON.stringify({ ...metadata, agreementAccepted: true, agreementVersion: ARTIST_AGREEMENT_VERSION }));
    const response = await fetch("/api/artist/artworks", { method: "POST", body });
    const result = await response.json() as { artwork: ArtworkCatalogEntry; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Submission failed.");
    setWorks(current => [{ id: result.artwork._id, title: result.artwork.title, status: "Awaiting review",
      artwork: result.artwork, pendingChange: false, proposedImage: false }, ...current]);
    setAgreed(false);
    return result.artwork;
  }
  async function proposeChanges(work: WorkSummary, metadata: ArtworkEditorMetadata, file: File | null) {
    const body = new FormData();
    body.set("metadata", JSON.stringify({
      title: metadata.title, date: metadata.date, genre: metadata.genre, medium: metadata.medium,
      height: metadata.height, nsfw: metadata.nsfw,
    }));
    if (file) body.set("image", file);
    setSubmittingId(work.id);
    try {
      const response = await fetch(`/api/artist/artworks/${encodeURIComponent(work.id)}/changes`, { method: "POST", body });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The changes could not be submitted.");
      setWorks(current => current.map(currentWork => currentWork.id === work.id ? {
        ...currentWork,
        pendingChange: true,
        proposedImage: currentWork.proposedImage || Boolean(file),
        artwork: { ...currentWork.artwork, ...metadata },
      } : currentWork));
      setMessage(`${work.pendingChange ? "Updated the proposed changes" : "Submitted changes"} for ${work.title}. The current artwork has not changed.`);
      return undefined;
    } finally { setSubmittingId(""); }
  }
  return <div className="grid gap-10">
    <section className="space-y-5 rounded-xl border border-[var(--accent)]/40 p-5 sm:p-8" id="add-artwork">
      <label className="flex items-start gap-3 rounded-lg border border-white/20 p-4">
        <input className="mt-1" type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
        <span><strong>Artwork submission agreement</strong><span className="mt-2 block">{ARTIST_UPLOAD_AGREEMENT}</span></span>
      </label>
      <ArtworkEditorPanel mode="add" artistSubmission
        artists={[{ id: artist.id, name: artist.name, dateOfBirth: "", dateOfDeath: "", artworkCount: works.length }]}
        rendererOptions={rendererOptions} onSave={submit} />
    </section>
    <ArtistProfileForm artist={artist} />
    <section className="space-y-4"><h2 className="text-2xl font-bold">Your artwork</h2>
      <p className="text-sm text-[var(--muted)]">Propose changes to an image or its details. An administrator must accept them before the artwork is updated.</p>
      {message ? <p className="text-green-400" role="status">{message}</p> : null}
      {!works.length ? <p>No artwork submitted yet.</p> : <div className="grid gap-3">{works.map(work =>
        <details className="rounded-lg border border-white/20 open:border-[var(--accent)]/50" key={work.id}>
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
            <strong>{work.title}</strong>
            <span className="flex flex-wrap items-center gap-2">
              <span>{work.status}</span>
              {work.pendingChange ? <span className="rounded-full bg-[var(--accent)]/15 px-2 py-1 text-xs font-bold text-[var(--accent)]">
                Proposed changes awaiting review
              </span> : null}
            </span>
          </summary>
          <div className="border-t border-white/10 p-4 sm:p-5">
            <ArtworkEditorPanel key={`${work.id}-${work.pendingChange ? "pending" : "current"}`}
              mode="edit" artistSubmission artwork={work.artwork}
              pending={submittingId === work.id}
              imagePreviewUrl={work.proposedImage
                ? `/api/artist/artworks/${encodeURIComponent(work.id)}/changes/image`
                : `/api/artist/artworks/${encodeURIComponent(work.id)}/image`}
              artists={[{ id: artist.id, name: artist.name, dateOfBirth: "", dateOfDeath: "", artworkCount: works.length }]}
              rendererOptions={rendererOptions}
              submitLabel={work.pendingChange ? "Update proposed changes" : "Submit changes for review"}
              onSave={(metadata, file) => proposeChanges(work, metadata, file)} />
          </div>
        </details>)}</div>}
    </section>
  </div>;
}

function ArtistProfileForm({ artist }: { artist: PublicArtistProfile }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/artist/profile", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioUrl: form.get("portfolioUrl"), featureLink: form.get("featureLink"), bio: form.get("bio"),
          socialLinks: Object.fromEntries(["instagram", "facebook", "bluesky", "youtube"].map(kind => [kind, form.get(kind)])) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Profile update failed.");
      setMessage("Artist profile saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Profile update failed."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4" id="artist-profile">
    <h2 className="text-2xl font-bold">Artist profile and social links</h2>
    <p className="text-[var(--muted)]">These details are shown in your artist gallery. Sync Instagram in Account settings to enable an optional public-profile embed.
      {artist.instagramUsername ? ` Connected Instagram: @${artist.instagramUsername}.` : ""}</p>
    <form className="grid max-w-3xl gap-4" onSubmit={save}>
      <fieldset className="grid gap-4" disabled={busy}>
        <label className="grid gap-2">Portfolio website URL<input className="rounded border border-white/20 bg-white/5 p-3" defaultValue={artist.portfolioUrl} name="portfolioUrl" type="url" required /></label>
        <label className="grid gap-2">Feature link (optional)<input className="rounded border border-white/20 bg-white/5 p-3" defaultValue={artist.featureLink} name="featureLink" type="url" maxLength={2048} placeholder="https://..." aria-describedby="feature-link-help" /></label>
        <p className="text-sm text-[var(--muted)]" id="feature-link-help">{ARTIST_FEATURE_LINK_HELP} Leave blank to remove it from your gallery.</p>
        <label className="grid gap-2">Bio<textarea className="rounded border border-white/20 bg-white/5 p-3" defaultValue={artist.bio} maxLength={5000} name="bio" rows={5} /></label>
        {(["instagram", "facebook", "bluesky", "youtube"] as const).map(kind => <label className="grid gap-2 capitalize" key={kind}>
          {kind} URL (optional)<input className="rounded border border-white/20 bg-white/5 p-3" name={kind} type="url" defaultValue={artist.socialLinks[kind] ?? ""} placeholder="https://..." />
        </label>)}
        <button className="justify-self-start rounded bg-[var(--accent)] px-4 py-2 font-bold text-black" type="submit">{busy ? "Saving..." : "Save artist profile"}</button>
      </fieldset>
      {message ? <p className="text-green-400" role="status">{message}</p> : null}
      {error ? <p className="text-red-400" role="alert">{error}</p> : null}
    </form>
  </section>;
}

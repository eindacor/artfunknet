"use client";

import { useState, type FormEvent } from "react";
import ArtworkEditorPanel from "@/components/artwork-editor/artwork-editor-panel";
import type { ArtworkCatalogEntry, ArtworkEditorMetadata } from "@/components/artwork-editor/types";
import type { CardRendererId } from "@/components/item-cards/types";
import { ARTIST_AGREEMENT_VERSION, ARTIST_UPLOAD_AGREEMENT, type PublicArtistProfile } from "@/server/artist-types";

type WorkSummary = { id: string; title: string; status: string };
export default function ArtistWorkspace({ artist, initialWorks, rendererOptions }: {
  artist: PublicArtistProfile; initialWorks: WorkSummary[]; rendererOptions: { id: CardRendererId; name: string }[];
}) {
  const [agreed, setAgreed] = useState(false);
  const [works, setWorks] = useState(initialWorks);
  async function submit(metadata: ArtworkEditorMetadata, file: File | null) {
    if (!file || !agreed) throw new Error("Select an image and accept the submission agreement.");
    const body = new FormData();
    body.set("image", file);
    body.set("metadata", JSON.stringify({ ...metadata, agreementAccepted: true, agreementVersion: ARTIST_AGREEMENT_VERSION }));
    const response = await fetch("/api/artist/artworks", { method: "POST", body });
    const result = await response.json() as { artwork: ArtworkCatalogEntry; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Submission failed.");
    setWorks(current => [{ id: result.artwork._id, title: result.artwork.title, status: "Awaiting review" }, ...current]);
    setAgreed(false);
    return result.artwork;
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
      {!works.length ? <p>No artwork submitted yet.</p> : <ul className="grid gap-3">{works.map(work =>
        <li className="flex flex-wrap justify-between gap-3 rounded-lg border border-white/20 p-4" key={work.id}>
          <strong>{work.title}</strong><span>{work.status}</span>
        </li>)}</ul>}
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
        body: JSON.stringify({ portfolioUrl: form.get("portfolioUrl"), bio: form.get("bio"),
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

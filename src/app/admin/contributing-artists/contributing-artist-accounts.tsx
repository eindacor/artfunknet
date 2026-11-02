"use client";

import { useState } from "react";
import { MAX_FEATURED_ARTISTS } from "@/server/artist-types";

type ArtistAccountView = { playerId: string; name: string; screenName: string; portfolioUrl: string; featured: boolean; active: boolean };
export default function ContributingArtistAccounts({ artists }: { artists: ArtistAccountView[] }) {
  const [accounts, setAccounts] = useState(artists);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const count = accounts.filter(artist => artist.featured).length;
  async function toggle(artist: ArtistAccountView) {
    setBusy(artist.playerId); setError("");
    try {
      const response = await fetch(`/api/admin/contributing-artists/${artist.playerId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ featured: !artist.featured }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The featured setting could not be saved.");
      setAccounts(current => current.map(account => account.playerId === artist.playerId ? { ...account, featured: !account.featured } : account));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The featured setting could not be saved."); }
    finally { setBusy(null); }
  }
  return <section className="grid gap-4">
    <p>{count} / {MAX_FEATURED_ARTISTS} featured artists</p>
    {error ? <p className="text-red-400" role="alert">{error}</p> : null}
    {!accounts.length ? <p>No contributing artist accounts yet.</p> : accounts.map(artist => <article className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/20 p-5" key={artist.playerId}>
      <div className="space-y-2"><h2 className="text-xl font-bold">{artist.name}</h2><p>@{artist.screenName}{artist.active ? "" : " (inactive account)"}</p>
        <a className="font-bold text-[var(--accent)] underline" href={artist.portfolioUrl} target="_blank" rel="noopener noreferrer">Portfolio</a>{" | "}
        <a className="text-[var(--accent)] underline" href={`/play?gallery=${encodeURIComponent(artist.playerId)}`}>Visit artist gallery</a></div>
      <label className="flex gap-3"><input type="checkbox" checked={artist.featured}
        disabled={busy !== null || (!artist.featured && (!artist.active || count >= MAX_FEATURED_ARTISTS))}
        onChange={() => void toggle(artist)} />Featured</label>
    </article>)}
  </section>;
}

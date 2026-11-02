"use client";

import { useState } from "react";

type ApplicationView = {
  id: string; name: string; email: string; dateOfBirth: string; portfolioUrl: string;
  bio: string; screenName: string; existingPlayer: boolean; submittedAt: string | null; status: string;
};

export default function ApplicationReviews({ applications }: { applications: ApplicationView[] }) {
  const [pending, setPending] = useState(applications);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function review(id: string, action: "approve" | "deny") {
    setBusy(id); setError("");
    try {
      const response = await fetch(`/api/admin/artist-applications/${id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Review failed.");
      setPending(current => current.filter(application => application.id !== id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Review failed."); }
    finally { setBusy(null); }
  }
  return <div className="grid gap-5">
    {error ? <p className="text-red-400" role="alert">{error}</p> : null}
    {!pending.length ? <p>No pending artist applications.</p> : pending.map(application => <article className="space-y-4 rounded-lg border border-white/20 p-6" key={application.id}>
      <h2 className="text-2xl font-bold">{application.name}</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-[var(--muted)]">Email</dt><dd className="break-all">{application.email}</dd></div>
        <div><dt className="text-[var(--muted)]">Date of birth</dt><dd>{application.dateOfBirth}</dd></div>
        <div><dt className="text-[var(--muted)]">Player</dt><dd>{application.screenName} ({application.existingPlayer ? "existing player" : "new account on approval"})</dd></div>
        <div><dt className="text-[var(--muted)]">Submitted</dt><dd>{application.submittedAt ? new Date(application.submittedAt).toLocaleDateString() : "Unknown"}</dd></div>
      </dl>
      <a className="inline-block break-all rounded-md border border-[var(--accent)] px-4 py-2 font-bold text-[var(--accent)]" href={application.portfolioUrl} target="_blank" rel="noopener noreferrer">Open portfolio: {application.portfolioUrl}</a>
      {application.bio ? <p className="whitespace-pre-wrap">{application.bio}</p> : null}
      {application.status === "approving" ? <p className="text-sm text-[var(--muted)]">Approval is processing. If interrupted, retry after two minutes.</p> : null}
      <div className="flex gap-4">
        <button className="rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-black disabled:opacity-50" disabled={busy !== null} onClick={() => void review(application.id, "approve")} type="button">{busy === application.id ? "Processing..." : "Approve"}</button>
        <button className="rounded-md border border-red-400 px-4 py-2 text-red-300 disabled:opacity-50" disabled={busy !== null || application.status === "approving"} onClick={() => void review(application.id, "deny")} type="button">Deny and delete application</button>
      </div>
    </article>)}
  </div>;
}

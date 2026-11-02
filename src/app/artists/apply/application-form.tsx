"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import DatePicker from "@/components/date-picker";

export default function ArtistApplicationForm({ existingPlayer, latestBirthDate, pending = false }: {
  existingPlayer: { email: string; screenName: string } | null;
  latestBirthDate: string;
  pending?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/artist-applications", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The application could not be submitted.");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The application could not be submitted.");
    } finally { setBusy(false); }
  }
  const existingAccountFields = existingPlayer ? <section className="grid gap-4 rounded-lg border border-[var(--accent)] p-5">
    <h2 className="text-xl font-bold">Applying with your existing player account</h2>
    <p>You are already signed in. Approval adds artist access to this same account; no new account or password is created. Keep using your existing login.</p>
    <Field label="Email" name="email" type="email" autoComplete="email" value={existingPlayer.email} disabled />
    <Field label="In-game username" name="screenName" autoComplete="nickname" value={existingPlayer.screenName} disabled />
    <p className="text-sm text-[var(--muted)]">These account details are filled in automatically and cannot be changed on this application.</p>
  </section> : null;
  if (sent || pending) return <section className="space-y-4 rounded-lg border border-[var(--accent)] p-6" role="status">
    <h2 className="text-xl font-bold">{pending ? "Application awaiting review" : "Application received"}</h2>
    <p>Your application is awaiting admin review. {existingPlayer
      ? "Once approved, Artist studio will be available from Account settings and when you sign in."
      : "Once approved, sign in with the email and password you chose to open your Artist studio."}</p>
    {existingAccountFields}
    <Link className="font-bold text-[var(--accent)] underline" href={existingPlayer ? "/play/account" : "/play/login"}>
      {existingPlayer ? "Back to Account settings" : "Go to sign in"}
    </Link>
  </section>;
  return <form className="grid gap-5" onSubmit={submit}>
    <fieldset className="grid gap-5" disabled={busy}>
      {existingAccountFields}
      <Field label="Artist name" name="name" autoComplete="name" maxLength={120} required />
      {!existingPlayer ? <>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <p className="text-sm text-[var(--muted)]">
          Already play artfunkel? <Link className="text-[var(--accent)] underline" href="/play/login">Log in</Link> and
          select &quot;Become a contributing artist&quot; in Account settings. Your existing account will be kept.
        </p>
      </> : null}
      <DatePicker label="Date of birth (18+)" name="dateOfBirth" min="1900-01-01" max={latestBirthDate} autoComplete="bday" required />
      <Field label="Portfolio website URL" name="portfolioUrl" type="url" placeholder="https://..." required />
      <label className="grid gap-2"><span className="font-semibold">Bio (optional)</span>
        <textarea className="rounded-md border border-white/20 bg-white/5 px-3 py-2" maxLength={5000} name="bio" rows={5} /></label>
      {!existingPlayer ? <section className="grid gap-4 rounded-lg border border-white/20 p-5">
        <h2 className="text-xl font-bold">Your player account</h2>
        <p className="text-sm text-[var(--muted)]">Your in-game username can differ from your artist name. Your account is created only after approval.</p>
        <Field label="In-game username" name="screenName" minLength={3} maxLength={24} autoComplete="nickname" required />
        <Field label="Password" name="password" type="password" minLength={12} autoComplete="new-password" required />
        <Field label="Confirm password" name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required />
      </section> : null}
      <p className="text-sm text-[var(--muted)]">Your application is private to administrators. Approved artist names, bios, portfolio and social links appear in your artist gallery; dates of birth and emails are not published.</p>
      <button className="rounded-md bg-[var(--accent)] px-4 py-3 font-bold text-black disabled:opacity-50" type="submit">
        {busy ? "Submitting..." : "Submit artist application"}
      </button>
    </fieldset>
    {error ? <p className="text-red-400" role="alert">{error}</p> : null}
  </form>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-2"><span className="font-semibold">{label}</span>
    <input className="rounded-md border border-white/20 bg-white/5 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-70" {...props} /></label>;
}

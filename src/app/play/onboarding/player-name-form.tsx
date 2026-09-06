"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function PlayerNameForm({
  suggestedName,
}: {
  suggestedName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/player/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screenName: form.get("screenName") }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "The player name could not be saved.");
      setSubmitting(false);
      return;
    }

    router.replace("/play");
    router.refresh();
  }

  return (
    <form
      className="grid gap-5 rounded-lg border border-white/15 bg-white/5 p-6"
      onSubmit={submit}
    >
      <label className="grid gap-2">
        <span className="font-semibold">Player name</span>
        <input
          autoComplete="nickname"
          autoFocus
          className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
          defaultValue={suggestedName}
          maxLength={24}
          minLength={3}
          name="screenName"
          required
        />
        <small className="text-[var(--muted)]">
          Use 3-24 letters, numbers, underscores, or hyphens.
        </small>
      </label>
      {error ? (
        <p aria-live="assertive" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button
        className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Saving..." : "Enter the gallery"}
      </button>
    </form>
  );
}

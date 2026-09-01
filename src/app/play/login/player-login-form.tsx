"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function PlayerLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/player/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "Login failed.");
      setSubmitting(false);
      return;
    }

    router.push("/play");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Email</span>
        <input
          className="rounded-md border border-white/20 bg-white/5 px-3 py-2"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Password</span>
        <input
          className="rounded-md border border-white/20 bg-white/5 px-3 py-2"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="text-red-400">{error}</p> : null}
      <button
        className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Signing in..." : "Enter gallery"}
      </button>
    </form>
  );
}

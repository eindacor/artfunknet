"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginProvider = "discord" | "google" | "microsoft" | "steam";

const PROVIDERS: {
  id: LoginProvider;
  label: string;
}[] = [
  { id: "google", label: "Continue with Google" },
  { id: "discord", label: "Continue with Discord" },
  { id: "microsoft", label: "Continue with Microsoft" },
  { id: "steam", label: "Sign in through Steam" },
];

export default function PlayerLoginForm({
  providers,
}: {
  providers: Record<LoginProvider, boolean>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registering, setRegistering] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (
      registering &&
      password !== String(form.get("confirmPassword") ?? "")
    ) {
      setError("The passwords do not match.");
      setSubmitting(false);
      return;
    }

    const response = await fetch(
      registering
        ? "/api/auth/player/register"
        : "/api/auth/player/login",
      {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password,
        screenName: form.get("screenName"),
      }),
      },
    );

    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(
        result.error ?? (registering ? "Registration failed." : "Login failed."),
      );
      setSubmitting(false);
      return;
    }

    router.push("/play");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <div className="grid grid-cols-2 rounded-md border border-white/20 p-1">
        <button
          className={`rounded px-3 py-2 font-semibold ${
            !registering ? "bg-[var(--accent)] text-black" : ""
          }`}
          onClick={() => {
            setRegistering(false);
            setError("");
          }}
          type="button"
        >
          Sign in
        </button>
        <button
          className={`rounded px-3 py-2 font-semibold ${
            registering ? "bg-[var(--accent)] text-black" : ""
          }`}
          onClick={() => {
            setRegistering(true);
            setError("");
          }}
          type="button"
        >
          Create account
        </button>
      </div>
      {registering ? (
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Player name</span>
          <input
            className="rounded-md border border-white/20 bg-white/5 px-3 py-2"
            maxLength={24}
            minLength={3}
            name="screenName"
            autoComplete="nickname"
            required
          />
        </label>
      ) : null}
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
          autoComplete={registering ? "new-password" : "current-password"}
          minLength={registering ? 12 : undefined}
          required
        />
      </label>
      {registering ? (
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Confirm password</span>
          <input
            className="rounded-md border border-white/20 bg-white/5 px-3 py-2"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
      ) : null}
      {error ? <p className="text-red-400">{error}</p> : null}
      <button
        className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting
          ? registering
            ? "Creating account..."
            : "Signing in..."
          : registering
            ? "Create account"
            : "Enter gallery"}
      </button>
      <div className="relative py-1 text-center text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        <span className="bg-[#19171d] px-3">or</span>
      </div>
      {PROVIDERS.filter((provider) => providers[provider.id]).map(
        (provider) => (
          <a
            className="rounded-md border border-white/20 px-4 py-2 text-center font-semibold hover:border-[var(--accent)]"
            href={`/api/auth/player/${provider.id}`}
            key={provider.id}
          >
            {provider.label}
          </a>
        ),
      )}
    </form>
  );
}

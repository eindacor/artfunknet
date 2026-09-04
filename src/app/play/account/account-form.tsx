"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountForm({
  email,
  hasPassword,
  screenName,
}: {
  email: string;
  hasPassword: boolean;
  screenName: string;
}) {
  const router = useRouter();
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/player/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "profile",
        screenName: form.get("screenName"),
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      screenName?: string;
    };
    setProfileMessage(
      response.ok ? "Player name updated." : result.error ?? "Update failed.",
    );
    setProfileBusy(false);
    if (response.ok) router.refresh();
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) {
      setPasswordMessage("The new passwords do not match.");
      setPasswordBusy(false);
      return;
    }
    const response = await fetch("/api/auth/player/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "password",
        currentPassword: form.get("currentPassword"),
        newPassword,
      }),
    });
    const result = (await response.json()) as { error?: string };
    setPasswordMessage(
      response.ok ? "Password updated." : result.error ?? "Update failed.",
    );
    setPasswordBusy(false);
    if (response.ok) formElement.reset();
  }

  return (
    <div className="grid gap-8">
      <section className="rounded-lg border border-white/15 bg-white/5 p-6">
        <h2 className="text-xl font-bold">Profile</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{email}</p>
        <form className="mt-5 grid gap-4" onSubmit={updateProfile}>
          <label className="grid gap-2">
            <span className="font-semibold">Player name</span>
            <input
              className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
              defaultValue={screenName}
              maxLength={24}
              minLength={3}
              name="screenName"
              required
            />
          </label>
          {profileMessage ? (
            <p aria-live="polite" className="text-sm">
              {profileMessage}
            </p>
          ) : null}
          <button
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60"
            disabled={profileBusy}
            type="submit"
          >
            {profileBusy ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-white/15 bg-white/5 p-6">
        <h2 className="text-xl font-bold">
          {hasPassword ? "Change password" : "Add a password"}
        </h2>
        <form className="mt-5 grid gap-4" onSubmit={updatePassword}>
          {hasPassword ? (
            <label className="grid gap-2">
              <span className="font-semibold">Current password</span>
              <input
                className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
          ) : null}
          <label className="grid gap-2">
            <span className="font-semibold">New password</span>
            <input
              className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
              minLength={12}
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          <label className="grid gap-2">
            <span className="font-semibold">Confirm new password</span>
            <input
              className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
              minLength={12}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          {passwordMessage ? (
            <p aria-live="polite" className="text-sm">
              {passwordMessage}
            </p>
          ) : null}
          <button
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60"
            disabled={passwordBusy}
            type="submit"
          >
            {passwordBusy ? "Saving..." : "Save password"}
          </button>
        </form>
      </section>
    </div>
  );
}

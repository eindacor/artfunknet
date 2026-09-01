"use client";

import { useRouter } from "next/navigation";

export default function AdminHeader({ email }: { email: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
      <div>
        <p className="font-bold text-[var(--accent)]">Artfunkel admin</p>
        <p className="text-sm text-[var(--muted)]">{email}</p>
      </div>
      <nav className="flex gap-4 text-sm">
        <a href="/admin">Gameplay</a>
        <a href="/admin/artwork">Artwork intake</a>
      </nav>
      <button
        className="rounded-md border border-white/20 px-3 py-2 text-sm"
        onClick={logout}
        type="button"
      >
        Sign out
      </button>
    </header>
  );
}

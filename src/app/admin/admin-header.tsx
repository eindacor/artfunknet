"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminHeader({ email }: { email: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Gameplay config" },
    { href: "/admin/game-state", label: "Game state" },
    { href: "/admin/artwork", label: "Artwork intake" },
    { href: "/admin/catalog", label: "Catalog" },
    { href: "/admin/legendary-attributes", label: "Legendary attributes" },
    { href: "/admin/card-designs", label: "Card designs" },
    { href: "/admin/test-players", label: "Test players" },
    { href: "/admin/player-accounts", label: "Player accounts" },
    { href: "/admin/database", label: "Database" },
  ];

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
      <nav className="flex flex-wrap justify-center gap-4 text-sm">
        {links.map((link) => {
          const current = pathname === link.href;
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={current ? "font-bold text-[var(--accent)]" : ""}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
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

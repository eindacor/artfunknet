"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AdminReviewCounts } from "@/server/admin-review-counts";

export default function AdminHeader({ email, reviewCounts = {
  artistApplications: 0,
  artworkSubmissions: 0,
  chatReports: 0,
} }: { email: string; reviewCounts?: AdminReviewCounts }) {
  const router = useRouter();
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Gameplay config" },
    { href: "/admin/loot-pool", label: "Loot pool" },
    { href: "/admin/game-state", label: "Game state" },
    { href: "/admin/metrics", label: "Metrics" },
    { href: "/admin/lottery", label: "Lottery" },
    { href: "/admin/forgery-contest", label: "Forgery contest" },
    { href: "/admin/live-auction", label: "Live auction" },
    { href: "/admin/items", label: "Item creator" },
    { href: "/admin/artfunkel-inventory", label: "Artfunkel inventory" },
    { href: "/admin/catalog", label: "Catalog" },
    { href: "/admin/add-artwork", label: "Add artwork" },
    { href: "/admin/artist-applications", label: "Artist applications", count: reviewCounts.artistApplications },
    { href: "/admin/artwork-submissions", label: "Artwork submissions", count: reviewCounts.artworkSubmissions },
    { href: "/admin/contributing-artists", label: "Contributing artists" },
    { href: "/admin/unique-effects", label: "Unique effects" },
    { href: "/admin/card-designs", label: "Card designs" },
    { href: "/admin/test-players", label: "Test players" },
    { href: "/admin/player-accounts", label: "Player accounts" },
    { href: "/admin/chat-reports", label: "Chat reports", count: reviewCounts.chatReports },
    { href: "/admin/hall-of-fame", label: "Hall of fame" },
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
              className={`inline-flex items-center gap-1.5 ${current ? "font-bold text-[var(--accent)]" : ""}`}
              href={link.href}
              key={link.href}
            >
              {link.label}
              {link.count ? <span
                aria-label={`${link.count} pending ${link.label.toLowerCase()}`}
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-xs font-bold text-black"
              >
                {link.count > 99 ? "99+" : link.count}
              </span> : null}
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

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminHeader({ email }: { email: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Gameplay" },
    { href: "/admin/artwork", label: "Artwork intake" },
    { href: "/admin/legendary-attributes", label: "Legendary attributes" },
    { href: "/admin/test-players", label: "Test players" },
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
      <nav className="flex gap-4 text-sm">
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

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
        Artfunkel
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        The gallery is reopening.
      </h1>
      <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
        The modern application shell is running. MongoDB connectivity is
        available through the server API and the original game systems remain
        in the repository while they are migrated.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black"
          href="/play/login"
        >
          Player sign in
        </a>
        <a
          className="rounded-md border border-white/20 px-4 py-2 font-semibold"
          href="/login"
        >
          Admin sign in
        </a>
        <a
          className="rounded-md border border-white/20 px-4 py-2 font-semibold"
          href="/api/health"
        >
          Check server health
        </a>
      </div>
    </main>
  );
}

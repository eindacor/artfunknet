export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="game-title text-sm font-semibold text-[var(--accent)]">
        artfunkel
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black welcome-button"
          href="/play/login"
        >
          Player sign in
        </a>
        <a
          className="rounded-md border border-white/20 px-4 py-2 font-semibold welcome-button"
          href="/login"
        >
          Admin sign in
        </a>
      </div>
    </main>
  );
}

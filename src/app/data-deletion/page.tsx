import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "User data deletion | artfunkel",
  description: "How to delete your artfunkel account and connected Instagram or other provider information.",
};

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-3">
        <Link className="font-semibold text-[var(--accent)]" href="/play/login">artfunkel</Link>
        <h1 className="text-4xl font-bold">User data deletion instructions</h1>
        <p className="text-[var(--muted)]">These instructions are public and include connected Instagram/Meta account data.</p>
      </header>
      {deleted === "1" ? (
        <p className="rounded-lg border border-white/20 p-4" role="status">
          Your artfunkel account and associated live game data have been deleted. You have been signed out.
        </p>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Delete through the game</h2>
        <ol className="list-decimal space-y-3 pl-6">
          <li>Sign in to the artfunkel account you want to delete.</li>
          <li>Open <Link className="text-[var(--accent)] underline" href="/play/account">Account settings</Link> and select Delete account.</li>
          <li>Read the confirmation dialog, then type <strong>DELETE MY ACCOUNT</strong> exactly.</li>
          <li>Select Delete account permanently. Wait for the deletion confirmation and sign-out.</li>
        </ol>
        <p>
          Deletion is blocked if you are selling or winning an active auction,
          including the live auction event, or an auction is still settling.
          Wait until those obligations finish. A new-era operation must also
          finish first. Game requests briefly pause while deletion completes.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">What deletion does</h2>
        <p>
          This is permanent. It removes your player profile, account IDs, email
          addresses, usernames, password credentials, linked sign-in and
          Instagram identifiers, stored Patreon authorization, settings, and
          associated live game data. Every item you own is removed, including
          unclaimed items, offers, featured works, and permanent collection items.
          Your galleries and gallery metadata, visitors, quests, archives,
          playthrough snapshots, notifications, event entries, and authored chat
          messages are removed. Identifying references in shared histories are
          removed or replaced with [redacted], without deleting other players&apos;
          accounts or their current items.
        </p>
        <p>
          If you are a contributing artist, deletion also removes your artist
          applications and player-account links. Your approved artist catalog
          record, uploaded artwork, and submission agreement remain under the
          artwork-use agreement; other players keep their copies. Request
          artwork or artist-record removal from artfunkelgame@gmail.com so an
          administrator can handle the separate removal process.
        </p>
        <p>
          Your old sessions no longer grant access after deletion. If an error
          interrupts cleanup after it starts, the account is locked for deletion rather than
          restored for play. Retry the Delete account action from Account settings
          to finish, or contact us. A failure message is not a deletion confirmation.
        </p>
        <p>
          Backups may retain older information until manually deleted by the
          operator; there is no automatic backup expiry schedule. Hosting logs
          and copies already held by independent providers or visitors are
          outside the in-game deletion process. Deletion does not delete your
          Facebook, Instagram, or other provider accounts and does not cancel
          Patreon billing. You can also remove artfunkel authorization in the
          connected provider&apos;s account settings.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">If you cannot sign in</h2>
        <p>
          Email <a className="text-[var(--accent)] underline" href="mailto:artfunkelgame@gmail.com">artfunkelgame@gmail.com</a>{" "}
          with the subject &quot;artfunkel data deletion request&quot; and your
          player name or linked account identifier so we can locate the account.
          We may request proof of control before deleting data. Do not send a
          password or access token. Requests involving backups or logs require
          operator review; sending an email is not an automatic deletion confirmation.
        </p>
        <Link className="text-[var(--accent)] underline" href="/privacy">Read the privacy policy</Link>
      </section>
    </main>
  );
}

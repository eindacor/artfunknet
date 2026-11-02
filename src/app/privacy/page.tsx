import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy | artfunkel",
  description: "What artfunkel collects, how it uses account information, and how to request deletion.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-3">
        <Link className="font-semibold text-[var(--accent)]" href="/play/login">artfunkel</Link>
        <h1 className="text-4xl font-bold">Privacy policy</h1>
        <p className="text-[var(--muted)]">
          This policy describes the artfunkel game and its connected-account features.
          You do not need an account to read this page or the deletion instructions.
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Information we collect</h2>
        <p>
          We store your game account ID, email addresses when supplied, username,
          player display name, account and verification dates, linked-provider
          account IDs, and account settings. Email/password accounts store a
          salted password hash, not the plaintext password.
        </p>
        <p>
          We also store gameplay information: inventory and item history, featured
          and permanent collections, gallery settings and metadata, progression,
          balances, auctions and bids, visitors and quests, archives, achievements,
          event entries, notifications, chat messages and reports, and reactions.
          Requests and errors may appear in operational or hosting logs, including
          request metadata and account identifiers.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Artist applications and contributed artwork</h2>
        <p>
          Artist applications collect your name, email, date of birth, required
          portfolio URL, and optional bio. New applicants also choose player
          credentials; only a salted password hash is saved while the application
          awaits review. Existing players apply using their stored account details.
          Applicants must be 18 or older. Administrators review applications;
          dates of birth, application emails, and password hashes are not published.
          Denied applications are removed.
        </p>
        <p>
          Approved artist names, bios, portfolio and social links, and approved
          artwork may appear in artist galleries and the game. We save the
          artwork submission agreement, its version, and acceptance date.
          Under that agreement, the artist record and uploaded artwork are
          retained after player-account deletion and may continue to be used
          until the artist requests removal through an administrator.
          Contact artfunkelgame@gmail.com for artwork or artist-record removal requests.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Connected accounts, Facebook, and Instagram</h2>
        <p>
          When you choose a sign-in or sync provider, we receive an account
          identifier and, where available, a name, email address, and email
          verification status from Google, Discord, or Microsoft. Steam supplies
          a Steam account identifier. Providers do not give us your password.
        </p>
        <p>
          Instagram authorization uses Meta&apos;s Instagram Login for professional
          business and creator accounts with the instagram_business_basic
          permission. We request the Instagram account ID/user ID, username,
          name, and account type to verify the account and link it to your
          artfunkel player. We store the linked identifier and verification
          dates and username; the returned name or username may initialize a new player&apos;s
          display name. Instagram does not provide an email address through this flow.
        </p>
        <p>
          We do not currently offer separate Facebook-account login, request a
          Facebook profile, friends list, or posts, or use this Instagram
          connection to read or publish photos, videos, comments, or messages.
          Sign-in-provider access tokens are used during verification and are
          not retained as ongoing game credentials.
        </p>
        <p>
          If you link Patreon, we store its account ID, available email,
          membership/supporter and tier information, and synchronization dates.
          Unlike sign-in-provider tokens, Patreon access and refresh tokens are
          stored encrypted so we can refresh supporter benefits.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">How we use and store information</h2>
        <p>
          We use this information to authenticate you, connect accounts you
          explicitly authorize, save and operate the game, show galleries and
          community activity, apply supporter benefits, prevent account conflicts
          and abuse, moderate reports, and diagnose problems. Linking an account
          does not automatically merge different players.
        </p>
        <p>
          Account and gameplay records are stored in the application&apos;s MongoDB
          database. Artwork assets use application storage or configured object
          storage. Session cookies keep you signed in; short-lived authorization
          cookies protect provider connections. We retain game account records
          until deletion is completed. Access is limited through application
          authentication and server/operator controls; no system can promise
          absolute security.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Public information and third parties</h2>
        <p>
          Player display names, shared galleries and collections, auction
          activity, rankings and event results, and posted community content
          can be visible to other players or public visitors. Email addresses,
          password hashes, and linked-account credentials are not published as
          part of those features.
        </p>
        <p>
          We do not sell your personal information. Hosting, database, storage,
          and email/support service providers may process information needed to
          provide their services. A connected provider receives the authorization
          requests you choose to make and processes them under its own policy.
          Information may also be disclosed where legally required. Contacting
          us by email sends your message through the relevant email providers.
          Artist galleries can offer an optional Instagram profile embed for a
          synced account. No Instagram embed is loaded until you choose to load
          it. Doing so connects your browser to Instagram under Meta&apos;s policies;
          embedding depends on the artist&apos;s public-profile settings.
          Opening an embedded stream or loading artwork from an external asset
          host also sends normal browser request information to that service.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Deletion and contact</h2>
        <p>
          You can initiate deletion in <Link className="text-[var(--accent)] underline" href="/play/account">Account settings</Link>.
          Completed deletion removes your player record, stored account
          connections and credentials, all items you own in every state,
          gallery metadata, and associated game records from the live database.
          Identifying references in shared game history are removed or redacted.
          You cannot delete while selling or winning active auctions or while
          auction settlement is still pending.
        </p>
        <p>
          Existing database backups are separate historical copies. They can
          retain older information until the operator manually deletes them;
          they do not have an automatic expiry schedule. Hosting/operational logs
          and data already held independently by providers or other visitors
          are not erased by the in-game database deletion.
          Deleting artfunkel does not delete your provider accounts or cancel
          a Patreon membership.
        </p>
        <p>
          For the full process, including requests when you cannot sign in, see{" "}
          <Link className="text-[var(--accent)] underline" href="/data-deletion">user data deletion instructions</Link>.
          For privacy questions or deletion requests, email{" "}
          <a className="text-[var(--accent)] underline" href="mailto:artfunkelgame@gmail.com">artfunkelgame@gmail.com</a>.
        </p>
      </section>
    </main>
  );
}

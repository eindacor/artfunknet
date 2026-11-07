"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

const SUPPORTER_STATUSES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

type SupporterStatus = (typeof SUPPORTER_STATUSES)[number];

const SUPPORTER_STATUS_COLORS: Record<SupporterStatus, string> = {
  common: "#39b54a",
  uncommon: "#3e7bff",
  rare: "#e1c429",
  legendary: "#ff8a1f",
  masterpiece: "#42e8f5",
};

type PlayerAccountView = {
  id: string;
  email: string;
  screenName: string;
  active: boolean;
  artistId: string | null;
  artistName: string | null;
  hasPassword: boolean;
  hasOAuth: boolean;
  supporterStatus: SupporterStatus | null;
  supporterOverride: SupporterStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: unknown;
};

export type AccountArtistOption = { id: string; name: string; playerId: string | null };
type AccountSearchResult = Pick<PlayerAccountView, "id" | "email" | "screenName" | "active" | "artistId">;
type AccountAction = "reset-password" | "set-supporter-override" | "link-artist" | "create-artist";
const INPUT_CLASS = "w-full rounded-md border border-white/30 bg-black/30 px-3 py-2 text-white focus:border-[var(--accent)]";

export default function PlayerAccountAdmin({ initialArtists }: { initialArtists: AccountArtistOption[] }) {
  const [account, setAccount] = useState<PlayerAccountView | null>(null);
  const [query, setQuery] = useState("");
  const searchQuery = useRef("");
  const [results, setResults] = useState<{ query: string; accounts: AccountSearchResult[] } | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayer = useRef<string | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [artists, setArtists] = useState(initialArtists);
  const [artistId, setArtistId] = useState("");
  const [showArtistCreator, setShowArtistCreator] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingAction, setSavingAction] = useState<AccountAction | null>(null);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const busy = savingAction !== null;

  useEffect(() => {
    const search = query.trim();
    if (!search) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/player-accounts?q=${encodeURIComponent(search)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json() as { accounts?: AccountSearchResult[]; error?: string };
        if (!response.ok || !result.accounts) throw new Error(result.error ?? "Player search failed.");
        if (!controller.signal.aborted && searchQuery.current === search) setResults({ query: search, accounts: result.accounts });
      } catch (caught) {
        if (!controller.signal.aborted && searchQuery.current === search) setError(caught instanceof Error ? caught.message : "Player search failed.");
      } finally {
        if (!controller.signal.aborted && searchQuery.current === search) setSearching(false);
      }
    }, 200);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (!selectedPlayerId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/player-accounts?id=${encodeURIComponent(selectedPlayerId)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json() as { account?: PlayerAccountView; error?: string };
        if (!response.ok || !result.account) throw new Error(result.error ?? "The player account could not be loaded.");
        if (!controller.signal.aborted && selectedPlayer.current === selectedPlayerId) {
          setAccount(result.account);
          setArtistId(result.account.artistId ?? "");
        }
      } catch (caught) {
        if (!controller.signal.aborted && selectedPlayer.current === selectedPlayerId) {
          setError(caught instanceof Error ? caught.message : "The player account could not be loaded.");
          setSelectedPlayerId(null);
          selectedPlayer.current = null;
        }
      } finally {
        if (!controller.signal.aborted && (selectedPlayer.current === selectedPlayerId || selectedPlayer.current === null)) setLoadingAccount(false);
      }
    }, 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [selectedPlayerId]);

  function selectAccount(id: string) {
    if (saving.current || selectedPlayerId === id) return;
    selectedPlayer.current = id;
    setSelectedPlayerId(id);
    setAccount(null);
    setLoadingAccount(true);
    setShowArtistCreator(false);
    setArtistId("");
    setError("");
    setMessage("");
  }

  async function updateAccount(action: Exclude<AccountAction, "create-artist">, values: Record<string, unknown>) {
    if (!account || saving.current) return false;
    const target = account;
    saving.current = true;
    setSavingAction(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/player-accounts", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, email: target.email, playerId: target.id, ...values }),
      });
      const result = await response.json() as { account?: PlayerAccountView; error?: string; message?: string };
      if (!response.ok || !result.account) throw new Error(result.error ?? "The player account could not be updated.");
      const updated = result.account;
      if (updated.id !== target.id) throw new Error("The server returned a different player account.");
      if (selectedPlayer.current === target.id) {
        setAccount(updated);
        setMessage(result.message ?? "The account was updated.");
        if (updated.artistId) {
          const linkedId = updated.artistId;
          setArtistId(linkedId);
          setArtists(current => current.map(artist => artist.id === linkedId ? { ...artist, playerId: target.id } : artist));
        }
        setResults(current => current ? { ...current, accounts: current.accounts.map(player =>
          player.id === target.id ? { ...player, artistId: updated.artistId } : player) } : current);
      }
      return true;
    } catch (caught) {
      if (selectedPlayer.current === target.id) setError(caught instanceof Error ? caught.message : "The player account could not be updated.");
      return false;
    } finally {
      saving.current = false;
      setSavingAction(null);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("The passwords do not match.");
      return;
    }

    if (await updateAccount("reset-password", { password })) formElement.reset();
  }

  async function setSupporterOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    const form = new FormData(event.currentTarget);
    const selectedStatus = String(form.get("supporterStatus") ?? "");
    await updateAccount("set-supporter-override", { supporterStatus: selectedStatus || null });
  }

  async function createArtist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving.current) return;
    const form = new FormData(event.currentTarget);
    saving.current = true;
    setSavingAction("create-artist");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/artists", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artist_name: form.get("artistName"), date_of_birth: form.get("dateOfBirth"), date_of_death: form.get("dateOfDeath"),
        }),
      });
      const result = await response.json() as { artist?: { _id: string; artist_name: string }; error?: string };
      if (!response.ok || !result.artist) throw new Error(result.error ?? "The artist could not be created.");
      const artist = { id: result.artist._id, name: result.artist.artist_name, playerId: null };
      setArtists(current => [...current, artist].sort((left, right) => left.name.localeCompare(right.name)));
      setArtistId(artist.id);
      setShowArtistCreator(false);
      setMessage("Artist created. Link it to this account to enable the artist portal.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The artist could not be created.");
    } finally {
      saving.current = false;
      setSavingAction(null);
    }
  }
  const visibleResults = results?.query === query.trim() ? results.accounts : [];

  return (
    <div className="grid gap-6">
      <section aria-label="Find a player account" className="mt-4 grid gap-3">
        <label className="grid gap-2" htmlFor="player-account-search">
          <span>Search by player name or email</span>
          <input
            className={INPUT_CLASS}
            id="player-account-search"
            name="query"
            type="search"
            autoComplete="off"
            maxLength={254}
            placeholder="Player name or email address"
            value={query}
            onChange={event => {
              searchQuery.current = event.target.value.trim();
              setQuery(event.target.value);
              setSearching(Boolean(event.target.value.trim()));
              setResults(null);
              setError("");
              setMessage("");
            }}
          />
        </label>
        <div aria-live="polite">
          {searching ? <p>Searching...</p> : null}
          {!searching && results?.query === query.trim() && visibleResults.length === 0 ? <p>No matching players.</p> : null}
        </div>
        <div className="grid gap-2">
          {visibleResults.map(player => (
            <button
              aria-pressed={player.id === selectedPlayerId}
              className={`rounded-md border p-3 text-left ${player.id === selectedPlayerId ? "border-[var(--accent)]" : "border-white/20"}`}
              disabled={busy}
              key={player.id}
              onClick={() => selectAccount(player.id)}
              type="button"
            >
              <strong>{player.screenName}</strong>{" · "}{player.email}
              {!player.active ? " · Inactive" : ""}
              {player.artistId ? " · Artist account" : ""}
            </button>
          ))}
        </div>
      </section>

      {loadingAccount ? <p>Loading account...</p> : null}
      {account ? (
        <article className="rounded-md border border-white/15 p-5" key={account.id}>
          <h2>{account.screenName}</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Player ID</dt>
              <dd>{account.id}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Status</dt>
              <dd>{account.active ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Artist account</dt>
              <dd>{account.artistId ? account.artistName ?? account.artistId : "Not linked to an artist"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Sign-in methods</dt>
              <dd>
                {[
                  account.hasPassword ? "password" : null,
                  account.hasOAuth ? "external provider" : null,
                ]
                  .filter(Boolean)
                  .join(", ") || "none"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Supporter status</dt>
              <dd>
                {account.supporterStatus ? (
                  <strong
                    style={{
                      color:
                        SUPPORTER_STATUS_COLORS[account.supporterStatus],
                    }}
                  >
                    {account.supporterStatus}
                  </strong>
                ) : (
                  "Not a supporter"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Created</dt>
              <dd>{account.createdAt ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Last updated</dt>
              <dd>{account.updatedAt ?? "Unknown"}</dd>
            </div>
          </dl>

          <form className="mt-6 grid gap-3" onSubmit={event => {
            event.preventDefault();
            if (artistId && !account.artistId && account.active) void updateAccount("link-artist", { artistId });
          }}>
            <label className="grid gap-2" htmlFor="player-account-artist">
              <span>Catalog artist</span>
              <select
                className={INPUT_CLASS}
                disabled={busy || Boolean(account.artistId) || !account.active}
                id="player-account-artist"
                onChange={event => setArtistId(event.target.value)}
                value={artistId}
              >
                <option value="">Choose an artist</option>
                {artists.map(artist => (
                  <option disabled={Boolean(artist.playerId && artist.playerId !== account.id)} key={artist.id} value={artist.id}>
                    {artist.name}{artist.playerId && artist.playerId !== account.id ? " (linked to another player)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-[var(--muted)]">
              Linking enables the artist portal without changing gameplay or sign-in methods.
            </p>
            <button disabled={busy || !artistId || Boolean(account.artistId) || !account.active} type="submit">
              {savingAction === "link-artist" ? "Linking..." : account.artistId ? "Artist linked" : "Link artist to account"}
            </button>
            {!account.artistId && account.active ? (
              <button disabled={busy} onClick={() => setShowArtistCreator(current => !current)} type="button">
                {showArtistCreator ? "Cancel new artist" : "Create new artist"}
              </button>
            ) : null}
          </form>

          {showArtistCreator ? (
            <form className="mt-4 grid gap-3 rounded-md border border-white/15 p-4" onSubmit={createArtist}>
              <label className="grid gap-2">New artist name<input className={INPUT_CLASS} name="artistName" required /></label>
              <label className="grid gap-2">Date of birth<input className={INPUT_CLASS} name="dateOfBirth" /></label>
              <label className="grid gap-2">Date of death<input className={INPUT_CLASS} name="dateOfDeath" /></label>
              <button disabled={busy} type="submit">{savingAction === "create-artist" ? "Creating..." : "Create artist"}</button>
            </form>
          ) : null}

          <form
            className="mt-6 grid gap-3"
            key={`${account.id}-${account.supporterOverride ?? "automatic"}`}
            onSubmit={setSupporterOverride}
          >
            <label
              className="grid gap-2"
              htmlFor="supporter-status-override"
            >
              <span>Admin supporter override</span>
              <select
                disabled={busy}
                defaultValue={account.supporterOverride ?? ""}
                id="supporter-status-override"
                name="supporterStatus"
              >
                <option value="">No override (automatic)</option>
                {SUPPORTER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-[var(--muted)]">
              The effective status is the highest level found across this
              override, Patreon, and future supporter sources.
            </p>
            <button disabled={busy} type="submit">
              {savingAction === "set-supporter-override" ? "Saving..." : "Save supporter override"}
            </button>
          </form>

          <form className="mt-6 grid gap-3" onSubmit={resetPassword}>
            <label className="grid gap-2" htmlFor="recovery-password">
              <span>New password</span>
              <input
                id="recovery-password"
                minLength={12}
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="grid gap-2" htmlFor="recovery-password-confirm">
              <span>Confirm new password</span>
              <input
                id="recovery-password-confirm"
                minLength={12}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <button disabled={busy} type="submit">
              {savingAction === "reset-password" ? "Setting password..." : "Set new password"}
            </button>
          </form>

          <details className="mt-6" open>
            <summary>All player metadata</summary>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Credentials and access tokens are redacted.
            </p>
            <pre className="mt-3 max-h-[36rem] overflow-auto rounded-md border border-white/15 bg-black/30 p-4 text-xs">
              {JSON.stringify(account.metadata, null, 2)}
            </pre>
          </details>
        </article>
      ) : null}

      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}

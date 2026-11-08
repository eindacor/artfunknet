"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import ArtworkEditorPanel, { ArtworkEditorField as EditorField } from "@/components/artwork-editor/artwork-editor-panel";
import type { ArtistCatalogEntry, ArtworkCatalogEntry, ArtworkEditorMetadata } from "@/components/artwork-editor/types";
import type { CardRendererId } from "@/components/item-cards/types";
export type { ArtistCatalogEntry, ArtworkCatalogEntry } from "@/components/artwork-editor/types";

export type ArtworkEffectOption = {
  id: string;
  title: string;
  effectType: "legendary" | "masterpiece";
  active: boolean;
};

export type ArtworkAttributeOption = {
  id: string;
  title: string;
  active: boolean;
};

export default function CatalogEditor({
  initialArtists,
  initialArtworks,
  effectOptions,
  attributeOptions,
  rendererOptions,
}: {
  initialArtists: ArtistCatalogEntry[];
  initialArtworks: ArtworkCatalogEntry[];
  effectOptions: ArtworkEffectOption[];
  attributeOptions: ArtworkAttributeOption[];
  rendererOptions: { id: CardRendererId; name: string }[];
}) {
  const [artists, setArtists] = useState(initialArtists);
  const [artworks, setArtworks] = useState(initialArtworks);
  const [mode, setMode] = useState<"artworks" | "artists">(
    "artworks",
  );
  const [artworkFilter, setArtworkFilter] = useState<"all" | "missing">(
    "all",
  );
  const [artworkSort, setArtworkSort] = useState<"default" | "recent">("default");
  const [query, setQuery] = useState("");
  const [selectedArtworkId, setSelectedArtworkId] = useState(
    initialArtworks[0]?._id ?? "",
  );
  const [selectedArtistId, setSelectedArtistId] = useState(
    initialArtists[0]?.id ?? "",
  );
  const [artworkForm, setArtworkForm] = useState(initialArtworks[0] ?? null);
  const [artistForm, setArtistForm] = useState(initialArtists[0] ?? null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredArtworks = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = artworks.filter((artwork) => {
      const matchesFilter =
        artworkFilter === "all" ||
        artwork.hasImage === false ||
        !getArtworkStorage(artwork);
      const matchesSearch =
        !search ||
        `${artwork.title} ${artwork.artist} ${artwork.rarity}`
          .toLowerCase()
          .includes(search);
      return matchesFilter && matchesSearch;
    });
    return artworkSort === "recent" ? filtered.sort(compareRecentArtworks) : filtered;
  }, [artworkFilter, artworkSort, artworks, query]);
  const filteredArtists = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? artists.filter((artist) => artist.name.toLowerCase().includes(search))
      : artists;
  }, [artists, query]);

  function selectArtwork(artwork: ArtworkCatalogEntry) {
    setMode("artworks");
    setSelectedArtworkId(artwork._id);
    setArtworkForm({ ...artwork });
    clearStatus();
  }

  function selectArtist(artist: ArtistCatalogEntry) {
    setMode("artists");
    setSelectedArtistId(artist.id);
    setArtistForm({ ...artist });
    clearStatus();
  }

  function clearStatus() {
    setMessage("");
    setError("");
  }

  async function saveArtwork(metadata: ArtworkEditorMetadata) {
    if (!artworkForm) return;
    const submittedArtwork = { ...artworkForm, ...metadata };
    let savedResult: ArtworkCatalogEntry | undefined;
    const previousArtwork = artworks.find(
      (artwork) => artwork._id === submittedArtwork._id,
    );
    const previousArtistId = previousArtwork?.artist_id;
    await save(async () => {
      const response = await fetch(
        `/api/admin/artworks/${submittedArtwork._id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(submittedArtwork),
        },
      );
      const result = await readResponse<{
        artwork: ArtworkCatalogEntry;
        message: string;
      }>(response);
      const savedArtwork = {
        ...result.artwork,
        hasImage: Boolean(getArtworkStorage(result.artwork)),
      };
      savedResult = savedArtwork;
      setArtworks((current) =>
        current
          .map((artwork) =>
            artwork._id === savedArtwork._id ? savedArtwork : artwork,
          )
          .sort(compareArtworks),
      );
      setArtworkForm((current) =>
        current?._id === savedArtwork._id ? savedArtwork : current,
      );
      if (
        previousArtistId &&
        previousArtistId !== result.artwork.artist_id
      ) {
        setArtists((current) =>
          current.map((artist) =>
            artist.id === previousArtistId
              ? {
                  ...artist,
                  artworkCount: Math.max(0, artist.artworkCount - 1),
                }
              : artist.id === result.artwork.artist_id
                ? { ...artist, artworkCount: artist.artworkCount + 1 }
                : artist,
          ),
        );
      }
      setMessage(result.message);
    });
    return savedResult;
  }

  async function saveArtist(event: FormEvent) {
    event.preventDefault();
    if (!artistForm) return;
    await save(async () => {
      const response = await fetch(`/api/admin/artists/${artistForm.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artist_name: artistForm.name,
          date_of_birth: artistForm.dateOfBirth,
          date_of_death: artistForm.dateOfDeath,
        }),
      });
      const result = await readResponse<{
        artist: ArtistCatalogEntry;
        message: string;
      }>(response);
      setArtists((current) =>
        current
          .map((artist) =>
            artist.id === result.artist.id ? result.artist : artist,
          )
          .sort((left, right) => left.name.localeCompare(right.name)),
      );
      setArtworks((current) =>
        current.map((artwork) =>
          artwork.artist_id === result.artist.id
            ? { ...artwork, artist: result.artist.name }
            : artwork,
        ),
      );
      setArtistForm(result.artist);
      setMessage(result.message);
    });
  }

  async function deleteArtwork() {
    if (!artworkForm) return;
    if (
      !window.confirm(
        `Delete "${artworkForm.title}" by ${artworkForm.artist}? This cannot be undone.`,
      )
    ) {
      return;
    }
    const deletedId = artworkForm._id;
    await save(async () => {
      const response = await fetch(`/api/admin/artworks/${deletedId}`, {
        method: "DELETE",
      });
      const result = await readResponse<{ message: string }>(response);
      const remaining = artworks
        .filter((artwork) => artwork._id !== deletedId)
        .sort(compareArtworks);
      setArtworks(remaining);
      const next = remaining[0] ?? null;
      setSelectedArtworkId(next?._id ?? "");
      setArtworkForm(next);
      setMessage(result.message);
    });
  }

  async function deleteArtist() {
    if (!artistForm) return;
    if (
      !window.confirm(
        `Delete artist "${artistForm.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    const deletedId = artistForm.id;
    await save(async () => {
      const response = await fetch(`/api/admin/artists/${deletedId}`, {
        method: "DELETE",
      });
      const result = await readResponse<{ message: string }>(response);
      const remaining = artists
        .filter((artist) => artist.id !== deletedId)
        .sort((left, right) => left.name.localeCompare(right.name));
      setArtists(remaining);
      const next = remaining[0] ?? null;
      setSelectedArtistId(next?.id ?? "");
      setArtistForm(next);
      setMessage(result.message);
    });
  }

  async function save(action: () => Promise<void>) {
    if (saving.current) return false;
    saving.current = true;
    setPending(true);
    clearStatus();
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
      return false;
    } finally {
      setPending(false);
      saving.current = false;
    }
  }

  const entries = mode === "artworks" ? filteredArtworks : filteredArtists;

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <button
          className={mode === "artworks" ? activeTabClass : tabClass}
          onClick={() => {
            setMode("artworks");
            setArtworkFilter("all");
            setQuery("");
          }}
          type="button"
        >
          Artworks ({artworks.length})
        </button>
        <button
          className={
            mode === "artworks" && artworkFilter === "missing"
              ? activeTabClass
              : tabClass
          }
          onClick={() => {
            setMode("artworks");
            setArtworkFilter("missing");
            setQuery("");
          }}
          type="button"
        >
          Missing images (
          {artworks.filter(
            (artwork) =>
              artwork.hasImage === false || !getArtworkStorage(artwork),
          ).length}
          )
        </button>
        <button
          className={mode === "artists" ? activeTabClass : tabClass}
          onClick={() => {
            setMode("artists");
            setArtworkFilter("all");
            setQuery("");
          }}
          type="button"
        >
          Artists ({artists.length})
        </button>
      </div>
      <label className="grid gap-2">
          <span className="font-semibold">Search {mode}</span>
          <input
            className={inputClass}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              mode === "artworks"
                ? "Title, artist, or rarity"
                : "Artist name"
            }
            value={query}
          />
      </label>
      {mode === "artworks" ? (
        <label className="grid gap-2">
          <span className="font-semibold">Sort artworks</span>
          <select
            className={inputClass}
            onChange={(event) => setArtworkSort(event.target.value === "recent" ? "recent" : "default")}
            value={artworkSort}
          >
            <option value="default">Artist / title</option>
            <option value="recent">Recently added</option>
          </select>
        </label>
      ) : null}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="max-h-[70vh] space-y-2 overflow-y-auto pr-2">
          <p className="text-sm text-[var(--muted)]">
            {entries.length} matching entries
          </p>
          {mode === "artworks"
            ? filteredArtworks.map((artwork) => (
                <button
                  className={entryClass(
                    artwork._id === selectedArtworkId,
                  )}
                  key={artwork._id}
                  onClick={() => selectArtwork(artwork)}
                  type="button"
                >
                  <strong>{artwork.title}</strong>
                  <span>{artwork.artist}</span>
                  <small className={`rarity-text ${artwork.rarity}`}>
                    {artwork.rarity} · {artwork.active ? "active" : "inactive"}
                  </small>
                </button>
              ))
            : filteredArtists.map((artist) => (
                <button
                  className={entryClass(artist.id === selectedArtistId)}
                  key={artist.id}
                  onClick={() => selectArtist(artist)}
                  type="button"
                >
                  <strong>{artist.name}</strong>
                  <span>
                    {artist.artworkCount} artwork
                    {artist.artworkCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
        </aside>
        <div className="rounded-lg border border-white/10 bg-white/5 p-5">
          {mode === "artworks" && artworkForm ? (
            <ArtworkEditorPanel
              key={artworkForm._id}
              mode="edit"
              artists={artists}
              attributeOptions={attributeOptions}
              artwork={artworkForm}
              effectOptions={effectOptions}
              rendererOptions={rendererOptions}
              onArtistCreated={artist => setArtists(current => [...current, artist].sort((left, right) => left.name.localeCompare(right.name)))}
              onUploaded={(updated) => {
                const imageFields = {
                  image: updated.image,
                  image_width: updated.image_width,
                  image_height: updated.image_height,
                  hasImage: true,
                };
                setArtworkForm((current) =>
                  current?._id === updated._id
                    ? { ...current, ...imageFields }
                    : current,
                );
                setArtworks((current) =>
                  current.map((artwork) =>
                    artwork._id === updated._id
                      ? { ...artwork, ...imageFields }
                      : artwork,
                  ),
                );
                setMessage(`Updated the image for ${updated.title}.`);
              }}
              onDelete={deleteArtwork}
              onSave={saveArtwork}
              pending={pending}
            />
          ) : null}
          {mode === "artists" && artistForm ? (
            <ArtistForm
              artist={artistForm}
              onChange={setArtistForm}
              onSubmit={saveArtist}
              onDelete={deleteArtist}
              pending={pending}
            />
          ) : null}
          {message ? <p className="mt-4 text-green-400">{message}</p> : null}
          {error ? <p className="mt-4 text-red-400">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ArtistForm({
  artist,
  onChange,
  onSubmit,
  onDelete,
  pending,
}: {
  artist: ArtistCatalogEntry;
  onChange: (artist: ArtistCatalogEntry) => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div>
        <h2 className="text-2xl font-bold">{artist.name}</h2>
        <p className="text-[var(--muted)]">
          {artist.artworkCount} linked artwork
          {artist.artworkCount === 1 ? "" : "s"} · {artist.id}
        </p>
      </div>
      <EditorField
        label="Artist name"
        onChange={(name) => onChange({ ...artist, name })}
        value={artist.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <EditorField
          label="Date of birth"
          onChange={(dateOfBirth) => onChange({ ...artist, dateOfBirth })}
          value={artist.dateOfBirth}
        />
        <EditorField
          label="Date of death"
          onChange={(dateOfDeath) => onChange({ ...artist, dateOfDeath })}
          value={artist.dateOfDeath}
        />
      </div>
      <button
        className="justify-self-start rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-black disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving..." : "Save artist"}
      </button>
      <button
        className="justify-self-start rounded-md border border-red-400/60 px-4 py-2 font-bold text-red-300 disabled:opacity-50"
        disabled={pending}
        onClick={onDelete}
        type="button"
      >
        Delete artist
      </button>
    </form>
  );
}

function getArtworkStorage(artwork: ArtworkCatalogEntry) {
  return artwork.image?.variants?.full?.storage ?? artwork.image?.storage;
}

function compareArtworks(
  left: ArtworkCatalogEntry,
  right: ArtworkCatalogEntry,
) {
  return (
    left.artist.localeCompare(right.artist) ||
    left.title.localeCompare(right.title)
  );
}

function compareRecentArtworks(left: ArtworkCatalogEntry, right: ArtworkCatalogEntry) {
  const leftTime = Date.parse(left.created_at ?? "");
  const rightTime = Date.parse(right.created_at ?? "");
  if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : compareArtworks(left, right);
  if (!Number.isFinite(rightTime)) return -1;
  return rightTime - leftTime || compareArtworks(left, right);
}

function entryClass(current: boolean) {
  return `grid w-full gap-1 rounded-md border p-3 text-left ${
    current
      ? "border-[var(--accent)] bg-white/10"
      : "border-white/10 bg-white/5"
  }`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Update failed.");
  return body;
}

const inputClass =
  "rounded-md border border-white/20 bg-[#19171d] px-3 py-2";
const tabClass = "rounded-md border border-white/20 px-4 py-2 font-semibold";
const activeTabClass =
  "rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-semibold text-black";

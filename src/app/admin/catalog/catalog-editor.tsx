"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type ArtworkRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "legendary"
  | "masterpiece";

const RARITIES: ArtworkRarity[] = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
];

export type ArtistCatalogEntry = {
  id: string;
  name: string;
  dateOfBirth: string;
  dateOfDeath: string;
  artworkCount: number;
};

export type ArtworkCatalogEntry = {
  _id: string;
  artist_id: string;
  artist: string;
  title: string;
  date: number;
  genre: string;
  medium: string;
  rarity: ArtworkRarity;
  value_scale: number;
  height: number;
  width: number;
  active: boolean;
  nsfw?: boolean;
  special_attributes?: string[];
  image?: { storage?: unknown };
  hasImage?: boolean;
};

type AttributeOption = { id: string; name: string };

export default function CatalogEditor({
  initialArtists,
  initialArtworks,
  attributes,
}: {
  initialArtists: ArtistCatalogEntry[];
  initialArtworks: ArtworkCatalogEntry[];
  attributes: AttributeOption[];
}) {
  const [artists, setArtists] = useState(initialArtists);
  const [artworks, setArtworks] = useState(initialArtworks);
  const [mode, setMode] = useState<"artworks" | "artists">("artworks");
  const [artworkFilter, setArtworkFilter] = useState<"all" | "missing">(
    "all",
  );
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredArtworks = useMemo(() => {
    const search = query.trim().toLowerCase();
    return artworks.filter((artwork) => {
      const matchesFilter =
        artworkFilter === "all" ||
        artwork.hasImage === false ||
        !artwork.image?.storage;
      const matchesSearch =
        !search ||
        `${artwork.title} ${artwork.artist} ${artwork.rarity}`
          .toLowerCase()
          .includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [artworkFilter, artworks, query]);
  const filteredArtists = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? artists.filter((artist) => artist.name.toLowerCase().includes(search))
      : artists;
  }, [artists, query]);

  function selectArtwork(artwork: ArtworkCatalogEntry) {
    setSelectedArtworkId(artwork._id);
    setArtworkForm({ ...artwork });
    clearStatus();
  }

  function selectArtist(artist: ArtistCatalogEntry) {
    setSelectedArtistId(artist.id);
    setArtistForm({ ...artist });
    clearStatus();
  }

  function clearStatus() {
    setMessage("");
    setError("");
  }

  async function saveArtwork(event: FormEvent) {
    event.preventDefault();
    if (!artworkForm) return;
    const previousArtistId = artworks.find(
      (artwork) => artwork._id === artworkForm._id,
    )?.artist_id;
    await save(async () => {
      const response = await fetch(
        `/api/admin/artworks/${artworkForm._id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(artworkForm),
        },
      );
      const result = await readResponse<{
        artwork: ArtworkCatalogEntry;
        message: string;
      }>(response);
      setArtworks((current) =>
        current
          .map((artwork) =>
            artwork._id === result.artwork._id
              ? {
                  ...result.artwork,
                  hasImage: Boolean(result.artwork.image?.storage),
                }
              : artwork,
          )
          .sort(compareArtworks),
      );
      setArtworkForm(result.artwork);
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
    setPending(true);
    clearStatus();
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setPending(false);
    }
  }

  const entries = mode === "artworks" ? filteredArtworks : filteredArtists;
  const rarityCounts = RARITIES.map((rarity) => ({
    rarity,
    count: artworks.filter((artwork) => artwork.rarity === rarity).length,
  }));

  return (
    <section className="grid gap-5">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Artwork breakdown</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {rarityCounts.map(({ rarity, count }) => (
            <div
              className="rounded-md border border-white/10 bg-black/10 px-3 py-2"
              key={rarity}
            >
              <p className={`rarity-text ${rarity}`}>{capitalize(rarity)}</p>
              <p className="mt-1 text-2xl font-bold">{count}</p>
            </div>
          ))}
        </div>
      </div>
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
            (artwork) => artwork.hasImage === false || !artwork.image?.storage,
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
            <ArtworkForm
              artists={artists}
              artwork={artworkForm}
              attributes={attributes}
              onChange={setArtworkForm}
              onUploaded={(updated) => {
                const artworkWithImage = { ...updated, hasImage: true };
                setArtworkForm(artworkWithImage);
                setArtworks((current) =>
                  current.map((artwork) =>
                    artwork._id === updated._id
                      ? { ...artwork, ...artworkWithImage }
                      : artwork,
                  ),
                );
                setMessage(`Updated the image for ${artworkWithImage.title}.`);
              }}
              onUploadError={(uploadError) => setError(uploadError)}
              onDelete={deleteArtwork}
              onSubmit={saveArtwork}
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

function ArtworkForm({
  artwork,
  artists,
  attributes,
  onChange,
  onUploaded,
  onUploadError,
  onDelete,
  onSubmit,
  pending,
}: {
  artwork: ArtworkCatalogEntry;
  artists: ArtistCatalogEntry[];
  attributes: AttributeOption[];
  onChange: (artwork: ArtworkCatalogEntry) => void;
  onUploaded: (artwork: ArtworkCatalogEntry) => void;
  onUploadError: (message: string) => void;
  onDelete: () => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
}) {
  const requiredAttributes = getRequiredAttributeCount(artwork.rarity);
  const [uploading, setUploading] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  function set<Key extends keyof ArtworkCatalogEntry>(
    key: Key,
    value: ArtworkCatalogEntry[Key],
  ) {
    onChange({ ...artwork, [key]: value });
  }
  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-5 md:grid-cols-[180px_1fr]">
        <Image
          alt={`${artwork.title} by ${artwork.artist}`}
          className="h-auto w-full rounded-md border border-white/10 object-contain"
          height={220}
          src={`/api/artwork/${artwork._id}/image?v=${imageVersion}`}
          unoptimized
          width={180}
        />
        <label className="mt-3 grid gap-2 text-sm">
          <span className="font-semibold">Replace image</span>
          <input
            accept="image/bmp,image/gif,image/jpeg,image/png,image/tiff,image/webp"
            className={inputClass}
            disabled={uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const body = new FormData();
                body.set("image", file);
                const response = await fetch(
                  `/api/admin/artworks/${artwork._id}/image`,
                  { method: "POST", body },
                );
                const result = await readResponse<{
                  artwork: ArtworkCatalogEntry;
                }>(response);
                onUploaded(result.artwork);
                setImageVersion((version) => version + 1);
              } catch (caught) {
                onUploadError(
                  caught instanceof Error ? caught.message : "Image upload failed.",
                );
              } finally {
                setUploading(false);
                event.target.value = "";
              }
            }}
            type="file"
          />
          {uploading ? (
            <span className="text-[var(--muted)]">Uploading...</span>
          ) : null}
        </label>
        <div>
          <h2 className="text-2xl font-bold">{artwork.title}</h2>
          <p className="text-[var(--muted)]">{artwork._id}</p>
          <label className="mt-4 flex items-center gap-2">
            <input
              checked={artwork.active}
              onChange={(event) => set("active", event.target.checked)}
              type="checkbox"
            />
            Active in game
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input
              checked={artwork.nsfw === true}
              onChange={(event) => set("nsfw", event.target.checked)}
              type="checkbox"
            />
            NSFW
          </label>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <EditorField
          label="Title"
          onChange={(value) => set("title", value)}
          value={artwork.title}
        />
        <label className="grid gap-2">
          <span className="font-semibold">Artist</span>
          <select
            className={inputClass}
            onChange={(event) => set("artist_id", event.target.value)}
            value={artwork.artist_id}
          >
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>
        <EditorField
          label="Date"
          onChange={(value) => set("date", Number(value))}
          type="number"
          value={String(artwork.date)}
        />
        <EditorField
          label="Genre or style"
          onChange={(value) => set("genre", value)}
          value={artwork.genre}
        />
        <EditorField
          label="Medium"
          onChange={(value) => set("medium", value)}
          value={artwork.medium}
        />
        <label className="grid gap-2">
          <span className="font-semibold">Rarity</span>
          <select
            className={inputClass}
            onChange={(event) => {
              const rarity = event.target.value as ArtworkRarity;
              onChange({
                ...artwork,
                rarity,
                special_attributes: (artwork.special_attributes ?? []).slice(
                  0,
                  getRequiredAttributeCount(rarity),
                ),
              });
            }}
            value={artwork.rarity}
          >
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity}>
                {capitalize(rarity)}
              </option>
            ))}
          </select>
        </label>
        <EditorField
          label="Value scale (0-1)"
          onChange={(value) => set("value_scale", Number(value))}
          step="0.001"
          type="number"
          value={String(artwork.value_scale)}
        />
        <EditorField
          label="Height (cm)"
          onChange={(value) => set("height", Number(value))}
          step="0.01"
          type="number"
          value={String(artwork.height)}
        />
      </div>
      <fieldset className="grid gap-2 rounded-md border border-white/10 p-3">
        <legend className="px-1 font-semibold">
          Special attributes ({artwork.special_attributes?.length ?? 0}/
          {requiredAttributes})
        </legend>
        {requiredAttributes === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            This rarity has no special attributes.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {attributes.map((attribute) => {
              const selected = artwork.special_attributes?.includes(
                attribute.id,
              );
              return (
                <label className="flex items-center gap-2" key={attribute.id}>
                  <input
                    checked={selected}
                    disabled={
                      !selected &&
                      (artwork.special_attributes?.length ?? 0) >=
                        requiredAttributes
                    }
                    onChange={() =>
                      set(
                        "special_attributes",
                        selected
                          ? artwork.special_attributes?.filter(
                              (id) => id !== attribute.id,
                            )
                          : [
                              ...(artwork.special_attributes ?? []),
                              attribute.id,
                            ],
                      )
                    }
                    type="checkbox"
                  />
                  {attribute.name}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      <button
        className="justify-self-start rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-black disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving..." : "Save artwork"}
      </button>
      <button
        className="justify-self-start rounded-md border border-red-400/60 px-4 py-2 font-bold text-red-300 disabled:opacity-50"
        disabled={pending}
        onClick={onDelete}
        type="button"
      >
        Delete artwork
      </button>
    </form>
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

function EditorField({
  label,
  onChange,
  step,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  step?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="font-semibold">{label}</span>
      <input
        className={inputClass}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function getRequiredAttributeCount(rarity: ArtworkRarity): number {
  return { common: 0, uncommon: 0, rare: 1, legendary: 2, masterpiece: 3 }[
    rarity
  ];
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

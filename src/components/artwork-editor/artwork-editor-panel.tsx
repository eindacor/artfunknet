"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CardRendererId } from "@/components/item-cards/types";
import {
  getArtworkFeatureCardAdjustment,
  getArtworkThumbnailAdjustment,
} from "@/components/item-cards/artwork-image-adjustments";
import type { Artwork } from "@/server/gameplay";
import { getArtworkImageUrl, type ArtworkImageScope } from "@/server/artwork-image-url";
import { useArtworkImageScope } from "@/components/artwork-image-scope";
import ArtworkCustomizationPanel from "./artwork-customization-panel";
import {
  ARTWORK_EDITOR_RARITIES,
  type ArtistCatalogEntry,
  type ArtworkCatalogEntry,
  type ArtworkEditorMetadata,
} from "./types";

export const ARTWORK_EDITOR_INPUT_CLASS = "rounded-md border border-white/20 bg-[#19171d] px-3 py-2";

function initialDraft(artwork?: ArtworkCatalogEntry, artistId = "") {
  return {
    artist_id: artwork?.artist_id ?? artistId,
    title: artwork?.title ?? "", date: artwork ? String(artwork.date) : "",
    genre: artwork?.genre ?? "", medium: artwork?.medium ?? "",
    rarity: artwork?.rarity ?? "common" as Artwork["rarity"],
    height: artwork ? String(artwork.height) : "",
    active: artwork?.active ?? true, nsfw: artwork?.nsfw === true,
    value_scale: String(artwork?.value_scale ?? 0.5),
    effect_id: artwork?.effect_id,
    special_attributes: artwork?.special_attributes,
    art_style_adjustments: artwork?.art_style_adjustments ?? {},
    detail_image_adjustments: artwork?.detail_image_adjustments ?? [],
    thumbnail_adjustment: getArtworkThumbnailAdjustment(artwork ?? {}),
    feature_card_adjustment: getArtworkFeatureCardAdjustment(artwork ?? {}),
  };
}

type ImagePreview = { url: string; width: number; height: number };

function existingPreview(artwork: ArtworkCatalogEntry, scope: ArtworkImageScope): ImagePreview {
  return {
    url: getArtworkImageUrl(artwork._id, "card", artwork.image, false, scope),
    width: artwork.image_width ?? artwork.width,
    height: artwork.image_height ?? artwork.height,
  };
}

export default function ArtworkEditorPanel({
  mode, artwork, artists, rendererOptions, pending = false,
  artistSubmission = false, submitLabel, deleteLabel = "Delete artwork",
  showRarity = true, showActiveInGame = true,
  allowImageUpload = true, imagePreviewUrl,
  effectOptions = [], attributeOptions = [],
  onSave, onDelete, onUploaded, onArtistCreated,
}: {
  mode: "add" | "edit" | "review";
  artwork?: ArtworkCatalogEntry;
  artists: ArtistCatalogEntry[];
  rendererOptions: { id: CardRendererId; name: string }[];
  pending?: boolean;
  artistSubmission?: boolean;
  submitLabel?: string;
  deleteLabel?: string;
  showRarity?: boolean;
  showActiveInGame?: boolean;
  allowImageUpload?: boolean;
  imagePreviewUrl?: string;
  effectOptions?: { id: string; title: string; effectType: "legendary" | "masterpiece"; active: boolean }[];
  attributeOptions?: { id: string; title: string; active: boolean }[];
  onSave: (metadata: ArtworkEditorMetadata, file: File | null) => Promise<ArtworkCatalogEntry | undefined>;
  onDelete?: () => void;
  onUploaded?: (artwork: ArtworkCatalogEntry) => void;
  onArtistCreated?: (artist: ArtistCatalogEntry) => void;
}) {
  const scope = useArtworkImageScope();
  const [draft, setDraft] = useState(() => initialDraft(artwork, artists[0]?.id));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImagePreview | null>(() => artwork
    ? { ...existingPreview(artwork, scope), ...(imagePreviewUrl ? { url: imagePreviewUrl } : {}) } : null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingArtist, setCreatingArtist] = useState(false);
  const [showArtistCreator, setShowArtistCreator] = useState(false);
  const [newArtist, setNewArtist] = useState({ name: "", dateOfBirth: "", dateOfDeath: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const previewRequest = useRef<AbortController | null>(null);
  const busy = pending || saving || creatingArtist;
  const savedValueScale = artwork?.value_scale;
  const [lastSavedValueScale, setLastSavedValueScale] = useState(savedValueScale);
  if (savedValueScale !== lastSavedValueScale) {
    setLastSavedValueScale(savedValueScale);
    if (savedValueScale !== undefined) {
      setDraft(current => ({ ...current, value_scale: String(savedValueScale) }));
    }
  }
  useEffect(() => () => {
    // Admin replacement uploads persist immediately and must finish after navigation.
    if (mode === "add" || artistSubmission) previewRequest.current?.abort();
  }, [mode, artistSubmission]);
  useEffect(() => () => {
    if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
  }, [preview]);

  function set<Key extends keyof typeof draft>(key: Key, value: (typeof draft)[Key]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function chooseImage(file: File | null) {
    const previewOnly = mode === "add" || artistSubmission;
    const previousFile = imageFile;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setImageFile(file);
    setError(""); setMessage("");
    if (mode === "add") setPreview(null);
    setPreviewLoading(Boolean(file));
    if (!file) return;
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch(!previewOnly && artwork
        ? `/api/admin/artworks/${encodeURIComponent(artwork._id)}/image`
        : artistSubmission ? "/api/artist/artworks/preview" : "/api/admin/artworks/preview", { method: "POST", body, signal: controller.signal });
      if (!previewOnly) {
        const result = await readResponse<{ artwork: ArtworkCatalogEntry }>(response);
        if (controller.signal.aborted) return;
        setPreview(existingPreview(result.artwork, scope));
        onUploaded?.(result.artwork);
        if (!onUploaded) setMessage(`Updated the image for ${result.artwork.title}.`);
      } else {
        if (!response.ok) await readResponse(response);
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        setPreview({ url: URL.createObjectURL(blob),
          width: Number(response.headers.get("x-artwork-width")),
          height: Number(response.headers.get("x-artwork-height")) });
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setImageFile(previousFile);
        setError(caught instanceof Error ? caught.message : "Image preview failed.");
      }
    } finally {
      if (!controller.signal.aborted) setPreviewLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || previewLoading || (mode === "add" && (!preview || !imageFile))) return;
    const form = event.currentTarget;
    setSaving(true); setError(""); setMessage("");
    try {
      const metadata: ArtworkEditorMetadata = {
        artist_id: draft.artist_id, title: draft.title, date: Number(draft.date),
        genre: draft.genre, medium: draft.medium, rarity: draft.rarity,
        height: Number(draft.height), active: draft.active, nsfw: draft.nsfw,
        art_style_adjustments: draft.art_style_adjustments,
        detail_image_adjustments: draft.detail_image_adjustments,
        thumbnail_adjustment: draft.thumbnail_adjustment,
        feature_card_adjustment: draft.feature_card_adjustment,
        ...(mode === "edit" ? { value_scale: Number(draft.value_scale),
          effect_id: draft.effect_id, special_attributes: draft.special_attributes } : {}),
      };
      const saved = await onSave(metadata, imageFile);
      if (!saved) return;
      if (mode === "add") {
        setDraft(initialDraft(undefined, saved.artist_id));
        setImageFile(null); setPreview(null); form.reset();
        setMessage(artistSubmission ? `Submitted ${saved.title} for admin review. It is not active in the game yet.` : `Added artwork ${saved.title}.`);
      } else {
        setDraft(initialDraft(saved));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Artwork could not be saved.");
    } finally { setSaving(false); }
  }

  async function createArtist() {
    setCreatingArtist(true); setError("");
    try {
      const response = await fetch("/api/admin/artists", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artist_name: newArtist.name,
          date_of_birth: newArtist.dateOfBirth, date_of_death: newArtist.dateOfDeath }) });
      const result = await readResponse<{ artist: {
        _id: string; artist_name: string; date_of_birth?: string; date_of_death?: string;
      } }>(response);
      const artist = { id: result.artist._id, name: result.artist.artist_name,
        dateOfBirth: result.artist.date_of_birth ?? "", dateOfDeath: result.artist.date_of_death ?? "", artworkCount: 0 };
      onArtistCreated?.(artist); set("artist_id", artist.id);
      setShowArtistCreator(false); setNewArtist({ name: "", dateOfBirth: "", dateOfDeath: "" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Artist creation failed.");
    } finally { setCreatingArtist(false); }
  }

  const previewArtwork: Artwork = {
    ...draft, _id: artwork?._id ?? "draft",
    artist: artists.find(artist => artist.id === draft.artist_id)?.name ?? "",
    title: draft.title || "Untitled artwork", date: Number(draft.date),
    height: Number(draft.height) || 100,
    width: (Number(draft.height) || 100) * (preview ? preview.width / preview.height : 1),
    value_scale: Number(draft.value_scale),
  };
  const storage = artwork?.image?.variants?.full?.storage ?? artwork?.image?.storage;
  return (
    <form className="grid min-w-0 gap-5" onSubmit={submit}>
      <fieldset className="grid min-w-0 grid-cols-1 gap-5" disabled={busy}>
        <div>
          {mode === "add" ? <h1 className="text-3xl font-bold">Add artwork</h1>
            : <><h2 className="text-2xl font-bold">{draft.title}</h2><p className="text-[var(--muted)]">{artwork?._id}</p></>}
          {mode === "add" ? <p className="text-sm text-[var(--muted)]">
            The upload creates full, card, and thumbnail images in artwork storage.
            Crop changes preview live and are saved together when you {artistSubmission ? "submit for review" : "accept"}.
          </p> : null}
        </div>
        {allowImageUpload ? <label className="grid gap-2">
          <span className="font-semibold">{mode === "add" ? "Artwork image" : "Replace image"}</span>
          <input accept="image/bmp,image/gif,image/jpeg,image/png,image/tiff,image/webp"
            className={ARTWORK_EDITOR_INPUT_CLASS} name="image" disabled={previewLoading}
            onChange={event => {
              const input = event.currentTarget;
              void chooseImage(input.files?.[0] ?? null).finally(() => {
                if (mode !== "add") input.value = "";
              });
            }}
            required={mode === "add"} type="file" />
        </label> : null}
        {previewLoading ? <p role="status">{mode === "add" ? "Preparing artwork preview..." : "Uploading..."}</p> : null}
        {preview ? <figure className="grid min-w-0 gap-2" aria-label={mode === "add" ? "Upload preview" : "Image preview"}>
          <Image alt={`${draft.title || "Uploaded artwork"} by ${previewArtwork.artist}`}
            className="max-h-96 h-auto w-full rounded-md border border-white/10 object-contain"
            src={preview.url} width={720} height={Math.round(720 * preview.height / preview.width)}
            unoptimized />
          {imageFile ? <figcaption className="text-sm text-[var(--muted)]">{imageFile.name}</figcaption> : null}
        </figure> : null}
        {mode !== "add" && !artistSubmission && allowImageUpload ? <p className="break-all text-sm text-[var(--muted)]">
          {storage ? storage.provider === "s3" ? `s3://${storage.bucket}/${storage.key}`
            : `storage/mock-s3/${storage.key}` : "No image stored; the seed image is shown."}
        </p> : null}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <ArtworkEditorField label="Title" value={draft.title} onChange={value => set("title", value)} />
          {!artistSubmission && mode !== "review" ? <label className="grid gap-2">
            <span className="font-semibold">Artist</span>
            <select aria-label="Artist" className={ARTWORK_EDITOR_INPUT_CLASS} value={draft.artist_id} required
              onChange={event => set("artist_id", event.target.value)}>
              <option value="" disabled>Select an artist</option>
              {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}
            </select>
            {onArtistCreated ? <button className="justify-self-start text-sm font-semibold text-[var(--accent)]"
              onClick={() => setShowArtistCreator(value => !value)} type="button">
              {showArtistCreator ? "Cancel new artist" : "Create new artist"}
            </button> : null}
          </label> : null}
          {showArtistCreator ? <div className="grid gap-3 rounded-md border border-white/10 p-3 md:col-span-2">
            <ArtworkEditorField label="New artist name" value={newArtist.name} onChange={name => setNewArtist(current => ({ ...current, name }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <ArtworkEditorField label="Date of birth" value={newArtist.dateOfBirth} onChange={dateOfBirth => setNewArtist(current => ({ ...current, dateOfBirth }))} />
              <ArtworkEditorField label="Date of death" value={newArtist.dateOfDeath} onChange={dateOfDeath => setNewArtist(current => ({ ...current, dateOfDeath }))} />
            </div>
            <button className="justify-self-start rounded-md border border-white/20 px-3 py-2 font-semibold"
              disabled={!newArtist.name.trim()} onClick={() => void createArtist()} type="button">Create artist</button>
          </div> : null}
          <ArtworkEditorField label="Date" type="number" value={draft.date} onChange={value => set("date", value)} />
          <ArtworkEditorField label="Genre or style" value={draft.genre} onChange={value => set("genre", value)} />
          <ArtworkEditorField label="Medium" value={draft.medium} onChange={value => set("medium", value)} />
          {showRarity && !artistSubmission ? <label className="grid gap-2">
            <span className="font-semibold">Rarity</span>
            <select aria-label="Rarity" className={ARTWORK_EDITOR_INPUT_CLASS} value={draft.rarity} onChange={event => {
              const rarity = event.target.value as Artwork["rarity"];
              setDraft(current => ({ ...current, rarity, ...(mode === "edit" ? {
                effect_id: rarity === "legendary" || rarity === "masterpiece"
                  ? effectOptions.find(effect => effect.effectType === rarity)?.id : undefined,
                special_attributes: rarity === "rare" ? current.special_attributes : undefined,
              } : {}) }));
            }}>
              {ARTWORK_EDITOR_RARITIES.map(rarity => <option key={rarity} value={rarity}>{rarity.charAt(0).toUpperCase() + rarity.slice(1)}</option>)}
            </select>
          </label> : null}
          {mode === "edit" && !artistSubmission ? <ArtworkEditorField label="Value scale" type="number" min="0" max="1" step="any"
            value={draft.value_scale} onChange={value => set("value_scale", value)} /> : null}
          {mode === "edit" && !artistSubmission && (draft.rarity === "legendary" || draft.rarity === "masterpiece") ? <label className="grid gap-2">
            <span className="font-semibold">Unique effect</span>
            <select aria-label="Unique effect" className={ARTWORK_EDITOR_INPUT_CLASS} value={draft.effect_id ?? ""}
              onChange={event => set("effect_id", event.target.value)}>
              {effectOptions.filter(effect => effect.effectType === draft.rarity).map(effect =>
                <option key={effect.id} value={effect.id}>{effect.title}{effect.active ? "" : " (inactive)"}</option>)}
            </select>
          </label> : null}
          {mode === "edit" && !artistSubmission && draft.rarity === "rare" ? <label className="grid gap-2">
            <span className="font-semibold">Special attribute</span>
            <select aria-label="Special attribute" className={ARTWORK_EDITOR_INPUT_CLASS} value={draft.special_attributes?.[0] ?? ""} required
              onChange={event => set("special_attributes", event.target.value ? [event.target.value] : [])}>
              <option value="">Select an attribute</option>
              {attributeOptions.map(attribute => <option key={attribute.id} value={attribute.id}>{attribute.title}{attribute.active ? "" : " (inactive)"}</option>)}
            </select>
          </label> : null}
          <ArtworkEditorField label="Height (cm)" type="number" step="0.01" value={draft.height} onChange={value => set("height", value)} />
          {mode !== "add" ? <p className="text-sm text-[var(--muted)]">Calculated width: {previewArtwork.width.toFixed(2)} cm</p> : null}
        </div>
        <div className="flex flex-wrap gap-4">
          {showActiveInGame && !artistSubmission ? <label className="flex items-center gap-2">
            <input checked={draft.active} onChange={event => set("active", event.target.checked)} type="checkbox" />Active in game
          </label> : null}
          <label className="flex items-center gap-2">
            <input checked={draft.nsfw} onChange={event => set("nsfw", event.target.checked)} type="checkbox" />NSFW
          </label>
        </div>
        {preview && (!artistSubmission || mode === "add") ? <ArtworkCustomizationPanel key={preview.url} artwork={previewArtwork}
          disabled={busy || previewLoading} sourceUrl={preview.url} rendererOptions={rendererOptions}
          onStyleChange={(id, adjustment) => setDraft(current => ({ ...current,
            art_style_adjustments: { ...current.art_style_adjustments, [id]: adjustment } }))}
          onDetailChange={adjustments => set("detail_image_adjustments", adjustments)}
          onFeatureCardChange={adjustment => set("feature_card_adjustment", adjustment)}
          onThumbnailChange={adjustment => set("thumbnail_adjustment", adjustment)} /> : null}
        <button className="justify-self-start rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-black disabled:opacity-50"
          disabled={previewLoading || (mode === "add" && !preview)} type="submit">
          {busy ? artistSubmission ? "Submitting..." : mode === "add" ? "Adding artwork..." : mode === "review" ? "Accepting artwork..." : "Saving..." : submitLabel ?? (artistSubmission ? "Submit" : mode === "add" ? "Accept" : "Save artwork")}
        </button>
        {onDelete ? <button className="justify-self-start rounded-md border border-red-400/60 px-4 py-2 font-bold text-red-300"
          onClick={onDelete} type="button">{deleteLabel}</button> : null}
      </fieldset>
      {error ? <p className="text-red-400">{error}</p> : null}
      {message ? <p className="text-green-400" role="status">{message}</p> : null}
    </form>
  );
}

export function ArtworkEditorField({ label, onChange, step, min, max, type = "text", value }: {
  label: string; onChange: (value: string) => void; step?: string;
  min?: string; max?: string; type?: string; value: string;
}) {
  return <label className="grid gap-2"><span className="font-semibold">{label}</span>
    <input className={ARTWORK_EDITOR_INPUT_CLASS} onChange={event => onChange(event.target.value)}
      max={max} min={min} step={step} type={type} value={value} /></label>;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Update failed.");
  return body;
}

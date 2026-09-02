"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

export type ArtistOption = {
  id: string;
  name: string;
};

export type AttributeOption = {
  id: string;
  name: string;
};

export type SubmissionView = {
  id: string;
  status: string;
  importedAt: string;
  sources: Array<{
    filename: string;
    path: string;
  }>;
  draft: Record<string, unknown>;
};

const ARTWORK_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

type ArtworkRarity = (typeof ARTWORK_RARITIES)[number];

export type ArtworkRarityCounts = Record<ArtworkRarity, number>;

type ArtworkForm = {
  artist_id: string;
  title: string;
  date: string;
  genre: string;
  medium: string;
  rarity: string;
  value_scale: string;
  height: string;
  special_attribute_ids: string[];
  nsfw: boolean;
};

const EMPTY_FORM: ArtworkForm = {
  artist_id: "",
  title: "",
  date: "",
  genre: "",
  medium: "",
  rarity: "common",
  value_scale: "",
  height: "",
  special_attribute_ids: [],
  nsfw: false,
};

export default function ArtworkReviewPortal({
  initialArtists,
  initialAttributes,
  initialRarityCounts,
  initialSubmissions,
}: {
  initialArtists: ArtistOption[];
  initialAttributes: AttributeOption[];
  initialRarityCounts: ArtworkRarityCounts;
  initialSubmissions: SubmissionView[];
}) {
  const firstActiveSubmission = initialSubmissions.find(
    (submission) => submission.status !== "rejected",
  );
  const [artists, setArtists] = useState(initialArtists);
  const [rarityCounts, setRarityCounts] = useState(initialRarityCounts);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [showRejected, setShowRejected] = useState(false);
  const [selectedId, setSelectedId] = useState(
    firstActiveSubmission?.id ?? "",
  );
  const selected = useMemo(
    () => submissions.find((submission) => submission.id === selectedId),
    [selectedId, submissions],
  );
  const visibleSubmissions = useMemo(
    () =>
      submissions.filter(
        (submission) => showRejected || submission.status !== "rejected",
      ),
    [showRejected, submissions],
  );
  const [form, setForm] = useState<ArtworkForm>(
    toArtworkForm(firstActiveSubmission?.draft),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArtistForm, setShowArtistForm] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>();
  const calculatedWidth =
    imageAspectRatio && Number(form.height) > 0
      ? Number((Number(form.height) * imageAspectRatio).toFixed(2))
      : undefined;
  const requiredSpecialAttributes = getRequiredSpecialAttributeCount(
    form.rarity,
  );

  function selectSubmission(submission: SubmissionView) {
    setSelectedId(submission.id);
    setForm(toArtworkForm(submission.draft));
    setImageAspectRatio(undefined);
    setMessage("");
    setError("");
  }

  function updateField<Key extends keyof ArtworkForm>(
    key: Key,
    value: ArtworkForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    if (!selected) {
      return;
    }

    await runReviewAction(async () => {
      const response = await fetch(
        `/api/admin/artwork-submissions/${selected.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", draft: form }),
        },
      );
      await requireSuccessfulResponse(response);
      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === selected.id
            ? { ...submission, draft: form, status: "unverified" }
            : submission,
        ),
      );
      setMessage("Draft saved.");
    });
  }

  async function rejectSubmission() {
    if (!selected) {
      return;
    }

    await runReviewAction(async () => {
      const response = await fetch(
        `/api/admin/artwork-submissions/${selected.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        },
      );
      await requireSuccessfulResponse(response);
      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === selected.id
            ? { ...submission, status: "rejected" }
            : submission,
        ),
      );
      const nextSubmission = submissions.find(
        (submission) =>
          submission.id !== selected.id &&
          submission.status !== "rejected",
      );
      setSelectedId(nextSubmission?.id ?? "");
      setForm(toArtworkForm(nextSubmission?.draft));
      setImageAspectRatio(undefined);
      setMessage("Submission rejected. It remains available for later review.");
    });
  }

  async function approveSubmission() {
    if (!selected) {
      return;
    }

    await runReviewAction(async () => {
      const response = await fetch(
        `/api/admin/artwork-submissions/${selected.id}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      await requireSuccessfulResponse(response);

      const remaining = submissions.filter(
        (submission) => submission.id !== selected.id,
      );
      setSubmissions(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setForm(toArtworkForm(remaining[0]?.draft));
      if (isArtworkRarity(form.rarity)) {
        const approvedRarity = form.rarity;
        setRarityCounts((current) => ({
          ...current,
          [approvedRarity]: current[approvedRarity] + 1,
        }));
      }
      setMessage("Artwork approved and added to the game catalog.");
    });
  }

  async function runReviewAction(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createArtist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const artistForm = new FormData(event.currentTarget);

    await runReviewAction(async () => {
      const response = await fetch("/api/admin/artists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artist_name: artistForm.get("artist_name"),
          date_of_birth: artistForm.get("date_of_birth"),
          date_of_death: artistForm.get("date_of_death"),
        }),
      });
      const result = (await requireSuccessfulResponse(response)) as {
        artist: { _id: string; artist_name: string };
      };
      const artist = {
        id: result.artist._id,
        name: result.artist.artist_name,
      };

      setArtists((current) =>
        [...current, artist].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      updateField("artist_id", artist.id);
      setShowArtistForm(false);
      setMessage(`Created artist ${artist.name}.`);
    });
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const uploadForm = new FormData(element);

    await runReviewAction(async () => {
      const response = await fetch("/api/admin/artwork-submissions", {
        method: "POST",
        body: uploadForm,
      });
      const result = (await requireSuccessfulResponse(response)) as {
        submission: SubmissionView;
      };
      const submission = result.submission;

      setSubmissions((current) => {
        const withoutUploaded = current.filter(
          (candidate) => candidate.id !== submission.id,
        );
        return [submission, ...withoutUploaded];
      });
      setSelectedId(submission.id);
      setForm(toArtworkForm(submission.draft));
      setImageAspectRatio(undefined);
      element.reset();
      setMessage(
        response.status === 201
          ? "Image uploaded for review."
          : "This image was already in the review queue.",
      );
    });
  }

  function toggleRejected(checked: boolean) {
    setShowRejected(checked);

    if (checked && !selected) {
      const firstRejected = submissions.find(
        (submission) => submission.status === "rejected",
      );

      if (firstRejected) {
        selectSubmission(firstRejected);
      }
    } else if (!checked && selected?.status === "rejected") {
      const firstActive = submissions.find(
        (submission) => submission.status !== "rejected",
      );
      setSelectedId(firstActive?.id ?? "");
      setForm(toArtworkForm(firstActive?.draft));
      setImageAspectRatio(undefined);
    }
  }

  const uploadPanel = (
    <form
      className="mb-8 flex flex-col gap-4 rounded-lg border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-end"
      onSubmit={uploadImage}
    >
      <label className="grid flex-1 gap-2">
        <span className="font-semibold">Upload artwork from this computer</span>
        <input
          accept="image/bmp,image/gif,image/jpeg,image/png,image/tiff,image/webp"
          className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
          name="image"
          required
          type="file"
        />
      </label>
      <button
        className="rounded-md bg-white px-4 py-2 font-semibold text-black disabled:opacity-60"
        disabled={busy}
        type="submit"
      >
        {busy ? "Uploading..." : "Upload for review"}
      </button>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          checked={showRejected}
          onChange={(event) => toggleRejected(event.target.checked)}
          type="checkbox"
        />
        Show rejected
      </label>
    </form>
  );

  if (!selected) {
    return (
      <>
        {uploadPanel}
        <div className="rounded-lg border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold">No artwork awaiting review</h2>
          <p className="mt-2 text-[var(--muted)]">
            Upload an image above to begin a new artwork review.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {uploadPanel}
      <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          {visibleSubmissions.length} submissions
        </p>
        {visibleSubmissions.map((submission) => (
          <button
            className={`w-full rounded-md border p-3 text-left ${
              submission.id === selected.id
                ? "border-[var(--accent)] bg-white/10"
                : "border-white/10 bg-white/5"
            }`}
            key={submission.id}
            onClick={() => selectSubmission(submission)}
            type="button"
          >
            <span className="block truncate font-semibold">
              {submission.sources[0]?.filename ?? submission.id}
            </span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {submission.status} · {submission.sources.length} source
              {submission.sources.length === 1 ? "" : "s"}
            </span>
          </button>
        ))}
        </aside>

        <section className="space-y-8">
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
              <Image
                alt="Artwork awaiting review"
                className="object-contain"
                fill
                key={selected.id}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setImageAspectRatio(
                    image.naturalWidth / image.naturalHeight,
                  );
                }}
                src={`/api/admin/artwork-submissions/${selected.id}/image`}
                unoptimized
              />
            </div>
            <div className="mt-4 rounded-md border border-white/10 p-3">
              <p className="font-semibold">Source files</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                {selected.sources.map((source) => (
                  <li className="break-all" key={source.path}>
                    {source.path}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid content-start gap-4">
            <label className="grid gap-2">
              <span className="font-semibold">Artist</span>
              <div className="flex gap-2">
                <select
                  className="min-w-0 flex-1 rounded-md border border-white/20 bg-[#19171d] px-3 py-2"
                  onChange={(event) =>
                    updateField("artist_id", event.target.value)
                  }
                  value={form.artist_id}
                >
                  <option value="">Select an artist</option>
                  {artists.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-md border border-white/20 px-3 py-2"
                  onClick={() => setShowArtistForm((current) => !current)}
                  type="button"
                >
                  Create new artist
                </button>
              </div>
            </label>

            {showArtistForm ? (
              <form
                className="grid gap-3 rounded-md border border-[var(--accent)]/50 bg-white/5 p-4"
                onSubmit={createArtist}
              >
                <h3 className="font-semibold">New artist</h3>
                <input
                  className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
                  name="artist_name"
                  placeholder="Artist name"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
                    name="date_of_birth"
                    placeholder="Date of birth"
                  />
                  <input
                    className="rounded-md border border-white/20 bg-black/20 px-3 py-2"
                    name="date_of_death"
                    placeholder="Date of death"
                  />
                </div>
                <button
                  className="rounded-md bg-white px-3 py-2 font-semibold text-black"
                  disabled={busy}
                  type="submit"
                >
                  Create artist
                </button>
              </form>
            ) : null}

            <TextField
              label="Title"
              onChange={(value) => updateField("title", value)}
              value={form.title}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Creation year"
                onChange={(value) => updateField("date", value)}
                type="number"
                value={form.date}
              />
              <TextField
                label="Value scale (0–1)"
                onChange={(value) => updateField("value_scale", value)}
                step="0.001"
                type="number"
                value={form.value_scale}
              />
            </div>
            <TextField
              label="Height (cm)"
              onChange={(value) => updateField("height", value)}
              step="0.01"
              type="number"
              value={form.height}
            />
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-sm text-[var(--muted)]">
                Calculated width
              </span>
              <p className="font-semibold">
                {calculatedWidth === undefined
                  ? "Enter a height to calculate"
                  : `${calculatedWidth} cm`}
              </p>
            </div>
            <TextField
              label="Medium"
              onChange={(value) => updateField("medium", value)}
              value={form.medium}
            />
            <TextField
              label="Genre or style"
              onChange={(value) => updateField("genre", value)}
              value={form.genre}
            />
            <label className="grid gap-2">
              <span className="font-semibold">Rarity</span>
              <span className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {ARTWORK_RARITIES.map((rarity) => (
                  <span
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-center text-xs"
                    key={rarity}
                  >
                    <strong className={`rarity-text ${rarity}`}>
                      {rarity}
                    </strong>{" "}
                    <span className="text-[var(--muted)]">
                      {rarityCounts[rarity].toLocaleString()}
                    </span>
                  </span>
                ))}
              </span>
              <select
                className="rounded-md border border-white/20 bg-[#19171d] px-3 py-2"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rarity: event.target.value,
                    special_attribute_ids:
                      current.special_attribute_ids.slice(
                        0,
                        getRequiredSpecialAttributeCount(event.target.value),
                      ),
                  }))
                }
                value={form.rarity}
              >
                {ARTWORK_RARITIES.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {capitalize(rarity)} ({rarityCounts[rarity].toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-2 rounded-md border border-white/10 p-3">
              <legend className="px-1 font-semibold">
                Special attributes ({form.special_attribute_ids.length}/
                {requiredSpecialAttributes})
              </legend>
              {requiredSpecialAttributes === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  <span className={`rarity-text ${form.rarity}`}>
                    {form.rarity}
                  </span>{" "}
                  artworks do not have special attributes.
                </p>
              ) : (
                <>
                  <p className="text-sm text-[var(--muted)]">
                    These attributes are always present when an item of this
                    artwork is generated.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {initialAttributes.map((attribute) => {
                      const selected = form.special_attribute_ids.includes(
                        attribute.id,
                      );
                      const selectionFull =
                        form.special_attribute_ids.length >=
                        requiredSpecialAttributes;
                      return (
                        <label
                          className="flex items-center gap-2"
                          key={attribute.id}
                        >
                          <input
                            checked={selected}
                            disabled={!selected && selectionFull}
                            onChange={(event) =>
                              updateField(
                                "special_attribute_ids",
                                event.target.checked
                                  ? [
                                      ...form.special_attribute_ids,
                                      attribute.id,
                                    ]
                                  : form.special_attribute_ids.filter(
                                      (id) => id !== attribute.id,
                                    ),
                              )
                            }
                            type="checkbox"
                          />
                          {attribute.name}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </fieldset>
            <label className="flex items-center gap-3">
              <input
                checked={form.nsfw}
                onChange={(event) =>
                  updateField("nsfw", event.target.checked)
                }
                type="checkbox"
              />
              <span className="font-semibold">Mark as NSFW</span>
            </label>
          </div>
        </div>

        {error ? <p className="text-red-400">{error}</p> : null}
        {message ? <p className="text-green-400">{message}</p> : null}

        <div className="flex flex-wrap gap-3 border-t border-white/10 pt-6">
          <button
            className="rounded-md border border-white/20 px-4 py-2 font-semibold"
            disabled={busy}
            onClick={saveDraft}
            type="button"
          >
            Save draft
          </button>
          <button
            className="rounded-md border border-red-400/50 px-4 py-2 font-semibold text-red-300"
            disabled={busy}
            onClick={rejectSubmission}
            type="button"
          >
            Reject
          </button>
          <button
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-black"
            disabled={busy}
            onClick={approveSubmission}
            type="button"
          >
            Approve artwork
          </button>
        </div>
        </section>
      </div>
    </>
  );
}

function TextField({
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
        className="rounded-md border border-white/20 bg-white/5 px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type={type}
        value={value}
      />
    </label>
  );
}

function toArtworkForm(
  draft: Record<string, unknown> | undefined,
): ArtworkForm {
  if (!draft) {
    return EMPTY_FORM;
  }

  return {
    artist_id: String(draft.artist_id ?? ""),
    title: String(draft.title ?? ""),
    date: String(draft.date ?? ""),
    genre: String(draft.genre ?? ""),
    medium: String(draft.medium ?? ""),
    rarity: String(draft.rarity ?? "common"),
    value_scale: String(draft.value_scale ?? ""),
    height: String(draft.height ?? ""),
    special_attribute_ids: Array.isArray(draft.special_attribute_ids)
      ? draft.special_attribute_ids.map(String)
      : [],
    nsfw: draft.nsfw === true,
  };
}

function getRequiredSpecialAttributeCount(rarity: string): number {
  return (
    {
      common: 0,
      uncommon: 0,
      rare: 1,
      legendary: 2,
      masterpiece: 3,
    }[rarity] ?? 0
  );
}

function isArtworkRarity(rarity: string): rarity is ArtworkRarity {
  return ARTWORK_RARITIES.some((candidate) => candidate === rarity);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function requireSuccessfulResponse(response: Response) {
  const result = (await response.json()) as {
    error?: string;
    [key: string]: unknown;
  };

  if (!response.ok) {
    throw new Error(result.error ?? "The request failed.");
  }

  return result;
}

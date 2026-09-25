"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { Artwork, GameItem } from "@/server/gameplay";
import type {
  HallOfFameQualifier,
  HallOfFameRecord,
  HallOfFameSubmission,
} from "@/server/hall-of-fame";

type QualifierMatch = HallOfFameQualifier & {
  status: "available" | "pending" | "inducted";
};

export default function AdminHallOfFamePage() {
  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [searchResult, setSearchResult] = useState<{
    item: GameItem;
    artwork: Artwork | null;
    owner_screen_name: string;
    existing_hall_of_fame: HallOfFameRecord | null;
    qualifier_matches: QualifierMatch[];
  } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedQualifierId, setSelectedQualifierId] = useState<string | null>(
    null,
  );
  const [records, setRecords] = useState<HallOfFameRecord[]>([]);
  const [submissions, setSubmissions] = useState<HallOfFameSubmission[]>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function loadRecords() {
    try {
      const response = await fetch("/api/admin/hall-of-fame");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Hall of Fame data could not be loaded.");
      }
      setRecords(data.records || []);
      setSubmissions(data.submissions || []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Hall of Fame data could not be loaded.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/hall-of-fame")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.error || "Hall of Fame data could not be loaded.",
          );
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setRecords(data.records || []);
        setSubmissions(data.submissions || []);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Hall of Fame data could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSearchResult(null);
    if (!searchId.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/hall-of-fame?itemId=${encodeURIComponent(searchId.trim())}`,
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Search failed.");
      } else {
        setSearchResult(data);
        setSelectedQualifierId(null);
        setTitle("");
        setDescription("");
      }
    } catch {
      setError("An unexpected error occurred during search.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!searchResult) return;
    setError("");
    setMessage("");

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/hall-of-fame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: searchResult.item._id,
          title,
          description,
          qualifierId: selectedQualifierId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Submission failed.");
      } else {
        setMessage("Item successfully added to the Hall of Fame!");
        if (selectedQualifierId) {
          setSearchResult((current) =>
            current
              ? {
                  ...current,
                  qualifier_matches: current.qualifier_matches.map((match) =>
                    match.id === selectedQualifierId
                      ? { ...match, status: "inducted" }
                      : match,
                  ),
                }
              : current,
          );
        }
        setSelectedQualifierId(null);
        setTitle("");
        setDescription("");
        await loadRecords();
      }
    } catch {
      setError("An unexpected error occurred while saving.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewSubmission(
    submissionId: string,
    decision: "approve" | "deny",
  ) {
    setPendingActionId(submissionId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/hall-of-fame", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, decision }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "The submission could not be reviewed.");
        return;
      }
      setMessage(
        decision === "approve"
          ? "Hall of Fame submission approved."
          : "Hall of Fame submission denied.",
      );
      await loadRecords();
    } catch {
      setError("An unexpected error occurred while reviewing the submission.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function deleteRecord(recordId: string) {
    setPendingActionId(recordId);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/hall-of-fame?recordId=${encodeURIComponent(recordId)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "The Hall of Fame record could not be deleted.");
        return;
      }
      setMessage("Hall of Fame record deleted.");
      await loadRecords();
    } catch {
      setError("An unexpected error occurred while deleting the record.");
    } finally {
      setPendingActionId(null);
    }
  }

  function startEditingRecord(record: HallOfFameRecord) {
    setEditingRecordId(record._id);
    setEditTitle(record.title);
    setEditDescription(record.description);
    setError("");
    setMessage("");
  }

  function cancelEditingRecord() {
    setEditingRecordId(null);
    setEditTitle("");
    setEditDescription("");
  }

  async function updateRecord(event: FormEvent, recordId: string) {
    event.preventDefault();
    setPendingActionId(recordId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/hall-of-fame", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          title: editTitle,
          description: editDescription,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "The Hall of Fame record could not be updated.");
        return;
      }
      setMessage("Hall of Fame record updated.");
      cancelEditingRecord();
      await loadRecords();
    } catch {
      setError("An unexpected error occurred while updating the record.");
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <main className="max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--accent)]">Hall of Fame Management</h1>
        <p className="text-sm text-[var(--muted)]">
          Search for any game item by ID, inspect details, and induct it into the Hall of Fame with a custom title and description.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400">
          {message}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            Pending qualifier submissions ({submissions.length})
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Automatically qualified items do not enter the Hall of Fame until an administrator approves them.
          </p>
        </div>
        {submissions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No submissions are awaiting review.</p>
        ) : (
          <div className="grid gap-4">
            {submissions.map((submission) => {
              const artwork = submission.item_snapshot.artwork;
              return (
                <article
                  className="rounded border border-amber-500/30 bg-amber-500/5 p-4"
                  key={submission._id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="font-bold text-[var(--accent)]">
                        {submission.title}
                      </h3>
                      <p className="text-sm">{submission.description}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {artwork?.title ??
                          submission.item_snapshot.artwork_title ??
                          submission.item_id}
                        {" by "}
                        {artwork?.artist ??
                          submission.item_snapshot.artist_name ??
                          "Unknown artist"}
                        {" · "}
                        <strong
                          className="hof-rarity"
                          data-rarity={artwork?.rarity}
                        >
                          {artwork?.rarity ?? "unknown rarity"}
                        </strong>
                        {" · "}
                        {submission.player_screen_name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded border border-red-400/50 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50"
                        disabled={pendingActionId === submission._id}
                        onClick={() => reviewSubmission(submission._id, "deny")}
                        type="button"
                      >
                        Deny
                      </button>
                      <button
                        className="rounded bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                        disabled={pendingActionId === submission._id}
                        onClick={() => reviewSubmission(submission._id, "approve")}
                        type="button"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={handleSearch} className="flex gap-4">
        <input
          className="flex-1 rounded border border-white/20 bg-black/40 px-4 py-2 text-sm"
          placeholder="Enter Game Item ID (UUID)..."
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
        />
        <button
          className="rounded bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          disabled={searching}
          type="submit"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searchResult && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Item ID</p>
              <p className="font-mono">{searchResult.item._id}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Artwork</p>
              <p className="font-semibold">{searchResult.artwork?.title || "Unknown Title"}</p>
              <p className="text-xs text-[var(--muted)]">by {searchResult.artwork?.artist || "Unknown Artist"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Rarity / Level</p>
              <p className="capitalize">{searchResult.artwork?.rarity} (Lvl {searchResult.item.level})</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Owner</p>
              <p>{searchResult.owner_screen_name}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Attributes</p>
              <p>Condition: {(searchResult.item.condition * 100).toFixed(0)}% | Foil: {searchResult.item.foil ? "Yes" : "No"} | Mint: {searchResult.item.mint ? "Yes" : "No"} | Unlocked: {searchResult.item.unlocked ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Status</p>
              <p className="capitalize">{searchResult.item.status}</p>
            </div>
          </div>

          <section className="space-y-3 border-t border-white/10 pt-4">
            <div>
              <h2 className="font-bold text-white">
                Matching registered qualifications
              </h2>
              <p className="text-xs text-[var(--muted)]">
                This item may qualify for multiple independent Hall of Fame
                achievements.
              </p>
            </div>
            {searchResult.qualifier_matches.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                This item does not match any registered qualification.
              </p>
            ) : (
              <div className="grid gap-3">
                {searchResult.qualifier_matches.map((qualifier) => (
                  <article
                    className="flex flex-wrap items-start justify-between gap-4 rounded border border-white/10 bg-black/20 p-3"
                    key={qualifier.id}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[var(--accent)]">
                        {qualifier.title}
                      </h3>
                      <p className="text-xs text-[var(--muted)]">
                        {qualifier.description}
                      </p>
                    </div>
                    <button
                      className="rounded border border-emerald-400/50 px-3 py-2 text-xs font-bold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={qualifier.status !== "available"}
                      onClick={() => {
                        setSelectedQualifierId(qualifier.id);
                        setTitle(qualifier.title);
                        setDescription(qualifier.description);
                      }}
                      type="button"
                    >
                      {qualifier.status === "inducted"
                        ? "Already inducted"
                        : qualifier.status === "pending"
                          ? "Pending review"
                          : selectedQualifierId === qualifier.id
                            ? "Selected"
                            : "Use qualification"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-bold text-white">
                {selectedQualifierId
                  ? "Induct with registered qualification"
                  : "Custom Hall of Fame record"}
              </h2>
              {selectedQualifierId ? (
                <button
                  className="text-xs font-bold text-[var(--muted)] underline"
                  onClick={() => {
                    setSelectedQualifierId(null);
                    setTitle("");
                    setDescription("");
                  }}
                  type="button"
                >
                  Clear selection
                </button>
              ) : null}
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Hall of Fame Title</label>
              <input
                className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                placeholder="e.g. Masterpiece of the Millennium"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Description</label>
              <textarea
                className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                rows={3}
                maxLength={1000}
                placeholder="Explain why this artwork is enshrined..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <button
              className="rounded bg-emerald-500 px-6 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              disabled={submitting}
              type="submit"
            >
              {submitting
                ? "Saving..."
                : selectedQualifierId
                  ? "Induct qualification"
                  : "Submit custom record"}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4 border-t border-white/10 pt-6">
        <h2 className="text-lg font-bold text-white">Enshrined Hall of Fame Records ({records.length})</h2>
        {records.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No Hall of Fame records exist yet.</p>
        ) : (
          <div className="grid gap-4">
            {records.map((rec) => {
              const isEditing = editingRecordId === rec._id;
              return (
                <div key={rec._id} className="rounded border border-white/10 bg-black/20 p-4 space-y-3">
                  {isEditing ? (
                    <form
                      className="space-y-3"
                      onSubmit={(event) => updateRecord(event, rec._id)}
                    >
                      <label className="block">
                        <span className="mb-1 block text-xs text-[var(--muted)]">
                          Hall of Fame title
                        </span>
                        <input
                          className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                          maxLength={120}
                          onChange={(event) => setEditTitle(event.target.value)}
                          required
                          value={editTitle}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-[var(--muted)]">
                          Description
                        </span>
                        <textarea
                          className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm"
                          maxLength={1000}
                          onChange={(event) =>
                            setEditDescription(event.target.value)
                          }
                          required
                          rows={3}
                          value={editDescription}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          className="rounded bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-50"
                          disabled={pendingActionId === rec._id}
                          type="submit"
                        >
                          {pendingActionId === rec._id
                            ? "Saving..."
                            : "Save changes"}
                        </button>
                        <button
                          className="rounded border border-white/30 px-3 py-2 text-xs font-bold disabled:opacity-50"
                          disabled={pendingActionId === rec._id}
                          onClick={cancelEditingRecord}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-4">
                        <h3 className="font-bold text-[var(--accent)]">{rec.title}</h3>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--muted)]">{new Date(rec.created_at).toLocaleDateString()}</span>
                          <button
                            className="rounded border border-white/30 px-2 py-1 text-xs font-bold disabled:opacity-50"
                            disabled={pendingActionId === rec._id}
                            onClick={() => startEditingRecord(rec)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="rounded border border-red-400/50 px-2 py-1 text-xs font-bold text-red-300 disabled:opacity-50"
                            disabled={pendingActionId === rec._id}
                            onClick={() => deleteRecord(rec._id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-sm">{rec.description}</p>
                    </>
                  )}
                  <div className="flex gap-4 text-xs text-[var(--muted)] pt-2">
                    <span>Artwork: <strong>{rec.item_snapshot?.artwork_title || rec.item_id}</strong></span>
                    <span>Owner: <strong>{rec.player_screen_name || rec.player_id || "System"}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

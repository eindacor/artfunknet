"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ArtworkStorageConnectionStatus } from "@/server/artwork-storage";
import type { DatabaseSnapshotFile } from "@/server/database-snapshots";

export default function DatabaseAdmin({
  databaseName,
  initialSnapshots,
  initialStorageStatus,
}: {
  databaseName: string;
  initialSnapshots: DatabaseSnapshotFile[];
  initialStorageStatus: ArtworkStorageConnectionStatus;
}) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [selected, setSelected] = useState(initialSnapshots[0]?.name ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [storageStatus, setStorageStatus] = useState(initialStorageStatus);

  async function refreshSnapshots() {
    const response = await fetch("/api/admin/database/snapshots");
    const body = (await response.json()) as {
      error?: string;
      snapshots?: DatabaseSnapshotFile[];
    };
    if (!response.ok || !body.snapshots) {
      throw new Error(body.error ?? "Snapshots could not be refreshed.");
    }
    setSnapshots(body.snapshots);
    setSelected((current) =>
      body.snapshots?.some((snapshot) => snapshot.name === current)
        ? current
        : body.snapshots?.[0]?.name ?? "",
    );
  }

  async function generate() {
    setBusy("generate");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/database/snapshots", {
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        snapshot?: DatabaseSnapshotFile;
      };
      if (!response.ok || !body.snapshot) {
        throw new Error(body.error ?? "The snapshot could not be generated.");
      }
      await refreshSnapshots();
      setSelected(body.snapshot.name);
      setMessage(`Generated ${body.snapshot.name}.`);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "The snapshot could not be generated.",
      );
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    setMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.set("snapshot", file);
      const response = await fetch(
        "/api/admin/database/snapshots/upload",
        {
          method: "POST",
          body: formData,
        },
      );
      const body = (await response.json()) as {
        error?: string;
        snapshot?: DatabaseSnapshotFile;
      };
      if (!response.ok || !body.snapshot) {
        throw new Error(body.error ?? "The snapshot could not be uploaded.");
      }
      await refreshSnapshots();
      setSelected(body.snapshot.name);
      setMessage(`Uploaded ${body.snapshot.name}.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The snapshot could not be uploaded.",
      );
    } finally {
      setBusy("");
    }
  }

  async function restore() {
    setBusy("restore");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/database/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: selected,
          confirmation,
        }),
      });
      const body = (await response.json()) as {
        collectionCount?: number;
        documentCount?: number;
        error?: string;
      };
      if (
        !response.ok ||
        body.collectionCount === undefined ||
        body.documentCount === undefined
      ) {
        throw new Error(body.error ?? "The snapshot could not be loaded.");
      }
      setConfirmation("");
      setMessage(
        `Loaded ${body.documentCount.toLocaleString()} documents across ${body.collectionCount} collections.`,
      );
      router.refresh();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "The snapshot could not be loaded.",
      );
    } finally {
      setBusy("");
    }
  }

  async function testArtworkStorage() {
    setBusy("storage");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/database/artwork-storage", {
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        status?: ArtworkStorageConnectionStatus;
      };
      if (!response.ok || !body.status) {
        throw new Error(body.error ?? "Artwork storage could not be tested.");
      }
      setStorageStatus(body.status);
      if (!body.status.connected) {
        throw new Error(body.status.message);
      }
      setMessage(body.status.message);
    } catch (storageError) {
      setError(
        storageError instanceof Error
          ? storageError.message
          : "Artwork storage could not be tested.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="database-admin">
      <section className="database-admin-panel">
        <h2>Artwork storage</h2>
        <p>
          S3 credentials remain in the server environment or its AWS IAM role.
          This page reports the active configuration and verifies that the
          application can access it before catalog uploads are attempted.
        </p>
        <dl className="database-storage-status">
          <div>
            <dt>Provider</dt>
            <dd>{storageStatus.provider}</dd>
          </div>
          <div>
            <dt>Bucket</dt>
            <dd>{storageStatus.bucket ?? "Local storage"}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{storageStatus.region}</dd>
          </div>
          <div>
            <dt>Connection</dt>
            <dd>
              {storageStatus.connected === null
                ? "Not tested"
                : storageStatus.connected
                  ? "Available"
                  : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Artwork CDN</dt>
            <dd>{storageStatus.cdnBaseUrl ?? "Not configured"}</dd>
          </div>
        </dl>
        <p>{storageStatus.message}</p>
        <button
          disabled={busy.length > 0}
          onClick={testArtworkStorage}
          type="button"
        >
          {busy === "storage" ? "Testing..." : "Test artwork storage"}
        </button>
        <p>
          Content packages do not include local mock-S3 files. When
          <code> USE_MOCK_S3=true</code>, copy
          <code> storage/mock-s3</code> separately. Real S3 objects remain in
          the configured bucket.
        </p>
      </section>

      <section className="database-admin-panel">
        <h2>Generate content package</h2>
        <p>
          Exports artists, artworks, attributes, legendary attributes, gallery
          finishes, gameplay metadata, and their non-default indexes. Player
          accounts, generated items, archives, auctions, quests, notifications,
          NPC state, and lottery state are excluded.
        </p>
        <button disabled={busy.length > 0} onClick={generate} type="button">
          {busy === "generate" ? "Generating..." : "Generate content package"}
        </button>
      </section>

      <section className="database-admin-panel">
        <h2>Available content packages</h2>
        <p>
          Files are stored in <code>storage/db-backups</code>. Copy a file into
          that directory over SSH, or upload it here.
        </p>
        <label>
          Content package
          <select
            disabled={busy.length > 0 || snapshots.length === 0}
            onChange={(event) => setSelected(event.target.value)}
            value={selected}
          >
            {snapshots.map((snapshot) => (
              <option key={snapshot.name} value={snapshot.name}>
                {snapshot.name} ({formatBytes(snapshot.size)})
              </option>
            ))}
          </select>
        </label>
        <div className="database-admin-actions">
          <a
            aria-disabled={!selected}
            href={
              selected
                ? `/api/admin/database/snapshots/${encodeURIComponent(selected)}`
                : undefined
            }
          >
            Download selected package
          </a>
          <label className="database-upload-button">
            {busy === "upload" ? "Uploading..." : "Upload content package"}
            <input
              accept=".gz,application/gzip"
              disabled={busy.length > 0}
              onChange={(event) => void upload(event.target.files?.[0])}
              type="file"
            />
          </label>
        </div>
      </section>

      <section className="database-admin-panel database-restore-panel">
        <h2>Load content package</h2>
        <p>
          This replaces only the exported content collections and metadata.
          Player and live-game collections are untouched. A pre-load content
          package is generated automatically.
        </p>
        <label>
          Type <strong>LOAD CONTENT {databaseName}</strong> to confirm
          <input
            autoComplete="off"
            disabled={busy.length > 0}
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>
        <button
          disabled={
            busy.length > 0 ||
            !selected ||
            confirmation !== `LOAD CONTENT ${databaseName}`
          }
          onClick={restore}
          type="button"
        >
          {busy === "restore" ? "Loading..." : "Load selected content"}
        </button>
      </section>

      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type ArtworkEffectView = {
  id: string;
  effectType: "legendary" | "masterpiece";
  title: string;
  description: string;
  flavorText: string;
  code: string;
  active: boolean;
  linkedAttributeIds: string[];
  linkedAttributeIcons: string[];
  linkedAttributeNames: string[];
  parameters: Record<string, boolean | number | string>;
  artworks: {
    id: string;
    active: boolean;
    artist: string;
    rarity: string;
    title: string;
  }[];
  artworkCount: number;
};

export type ArtworkAttributeOption = { id: string; icon: string; name: string };

const EMPTY_EFFECT: ArtworkEffectView = {
  id: "",
  effectType: "legendary",
  title: "",
  description: "",
  flavorText: "",
  code: "",
  active: false,
  linkedAttributeIds: [],
  linkedAttributeIcons: [],
  linkedAttributeNames: [],
  parameters: {},
  artworks: [],
  artworkCount: 0,
};

export default function ArtworkEffectEditor({
  initialRecords,
  attributes,
}: {
  initialRecords: ArtworkEffectView[];
  attributes: ArtworkAttributeOption[];
}) {
  const [selectedType, setSelectedType] =
    useState<ArtworkEffectView["effectType"]>("legendary");
  const [creating, setCreating] = useState(false);
  const records = initialRecords.filter(
    (record) => record.effectType === selectedType,
  );
  const legendaryCount = initialRecords.filter(
    (record) => record.effectType === "legendary",
  ).length;
  const masterpieceCount = initialRecords.length - legendaryCount;

  return (
    <div className="unique-effects-admin">
      <div aria-label="Effect type" className="unique-effects-tabs" role="tablist">
        <button
          aria-selected={selectedType === "legendary"}
          className={selectedType === "legendary" ? "is-active" : ""}
          onClick={() => setSelectedType("legendary")}
          role="tab"
          type="button"
        >
          Legendary <span>{legendaryCount}</span>
        </button>
        <button
          aria-selected={selectedType === "masterpiece"}
          className={selectedType === "masterpiece" ? "is-active" : ""}
          onClick={() => setSelectedType("masterpiece")}
          role="tab"
          type="button"
        >
          Masterpiece <span>{masterpieceCount}</span>
        </button>
      </div>
      <div className="unique-effects-toolbar">
        <button
          className="unique-effect-create-button"
          onClick={() => setCreating(true)}
          type="button"
        >
          Create {selectedType} effect
        </button>
      </div>
      <div className="unique-effects-list" role="tabpanel">
        {records.map((record) => (
          <ArtworkEffectForm
            attributes={attributes}
            key={record.id}
            record={record}
          />
        ))}
      </div>
      {creating ? (
        <ArtworkEffectCreateDialog
          attributes={attributes}
          effectType={selectedType}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function ArtworkEffectCreateDialog({
  attributes,
  effectType,
  onClose,
}: {
  attributes: ArtworkAttributeOption[];
  effectType: ArtworkEffectView["effectType"];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby="unique-effect-create-title"
      className="unique-effect-create-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="unique-effect-create-dialog-content">
        <button
          aria-label="Close create effect dialog"
          className="unique-effect-dialog-close"
          onClick={onClose}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-times" />
        </button>
        <h2 id="unique-effect-create-title">
          Create {effectType} effect
        </h2>
        <p>New effects are created inactive.</p>
        <ArtworkEffectForm
          attributes={attributes}
          onSaved={onClose}
          record={{ ...EMPTY_EFFECT, effectType }}
          variant="modal"
        />
      </div>
    </dialog>
  );
}

function ArtworkEffectForm({
  attributes,
  onSaved,
  record,
  variant = "card",
}: {
  attributes: ArtworkAttributeOption[];
  onSaved?: () => void;
  record: ArtworkEffectView;
  variant?: "card" | "modal";
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [effectType, setEffectType] = useState(record.effectType);

  async function save(formData: FormData) {
    setSaving(true);
    setMessage("");
    let parameters: unknown;
    try {
      parameters = JSON.parse(String(formData.get("parameters")));
    } catch {
      setMessage("Parameters must be valid JSON.");
      setSaving(false);
      return;
    }
    const linkedAttributes = formData
      .getAll("linkedAttributes")
      .map(String);
    let saved = false;
    try {
      const response = await fetch(
        record.id
          ? `/api/admin/legendary-attributes/${record.id}`
          : "/api/admin/legendary-attributes",
        {
          method: record.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effectType,
            linkedAttributes,
            title: formData.get("title"),
            description: formData.get("description"),
            flavorText: formData.get("flavorText"),
            code: formData.get("code"),
            active: formData.get("active") === "on",
            parameters,
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      setMessage(
        response.ok
          ? body.message ?? (record.id ? "Saved." : "Created inactive.")
          : body.error ?? "Save failed.",
      );
      if (response.ok) {
        router.refresh();
        saved = true;
      }
    } catch {
      setMessage("Unable to reach the server. Save failed.");
    } finally {
      setSaving(false);
    }
    if (saved) onSaved?.();
  }

  async function remove() {
    if (
      !record.id ||
      record.artworkCount > 0 ||
      !window.confirm(`Delete "${record.title}"? This cannot be undone.`)
    ) {
      return;
    }
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/legendary-attributes/${record.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      setMessage(
        response.ok
          ? body.message ?? "Deleted."
          : body.error ?? "Delete failed.",
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage("Unable to reach the server. Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const linkedCount = effectType === "legendary" ? 2 : 1;
  const busy = saving || deleting;
  const form = (
    <form action={save} className="unique-effect-form">
      <div className="unique-effect-heading">
        <strong>
          {record.id
            ? record.linkedAttributeNames.join(" + ")
            : `New ${effectType} effect`}
        </strong>
        {record.id ? (
          <label className="unique-effect-active-toggle">
            <input
              defaultChecked={record.active}
              name="active"
              type="checkbox"
            />
            Active
          </label>
        ) : (
          <span>New effects must be saved before activation.</span>
        )}
      </div>
      {record.id ? (
        <div className="unique-effect-artworks">
          <strong>Associated artworks ({record.artworkCount})</strong>
          {record.artworks.length > 0 ? (
            <ul>
              {record.artworks.map((artwork) => (
                <li key={artwork.id}>
                  <span>
                    <strong>{artwork.title}</strong> by {artwork.artist}
                  </span>
                  <span className={`rarity-text ${artwork.rarity}`}>
                    {artwork.rarity}
                  </span>
                  <span>{artwork.active ? "Active" : "Inactive"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span>No artworks are associated with this effect.</span>
          )}
        </div>
      ) : null}
      {record.id ? (
        <label>
          Effect type
          <select
            disabled={record.artworkCount > 0}
            name="effectType"
            onChange={(event) =>
              setEffectType(event.target.value as typeof effectType)
            }
            value={effectType}
          >
            <option value="legendary">Legendary</option>
            <option value="masterpiece">Masterpiece</option>
          </select>
        </label>
      ) : null}
      <label>
        Title
        <input defaultValue={record.title} name="title" required />
      </label>
      <label>
        Behavior code
        <input defaultValue={record.code} name="code" required />
      </label>
      <fieldset>
        <legend>Linked attributes ({linkedCount} required)</legend>
        <div className="unique-effect-attributes">
          {attributes.map((attribute) => (
            <label key={attribute.id}>
              <input
                defaultChecked={record.linkedAttributeIds.includes(
                  attribute.id,
                )}
                name="linkedAttributes"
                type="checkbox"
                value={attribute.id}
              />
              {attribute.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Description
        <textarea
          defaultValue={record.description}
          name="description"
          required
          rows={2}
        />
      </label>
      <label>
        Flavor text
        <textarea
          defaultValue={record.flavorText}
          name="flavorText"
          required
          rows={2}
        />
      </label>
      <label>
        Behavior parameters (JSON)
        <textarea
          defaultValue={JSON.stringify(record.parameters, null, 2)}
          name="parameters"
          rows={3}
        />
      </label>
      <div className="unique-effect-actions">
        <button disabled={busy} type="submit">
          {saving ? "Saving..." : record.id ? "Save" : "Create inactive"}
        </button>
        {record.id && record.artworkCount === 0 ? (
          <button
            className="unique-effect-delete"
            disabled={busy}
            onClick={remove}
            type="button"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        ) : null}
        <span aria-live="polite">{message}</span>
      </div>
    </form>
  );

  if (variant === "modal") return form;

  return (
    <details className="unique-effect-card">
      <summary>
        <span className="unique-effect-summary-main">
          <strong>{record.title}</strong>
          <span>{record.code}</span>
        </span>
        <span className="unique-effect-summary-meta">
          <span
            aria-label={record.linkedAttributeNames.join(" and ")}
            className="unique-effect-summary-attributes"
            role="group"
          >
            {record.linkedAttributeIcons.map((icon, index) => (
              <i
                aria-label={record.linkedAttributeNames[index]}
                className={`fa ${icon}`}
                key={record.linkedAttributeIds[index]}
                role="img"
                title={record.linkedAttributeNames[index]}
              />
            ))}
          </span>
          <span>{record.artworkCount} artwork(s)</span>
          <span className={record.active ? "is-active" : "is-inactive"}>
            {record.active ? "Active" : "Inactive"}
          </span>
        </span>
      </summary>
      {form}
    </details>
  );
}

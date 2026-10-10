"use client";

import { useState } from "react";

import { useUpdateCardCosmeticName } from "@/components/item-cards/card-cosmetics-provider";
import type { CardRendererId } from "@/components/item-cards/types";

export default function CardRendererActivation({
  rendererId,
  initialActive,
  initialName,
  initialSupporter,
  onNameUpdated,
}: {
  rendererId: CardRendererId;
  initialActive: boolean;
  initialName: string;
  initialSupporter: boolean;
  onNameUpdated: (name: string) => void;
}) {
  const updateCatalogName = useUpdateCardCosmeticName();
  const [active, setActive] = useState(initialActive);
  const [supporter, setSupporter] = useState(initialSupporter);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function update(nextActive: boolean) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/card-renderers/${rendererId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Activation could not be updated.");
      }
      setActive(nextActive);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Activation could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateSupporter(nextSupporter: boolean) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/card-renderers/${rendererId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supporter: nextSupporter }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error ?? "Supporter availability could not be updated.",
        );
      }
      setSupporter(nextSupporter);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Supporter availability could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateName() {
    const nextName = name.trim();
    if (!nextName || nextName === savedName) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/card-renderers/${rendererId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const body = (await response.json()) as { error?: string; name?: string };
      if (!response.ok || !body.name) {
        throw new Error(
          body.error ?? "The art style name could not be updated.",
        );
      }
      setName(body.name);
      setSavedName(body.name);
      updateCatalogName(rendererId, body.name);
      onNameUpdated(body.name);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The art style name could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-renderer-activation">
      <label className="card-renderer-name">
        Art style name
        <span>
          <input
            disabled={saving}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <button
            disabled={
              saving ||
              name.trim().length === 0 ||
              name.trim() === savedName
            }
            onClick={() => void updateName()}
            type="button"
          >
            {saving ? "Saving..." : "Save name"}
          </button>
        </span>
      </label>
      <label>
        <input
          checked={active}
          disabled={saving}
          onChange={(event) => void update(event.target.checked)}
          type="checkbox"
        />
        Active
      </label>
      <label>
        <input
          checked={supporter}
          disabled={saving}
          onChange={(event) => void updateSupporter(event.target.checked)}
          type="checkbox"
        />
        Supporter only
      </label>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

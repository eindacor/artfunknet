"use client";

import { useState } from "react";

import type { CardRendererId } from "@/components/item-cards/types";

export default function CardRendererActivation({
  rendererId,
  initialActive,
}: {
  rendererId: CardRendererId;
  initialActive: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function update(nextActive: boolean) {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/admin/card-renderers/${rendererId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    });
    const body = (await response.json()) as { error?: string };
    if (response.ok) {
      setActive(nextActive);
    } else {
      setError(body.error ?? "Activation could not be updated.");
    }
    setSaving(false);
  }

  return (
    <div className="card-renderer-activation">
      <label>
        <input
          checked={active}
          disabled={saving}
          onChange={(event) => void update(event.target.checked)}
          type="checkbox"
        />
        Active in store
      </label>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

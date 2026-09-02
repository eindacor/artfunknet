"use client";

import { useState } from "react";

import type { CardRendererId } from "@/components/item-cards/types";

export default function CardRendererActivation({
  rendererId,
  initialActive,
  initialPrice,
}: {
  rendererId: CardRendererId;
  initialActive: boolean;
  initialPrice: number;
}) {
  const [active, setActive] = useState(initialActive);
  const [price, setPrice] = useState(initialPrice);
  const [priceInput, setPriceInput] = useState(String(initialPrice));
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

  async function updatePrice() {
    const nextPrice = Number(priceInput);
    if (!Number.isSafeInteger(nextPrice) || nextPrice < 0) {
      setError("Price must be a non-negative whole number.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch(`/api/admin/card-renderers/${rendererId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: nextPrice }),
    });
    const body = (await response.json()) as {
      error?: string;
      price?: number;
    };
    if (response.ok && body.price !== undefined) {
      setPrice(body.price);
      setPriceInput(String(body.price));
    } else {
      setError(body.error ?? "Price could not be updated.");
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
        Active
      </label>
      <div className="card-renderer-price">
        <label>
          Store price
          <span>
            $
            <input
              disabled={saving}
              min={0}
              onChange={(event) => setPriceInput(event.target.value)}
              step={1}
              type="number"
              value={priceInput}
            />
          </span>
        </label>
        <button
          disabled={saving || Number(priceInput) === price}
          onClick={() => void updatePrice()}
          type="button"
        >
          Save price
        </button>
      </div>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

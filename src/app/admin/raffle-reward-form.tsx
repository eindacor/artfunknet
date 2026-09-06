"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ItemCard from "@/components/item-cards/item-card";
import { CARD_COSMETICS } from "@/components/item-cards/catalog";
import type { Artwork } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

type ArtworkOption = Artwork;

export default function RaffleRewardForm({
  artworks,
  bufferPrizes,
  prizes,
}: {
  artworks: ArtworkOption[];
  bufferPrizes: Array<{ item: HydratedGameItem; potency: number }>;
  prizes: Array<{ item: HydratedGameItem; potency: number }>;
}) {
  const router = useRouter();
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState("");

  async function drawLottery() {
    setDrawing(true);
    setDrawError("");
    try {
      const response = await fetch("/api/admin/lottery/draw", {
        method: "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The lottery could not be drawn.");
      }
      setDrawing(false);
      router.refresh();
    } catch (error) {
      setDrawError(
        error instanceof Error ? error.message : "The lottery could not be drawn.",
      );
      setDrawing(false);
    }
  }

  return (
    <div>
      <div className="admin-raffle-draw">
        <button disabled={drawing} onClick={drawLottery} type="button">
          {drawing ? "Drawing..." : "Draw lottery"}
        </button>
        {drawError ? <p className="admin-error">{drawError}</p> : null}
      </div>
      <h2>Active prizes</h2>
      <div className="admin-raffle-live-grid">
        {prizes.map((prize, index) => (
          <article
            className="admin-raffle-live-prize"
            key={`${prize.item._id}:${prize.potency}:${JSON.stringify(prize.item)}`}
          >
            <h3>Prize {index + 1}</h3>
            <ItemCard
              item={prize.item}
              legendaryAttributes={[]}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
            />
          </article>
        ))}
      </div>
      <h2>Replacement buffer</h2>
      <div className="admin-raffle-grid">
        {bufferPrizes.map((prize, index) => (
          <PrizeEditor
            artworks={artworks}
            index={index}
            key={`${prize.item._id}:${prize.potency}:${JSON.stringify(prize.item)}`}
            prize={prize}
          />
        ))}
      </div>
    </div>
  );
}

function PrizeEditor({
  artworks,
  index,
  prize,
}: {
  artworks: ArtworkOption[];
  index: number;
  prize: { item: HydratedGameItem; potency: number };
}) {
  const router = useRouter();
  const [item, setItem] = useState(prize.item);
  const [artworkId, setArtworkId] = useState(prize.item.artwork_id);
  const [condition, setCondition] = useState(
    Math.round(prize.item.condition * 100),
  );
  const [itemLevel, setItemLevel] = useState(prize.item.level);
  const [potency, setPotency] = useState(prize.potency);
  const [foil, setFoil] = useState(prize.item.foil);
  const [unlocked, setUnlocked] = useState(prize.item.unlocked);
  const [mint, setMint] = useState(prize.item.mint);
  const [seasonal, setSeasonal] = useState(prize.item.seasonal);
  const [cardRenderer, setCardRenderer] = useState(
    prize.item.card_renderer ?? "legacy",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function saveAndRefreshPreview() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/lottery", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: prize.item._id,
          pool: "buffer",
          artworkId,
          condition: mint ? 1 : condition / 100,
          itemLevel,
          potency,
          foil,
          unlocked,
          mint,
          seasonal,
          cardRenderer,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        item?: HydratedGameItem;
      };
      if (!response.ok || !body.item) {
        throw new Error(
          body.error ?? "The lottery item could not be updated.",
        );
      }
      setItem(body.item);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The lottery item could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }

  async function regenerate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/lottery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: prize.item._id,
          pool: "buffer",
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error ?? "The lottery item could not be regenerated.",
        );
      }
      router.refresh();
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error
          ? regenerateError.message
          : "The lottery item could not be regenerated.",
      );
      setPending(false);
    }
  }

  return (
    <article className="admin-raffle-editor">
      <div className="admin-raffle-fields">
        <h3>
          Buffer item {index + 1} properties
        </h3>
        <label>
          Artwork
          <select
            disabled={pending}
            onChange={(event) => setArtworkId(event.target.value)}
            value={artworkId}
          >
            {artworks.map((artwork) => (
              <option key={artwork._id} value={artwork._id}>
                {artwork.rarity} · {artwork.title} — {artwork.artist}
              </option>
            ))}
          </select>
        </label>
        <label>
          Art style
          <select
            disabled={pending}
            onChange={(event) => setCardRenderer(event.target.value)}
            value={cardRenderer}
          >
            {CARD_COSMETICS.filter(
              (cosmetic) => cosmetic.id !== "museum",
            ).map((cosmetic) => (
              <option key={cosmetic.id} value={cosmetic.id}>
                {cosmetic.name}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-raffle-number-grid">
          <label>
            Condition %
            <input
              disabled={pending || mint}
              max={100}
              min={0}
              onChange={(event) => setCondition(Number(event.target.value))}
              type="number"
              value={mint ? 100 : condition}
            />
          </label>
          <label>
            Promotion level
            <input
              disabled={pending}
              max={100}
              min={1}
              onChange={(event) => setItemLevel(Number(event.target.value))}
              type="number"
              value={itemLevel}
            />
          </label>
          <label>
            Lottery level
            <input
              disabled={pending}
              max={10}
              min={1}
              onChange={(event) => setPotency(Number(event.target.value))}
              type="number"
              value={potency}
            />
          </label>
        </div>
        <div className="admin-raffle-flags">
          <Flag checked={foil} disabled={pending} label="Foil" set={setFoil} />
          <Flag
            checked={unlocked}
            disabled={pending}
            label="Unlocked"
            set={setUnlocked}
          />
          <Flag checked={mint} disabled={pending} label="Mint" set={setMint} />
          <Flag
            checked={seasonal}
            disabled={pending}
            label="Seasonal"
            set={setSeasonal}
          />
        </div>
        <button
          disabled={pending}
          onClick={saveAndRefreshPreview}
          type="button"
        >
          {pending ? "Saving..." : "Save and refresh preview"}
        </button>
        <button disabled={pending} onClick={regenerate} type="button">
          Generate new item
        </button>
        {error ? <p className="admin-error">{error}</p> : null}
      </div>
      <div className="admin-raffle-preview">
        <h3>
          Buffer item {index + 1} preview
        </h3>
        <ItemCard
          item={item}
          key={JSON.stringify(item)}
          legendaryAttributes={[]}
          permissions={{
            canManageItem: false,
            canCustomizeCosmetic: false,
          }}
        />
      </div>
    </article>
  );
}

function Flag({
  checked,
  disabled,
  label,
  set,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  set: (checked: boolean) => void;
}) {
  return (
    <label>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => set(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

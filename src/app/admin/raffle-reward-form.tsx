"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ItemCard from "@/components/item-cards/item-card";
import { useCardCosmetics } from "@/components/item-cards/card-cosmetics-provider";
import type { Artwork } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

type ArtworkOption = Artwork;

export default function RaffleRewardForm({
  artworks,
  bufferPrizes,
  minimumBufferCount,
  nextDrawAt,
  prizes,
}: {
  artworks: ArtworkOption[];
  bufferPrizes: Array<{ item: HydratedGameItem; potency: number }>;
  minimumBufferCount: number;
  nextDrawAt: string;
  prizes: Array<{ item: HydratedGameItem; potency: number }>;
}) {
  const router = useRouter();
  const [drawing, setDrawing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [generationStatus, setGenerationStatus] = useState("");

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

  async function createLotteryItem() {
    setCreating(true);
    setGenerationStatus("");
    try {
      const response = await fetch("/api/admin/lottery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The lottery item could not be created.");
      }
      setGenerationStatus(body.message ?? "Lottery item created.");
      router.refresh();
    } catch (error) {
      setGenerationStatus(
        error instanceof Error
          ? error.message
          : "The lottery item could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="admin-raffle-draw">
        <button
          disabled={drawing}
          onClick={drawLottery}
          title={`Next draw: ${new Date(nextDrawAt).toLocaleString()}`}
          type="button"
        >
          {drawing ? "Drawing..." : "Draw lottery"}
        </button>
        {drawError ? <p className="admin-error">{drawError}</p> : null}
      </div>
      <section className="admin-raffle-generation">
        <div>
          <h2>Random prize generation</h2>
          <p>
            Random lottery items use the active Gameplay configuration rarity
            weights with elevated foil, unlocked, Mint, and art-style chances.
          </p>
        </div>
        <div className="admin-raffle-generation-actions">
          <button
            disabled={creating}
            onClick={createLotteryItem}
            type="button"
          >
            {creating ? "Creating..." : "Create lottery item"}
          </button>
        </div>
        {generationStatus ? <p>{generationStatus}</p> : null}
      </section>
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
      <h2>Replacement buffer ({bufferPrizes.length})</h2>
      <div className="admin-raffle-grid">
        {bufferPrizes.map((prize, index) => (
          <PrizeEditor
            artworks={artworks}
            canRemove={bufferPrizes.length > minimumBufferCount}
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
  canRemove,
  index,
  prize,
}: {
  artworks: ArtworkOption[];
  canRemove: boolean;
  index: number;
  prize: { item: HydratedGameItem; potency: number };
}) {
  const cardCosmetics = useCardCosmetics();
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

  async function removeFromBuffer() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/lottery", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: prize.item._id,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          body.error ?? "The lottery item could not be removed.",
        );
      }
      router.refresh();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "The lottery item could not be removed.",
      );
    } finally {
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
            {cardCosmetics.filter(
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
        <button
          disabled={pending || !canRemove}
          onClick={removeFromBuffer}
          title={
            canRemove
              ? "Remove this item from the lottery buffer"
              : "The lottery buffer must retain its minimum item count"
          }
          type="button"
        >
          Remove from buffer
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

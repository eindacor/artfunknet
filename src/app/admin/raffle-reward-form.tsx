"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ItemCard from "@/components/item-cards/item-card";
import type { ArtworkRarity } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

type ArtworkOption = {
  id: string;
  artist: string;
  title: string;
  rarity: ArtworkRarity;
};

export default function RaffleRewardForm({
  artworks,
  prizes,
}: {
  artworks: ArtworkOption[];
  prizes: Array<{ item: HydratedGameItem; potency: number }>;
}) {
  return (
    <div className="admin-raffle-grid">
      {prizes.map((prize) => (
        <PrizeEditor
          artworks={artworks}
          key={prize.item._id}
          prize={prize}
        />
      ))}
    </div>
  );
}

function PrizeEditor({
  artworks,
  prize,
}: {
  artworks: ArtworkOption[];
  prize: { item: HydratedGameItem; potency: number };
}) {
  const router = useRouter();
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(method: "PATCH" | "POST") {
    setPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/raffle", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          method === "POST"
            ? { itemId: prize.item._id }
            : {
                itemId: prize.item._id,
                artworkId,
                condition: condition / 100,
                itemLevel,
                potency,
                foil,
                unlocked,
                mint,
                seasonal,
              },
        ),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The raffle prize could not be updated.");
      }
      setMessage(body.message ?? "Raffle prize updated.");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The raffle prize could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="admin-raffle-editor">
      <div className="admin-raffle-preview">
        <ItemCard
          interactive={false}
          item={prize.item}
          legendaryAttributes={[]}
          permissions={{
            canManageItem: false,
            canCustomizeCosmetic: false,
          }}
        />
      </div>
      <div className="admin-raffle-fields">
        <label>
          Artwork
          <select
            disabled={pending}
            onChange={(event) => setArtworkId(event.target.value)}
            value={artworkId}
          >
            {artworks.map((artwork) => (
              <option key={artwork.id} value={artwork.id}>
                {artwork.rarity} · {artwork.title} — {artwork.artist}
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
            Item level
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
            Potency tier
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
        <div className="admin-raffle-actions">
          <button disabled={pending} onClick={() => submit("PATCH")} type="button">
            Save prize
          </button>
          <button disabled={pending} onClick={() => submit("POST")} type="button">
            Generate replacement
          </button>
        </div>
        {message ? <p className="admin-success">{message}</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}
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

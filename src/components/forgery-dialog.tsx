"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import {
  BASE_FORGERY_QUALITY,
  calculateForgeCostForSelection,
  calculateForgeryHeat,
  type ForgeryHeatContext,
} from "@/server/forgery-gameplay";
import type {
  HydratedGameItem,
  HydratedPlayerArtworkArchive,
} from "@/server/item-artwork";
import type { LootData } from "@/server/gameplay";

import { getCardCosmetic } from "./item-cards/catalog";
import { useCardCosmetics } from "./item-cards/card-cosmetics-provider";
import KnownForgeryWatermark from "./item-cards/known-forgery-watermark";
import RenderCardPreview from "./item-cards/render-card-preview";
import { CARD_RENDERERS } from "./item-cards/registry";
import type { CardLegendaryAttribute } from "./item-cards/types";

const MODIFIERS = [
  "mint",
  "foil",
  "unlocked",
  "seasonal",
  "vintage",
  "lottery",
] as const;

const HEAT_CONTEXTS: Array<{
  context: ForgeryHeatContext;
  label: string;
}> = [
  { context: "sell", label: "Quick sale" },
  { context: "collector", label: "Collector" },
  { context: "donate", label: "Donation" },
  { context: "quest", label: "Quest" },
  { context: "display", label: "Display tick" },
];

type ForgeryPricing = {
  lootData: LootData;
  mintValueMultiplier: number;
  seasonalArtworkIds: string[];
};

export default function ForgeryDialog({
  archives,
  initialArchiveId = null,
  inventoryFull,
  legendaryAttributes,
  onClose,
  onForged,
  pricing,
}: {
  archives: HydratedPlayerArtworkArchive[];
  initialArchiveId?: string | null;
  inventoryFull: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  onClose: () => void;
  onForged: (message: string) => void;
  pricing: ForgeryPricing;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(
    initialArchiveId,
  );
  const selectedArchive =
    archives.find((archive) => archive._id === selectedArchiveId) ?? null;
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return [];
    return archives
      .filter(
        (archive) =>
          archive.artwork.title.toLocaleLowerCase().includes(query) ||
          archive.artwork.artist.toLocaleLowerCase().includes(query),
      )
      .sort(
        (left, right) =>
          left.artwork.title.localeCompare(right.artwork.title) ||
          left.artwork.artist.localeCompare(right.artwork.artist),
      )
      .slice(0, 24);
  }, [archives, search]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby={
        selectedArchive ? "forgery-dialog-description" : undefined
      }
      aria-labelledby="forgery-dialog-title"
      className="reroll-dialog art-style-dialog forgery-dialog"
      data-rarity={selectedArchive?.artwork.rarity}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="reroll-dialog-content">
        <header className="reroll-dialog-header">
          {selectedArchive ? (
            <div className="reroll-artwork-summary">
              <ArtworkThumbnail
                alt={`${selectedArchive.artwork.title} by ${selectedArchive.artwork.artist}`}
                artworkId={selectedArchive.artwork_id}
                className="reroll-artwork-thumbnail"
              />
              <div>
                <p className="reroll-dialog-kicker">forge archived artwork</p>
                <h2 id="forgery-dialog-title">
                  {selectedArchive.artwork.title}
                </h2>
                <p className="reroll-artwork-artist">
                  {selectedArchive.artwork.artist}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="reroll-dialog-kicker">forge archived artwork</p>
              <h2 id="forgery-dialog-title">Create a forgery</h2>
              <p className="reroll-artwork-artist">
                Search your archive to choose an artwork.
              </p>
            </div>
          )}
          <button
            aria-label="Close forge dialog"
            className="reroll-dialog-close"
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>

        <label className="forgery-archive-search">
          <span>Search archived artworks</span>
          <input
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Artwork title or artist"
            type="search"
            value={search}
          />
        </label>

        {search.trim() ? (
          <div className="forgery-search-results">
            {matches.length > 0 ? (
              matches.map((archive) => (
                <button
                  aria-pressed={archive._id === selectedArchiveId}
                  className={
                    archive._id === selectedArchiveId ? "selected" : undefined
                  }
                  key={archive._id}
                  onClick={() => {
                    setSelectedArchiveId(archive._id);
                    setSearch("");
                  }}
                  type="button"
                >
                  <ArtworkThumbnail
                    alt=""
                    artworkId={archive.artwork_id}
                    size={54}
                  />
                  <span>
                    <strong>{archive.artwork.title}</strong>
                    <small>{archive.artwork.artist}</small>
                  </span>
                </button>
              ))
            ) : (
              <p>No archived artworks match this search.</p>
            )}
          </div>
        ) : null}

        {selectedArchive ? (
          <ForgeryEditor
            archive={selectedArchive}
            inventoryFull={inventoryFull}
            key={selectedArchive._id}
            legendaryAttributes={legendaryAttributes}
            onForged={onForged}
            pricing={pricing}
          />
        ) : (
          <div className="forgery-dialog-null-state">
            <i aria-hidden="true" className="fa fa-search" />
            <strong>
              {archives.length > 0
                ? "Choose an archived artwork"
                : "Your archive is empty"}
            </strong>
            <p>
              {archives.length > 0
                ? "Search by artwork title or artist to configure a forgery."
                : "Archive an artwork before creating a forgery."}
            </p>
          </div>
        )}
      </div>
    </dialog>
  );
}

function ForgeryEditor({
  archive,
  inventoryFull,
  legendaryAttributes,
  onForged,
  pricing,
}: {
  archive: HydratedPlayerArtworkArchive;
  inventoryFull: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  onForged: (message: string) => void;
  pricing: ForgeryPricing;
}) {
  const cardCosmetics = useCardCosmetics();
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [artStyle, setArtStyle] = useState("museum");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const available = useMemo(
    () => MODIFIERS.filter((modifier) => archive.modifiers.includes(modifier)),
    [archive.modifiers],
  );
  const findCosmetic = (id: string) =>
    cardCosmetics.find((cosmetic) => cosmetic.id === id) ??
    getCardCosmetic(id);
  const previewCosmetic = findCosmetic(artStyle) ?? findCosmetic("museum")!;
  const PreviewRenderer = CARD_RENDERERS[previewCosmetic.id];
  const previewItem = useMemo(
    () => createPreviewItem(archive, modifiers, previewCosmetic.id),
    [archive, modifiers, previewCosmetic.id],
  );
  const heat = HEAT_CONTEXTS.map(({ context, label }) => ({
    context,
    label,
    value: calculateForgeryHeat(previewItem, context),
  }));
  const cost = calculateForgeCostForSelection({
    artwork: archive.artwork,
    lootData: pricing.lootData,
    mintValueMultiplier: pricing.mintValueMultiplier,
    modifiers,
    seasonal: pricing.seasonalArtworkIds.includes(archive.artwork_id),
  });
  const inventoryError =
    inventoryFull && !modifiers.includes("vintage")
      ? archive.modifiers.includes("vintage")
        ? "Select Vintage to forge while your inventory is full."
        : "Your inventory is currently full."
      : "";

  async function forge() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/play/archives/${archive._id}/forge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modifiers, artStyle }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "The forgery failed.");
      onForged(body.message ?? "Artwork forged.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The forgery failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p
        className="reroll-dialog-description"
        id="forgery-dialog-description"
      >
        Choose only modifiers and styles represented in this archive.
        Additional modifiers increase the chance that the forgery will be
        identified during risky actions.
      </p>

      <div className="forgery-dialog-picker">
        <div className="forgery-dialog-controls">
          <fieldset className="art-style-dialog-options forgery-modifier-options">
            <legend>Archived modifiers</legend>
            {available.length === 0 ? (
              <p className="art-style-dialog-empty">
                Standard artwork with no archived modifiers.
              </p>
            ) : (
              available.map((modifier) => (
                <label key={modifier}>
                  <input
                    checked={modifiers.includes(modifier)}
                    disabled={pending}
                    onChange={() =>
                      setModifiers((current) =>
                        current.includes(modifier)
                          ? current.filter((value) => value !== modifier)
                          : [...current, modifier],
                      )
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{modifier}</strong>
                    <small>Raises heat</small>
                  </span>
                </label>
              ))
            )}
          </fieldset>

          <label className="forgery-style-select">
            <span>Archived art style</span>
            <select
              disabled={pending}
              onChange={(event) => setArtStyle(event.target.value)}
              value={artStyle}
            >
              <option value="museum">
                {findCosmetic("museum")?.name ?? "Default"} (default)
              </option>
              {archive.artStyles.map((style) => (
                <option key={style} value={style}>
                  {findCosmetic(style)?.name ?? style}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="art-style-dialog-preview forgery-dialog-preview">
          <header>
            <span>Forgery preview</span>
            <strong>{previewCosmetic.name}</strong>
          </header>
          <div className="art-style-consumable-preview">
            <span
              className={`rendered-item-card rendered-item-card-${previewCosmetic.id}`}
              data-card-renderer={previewCosmetic.id}
              data-foil={previewItem.foil ? "true" : undefined}
              data-known-forgery="true"
              data-lottery={previewItem.lottery || undefined}
              data-rarity={previewItem.artwork.rarity}
              data-seasonal={previewItem.seasonal ? "true" : undefined}
              data-vintage={previewItem.vintage ? "true" : undefined}
            >
              <span className="rendered-item-card-trigger">
                <KnownForgeryWatermark
                  authenticity={previewItem.authenticity}
                  rendererId={previewCosmetic.id}
                />
                <RenderCardPreview foil={previewItem.foil}>
                  <PreviewRenderer
                    alreadyOwned={false}
                    item={previewItem}
                    legendaryAttributes={legendaryAttributes}
                    researchTarget={false}
                  />
                </RenderCardPreview>
              </span>
            </span>
          </div>
          <p className="forgery-watermark-note">
            The forgery&apos;s attributes and non-Mint condition are generated
            at random and may differ from this preview. Its price is estimated
            using 0.5 for every attribute and 50% condition. The known-forgery
            watermark is private and will only be visible to you. Other players
            will not see it unless they authenticate the artwork or detect the
            forgery.
          </p>
          <div className="forgery-heat-panel">
            <header>
              <span>Identification heat</span>
              <small>Chance per action</small>
            </header>
            <dl>
              {heat.map(({ context, label, value }) => (
                <div data-heat={getHeatLevel(value)} key={context}>
                  <dt>{label}</dt>
                  <dd>{Math.round(value * 100)}%</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      {error || inventoryError ? (
        <p className="reroll-dialog-error" role="alert">
          {error || inventoryError}
        </p>
      ) : null}
      <footer className="art-style-dialog-actions">
        <div className="forgery-cost">
          <span>Forge cost</span>
          <strong>${cost.toLocaleString()}</strong>
        </div>
        <button
          className="art-style-dialog-apply red"
          disabled={pending || Boolean(inventoryError)}
          onClick={forge}
          type="button"
        >
          {pending
            ? "Forging..."
            : `Forge artwork · $${cost.toLocaleString()}`}
        </button>
      </footer>
    </>
  );
}

function createPreviewItem(
  archive: HydratedPlayerArtworkArchive,
  modifiers: readonly string[],
  artStyle: string,
): HydratedGameItem {
  const selected = new Set(modifiers);
  const averageValue = Math.floor(
    archive.combined_value / Math.max(archive.archived_count, 1),
  );
  return {
    _id: `forgery-preview-${archive._id}`,
    artwork_id: archive.artwork_id,
    artwork: archive.artwork,
    condition: 1,
    mint: selected.has("mint"),
    mint_value_multiplier: selected.has("mint") ? 1.5 : 1,
    attributes: { locked: [], unlocked: [], special: [] },
    card_renderer: artStyle,
    owner: "forgery-preview",
    transaction_history: [],
    status: "claimed",
    source: "forgery",
    date_created: "",
    date_received: "",
    level: 1,
    roll_count: 0,
    reroll_spent: 0,
    foil: selected.has("foil"),
    unlocked: selected.has("unlocked"),
    seasonal: selected.has("seasonal"),
    lottery: selected.has("lottery") ? 1 : 0,
    original: false,
    patreon: false,
    vintage: selected.has("vintage"),
    authenticity: {
      forgery: true,
      forgery_quality: BASE_FORGERY_QUALITY,
      liable: "forgery-preview",
      liability_pending: false,
      identified: true,
      fee: 0,
      original_owner: "forgery-preview",
    },
    tags: [],
    misprint: false,
    permanent: false,
    repairing: false,
    debug: false,
    odds: "forged",
    values: {
      sell: averageValue,
      purchase: averageValue,
      actual: averageValue,
      auction_min: averageValue,
      collector: averageValue,
      dealer: averageValue,
    },
    reroll_cost: 0,
  };
}

function getHeatLevel(heat: number): "low" | "medium" | "high" {
  if (heat >= 0.6) return "high";
  if (heat >= 0.25) return "medium";
  return "low";
}

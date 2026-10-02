"use client";

import { useEffect, useMemo, useState } from "react";

import { CARD_COSMETICS } from "@/components/item-cards/catalog";
import ItemCard from "@/components/item-cards/item-card";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { Artwork } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

export type AdminArtworkOption = Artwork & {
  effectAttributeIds: string[];
};

export type AdminAttributeOption = {
  _id: string;
  title: string;
  type: string;
  active: boolean;
};

type AttributeValue = {
  attributeId: string;
  value: number;
};

type AttributeGroups = {
  locked: AttributeValue[];
  unlocked: AttributeValue[];
  special: AttributeValue[];
};

type PlayerResult = {
  id: string;
  screenName: string;
  email: string;
  testAccount: boolean;
};

type DestinationType =
  | "player"
  | "lottery_buffer"
  | "live_auction_buffer";
type AttributeGroup = keyof AttributeGroups;

export default function ItemCreator({
  artworks,
  attributes,
  legendaryAttributes,
}: {
  artworks: AdminArtworkOption[];
  attributes: AdminAttributeOption[];
  legendaryAttributes: CardLegendaryAttribute[];
}) {
  const firstArtwork = artworks[0];
  const [artworkQuery, setArtworkQuery] = useState("");
  const [artworkId, setArtworkId] = useState(firstArtwork?._id ?? "");
  const [destinationType, setDestinationType] =
    useState<DestinationType>("player");
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(
    null,
  );
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [condition, setCondition] = useState(75);
  const [mint, setMint] = useState(false);
  const [level, setLevel] = useState(1);
  const [rollCount, setRollCount] = useState(0);
  const [rerollSpent, setRerollSpent] = useState(0);
  const [foil, setFoil] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [seasonal, setSeasonal] = useState(false);
  const [lottery, setLottery] = useState(0);
  const [original, setOriginal] = useState(false);
  const [patreon, setPatreon] = useState(false);
  const [vintage, setVintage] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [debug, setDebug] = useState(false);
  const [misprint, setMisprint] = useState(false);
  const [forgery, setForgery] = useState(false);
  const [forgeryQuality, setForgeryQuality] = useState(50);
  const [forgeryIdentified, setForgeryIdentified] = useState(true);
  const [cardRenderer, setCardRenderer] = useState("museum");
  const [source, setSource] = useState("admin grant");
  const [tags, setTags] = useState("");
  const [attributeGroups, setAttributeGroups] = useState<AttributeGroups>(() =>
    firstArtwork
      ? getRandomAttributeGroups(
          firstArtwork,
          false,
          attributes,
          createSeededRandom(firstArtwork._id),
        )
      : { locked: [], unlocked: [], special: [] },
  );
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [completedStatus, setCompletedStatus] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<HydratedGameItem | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const selectedArtwork =
    artworks.find((artwork) => artwork._id === artworkId) ?? firstArtwork;

  const filteredArtworks = useMemo(() => {
    const query = artworkQuery.trim().toLocaleLowerCase();
    if (!query) return artworks;
    return artworks.filter((artwork) =>
      [
        artwork.title,
        artwork.artist,
        artwork.rarity,
        artwork._id,
        artwork.active ? "active" : "inactive",
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [artworkQuery, artworks]);
  const filteredArtworkId = filteredArtworks.some(
    (artwork) => artwork._id === artworkId,
  )
    ? artworkId
    : "";

  const itemPayload = useMemo(
    () => ({
      artworkId: selectedArtwork?._id ?? "",
      condition: mint ? 1 : condition / 100,
      mint,
      level,
      rollCount,
      rerollSpent,
      foil,
      unlocked,
      seasonal,
      lottery,
      original,
      patreon,
      vintage,
      permanent,
      debug,
      cardRenderer,
      source,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      misprint,
      forgery,
      forgeryQuality: forgeryQuality / 100,
      forgeryIdentified,
      attributes: attributeGroups,
    }),
    [
      attributeGroups,
      cardRenderer,
      condition,
      debug,
      foil,
      forgery,
      forgeryIdentified,
      forgeryQuality,
      level,
      lottery,
      mint,
      misprint,
      original,
      patreon,
      permanent,
      rerollSpent,
      rollCount,
      seasonal,
      selectedArtwork?._id,
      source,
      tags,
      unlocked,
      vintage,
    ],
  );

  useEffect(() => {
    const query = playerQuery.trim();
    if (destinationType !== "player" || query.length === 0) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchingPlayers(true);
      try {
        const response = await fetch(
          `/api/admin/items?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as {
          players?: PlayerResult[];
        };
        if (response.ok) setPlayerResults(body.players ?? []);
      } catch {
        if (!controller.signal.aborted) setPlayerResults([]);
      } finally {
        if (!controller.signal.aborted) setSearchingPlayers(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [destinationType, playerQuery]);

  useEffect(() => {
    if (!selectedArtwork || completedStatus) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const response = await fetch("/api/admin/items", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ item: itemPayload }),
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          error?: string;
          item?: HydratedGameItem;
        };
        if (!response.ok || !body.item) {
          throw new Error(body.error ?? "The item preview is unavailable.");
        }
        setPreviewItem(body.item);
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreviewError(
            error instanceof Error
              ? error.message
              : "The item preview is unavailable.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 150);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [completedStatus, itemPayload, selectedArtwork]);

  function randomizeAttributes() {
    if (!selectedArtwork) return;
    setAttributeGroups(
      getRandomAttributeGroups(selectedArtwork, unlocked, attributes),
    );
  }

  function selectArtwork(nextArtworkId: string) {
    const artwork = artworks.find((candidate) => candidate._id === nextArtworkId);
    setArtworkId(nextArtworkId);
    if (artwork) {
      setAttributeGroups(getRandomAttributeGroups(artwork, unlocked, attributes));
    }
  }

  function setUnlockedItem(nextUnlocked: boolean) {
    setUnlocked(nextUnlocked);
    if (selectedArtwork) {
      setAttributeGroups(
        getRandomAttributeGroups(selectedArtwork, nextUnlocked, attributes),
      );
    }
  }

  function selectDestination(nextDestination: DestinationType) {
    setDestinationType(nextDestination);
    setPlayerResults([]);
    setSearchingPlayers(false);
    if (nextDestination === "lottery_buffer" && lottery < 1) {
      setLottery(1);
    }
  }

  function updateAttribute(
    group: AttributeGroup,
    index: number,
    update: Partial<AttributeValue>,
  ) {
    setAttributeGroups((current) => ({
      ...current,
      [group]: current[group].map((attribute, attributeIndex) =>
        attributeIndex === index ? { ...attribute, ...update } : attribute,
      ),
    }));
  }

  async function sendItem() {
    if (!selectedArtwork) return;
    if (destinationType === "player" && !selectedPlayer) {
      setStatus("Choose a player before sending the item.");
      return;
    }
    setPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destination:
            destinationType === "player"
              ? { type: "player", playerId: selectedPlayer?.id }
              : { type: destinationType },
          item: itemPayload,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        itemId?: string;
        message?: string;
      };
      if (!response.ok || !body.itemId) {
        throw new Error(body.error ?? "The item could not be created.");
      }
      setCompletedStatus(
        `${body.message ?? "Item created."} Item ID: ${body.itemId}`,
      );
      setSelectedPlayer(null);
      setPlayerQuery("");
      setPlayerResults([]);
      setPreviewItem(null);
      setPreviewError("");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The item could not be created.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!selectedArtwork) {
    return <p className="admin-error">No catalog artwork is available.</p>;
  }
  if (completedStatus) {
    return (
      <section className="admin-item-section">
        <h2>Item sent</h2>
        <p className="admin-item-status">{completedStatus}</p>
        <button
          onClick={() => {
            setCompletedStatus(null);
            setStatus("");
          }}
          type="button"
        >
          Create another item
        </button>
      </section>
    );
  }
  const sendUnavailable =
    pending || (destinationType === "player" && selectedPlayer === null);

  return (
    <div className="admin-item-creator-layout">
      <div className="admin-item-creator">
      <section className="admin-item-section">
        <h2>Artwork</h2>
        <label>
          Search catalog
          <input
            onChange={(event) => setArtworkQuery(event.target.value)}
            placeholder="title, artist, rarity, ID, or inactive"
            type="search"
            value={artworkQuery}
          />
        </label>
        <label>
          Selected artwork
          <select
            onChange={(event) => selectArtwork(event.target.value)}
            size={Math.min(10, Math.max(3, filteredArtworks.length))}
            value={filteredArtworkId}
          >
            {filteredArtworkId === "" ? (
              <option disabled value="">
                Select an artwork from the filtered results
              </option>
            ) : null}
            {filteredArtworks.map((artwork) => (
              <option key={artwork._id} value={artwork._id}>
                {artwork.active ? "" : "[inactive] "}
                {artwork.rarity} · {artwork.title} — {artwork.artist}
              </option>
            ))}
          </select>
        </label>
        <p>
          <strong>{selectedArtwork.title}</strong> by {selectedArtwork.artist} ·{" "}
          <span className={`rarity-text ${selectedArtwork.rarity}`}>
            {selectedArtwork.rarity}
          </span>{" "}
          · {selectedArtwork.active ? "active" : "inactive"}
        </p>
      </section>

      <section className="admin-item-section">
        <div className="admin-item-section-heading">
          <div>
            <h2>Attributes</h2>
            <p>Values are randomized initially and remain fully editable.</p>
          </div>
          <button onClick={randomizeAttributes} type="button">
            Randomize attributes
          </button>
        </div>
        {(["special", "unlocked", "locked"] as const).map((group) => (
          <AttributeEditor
            attributes={attributes}
            group={group}
            key={group}
            onUpdate={(index, update) =>
              updateAttribute(group, index, update)
            }
            usedAttributeIds={
              new Set(
                Object.values(attributeGroups)
                  .flat()
                  .map((attribute) => attribute.attributeId),
              )
            }
            values={attributeGroups[group]}
          />
        ))}
      </section>

      <section className="admin-item-section">
        <h2>Item properties</h2>
        <div className="admin-item-grid admin-item-number-grid">
          <NumberField
            disabled={mint}
            label="Condition %"
            max={100}
            min={0}
            set={setCondition}
            value={mint ? 100 : condition}
          />
          <NumberField label="Level" max={100} min={1} set={setLevel} value={level} />
          <NumberField
            label="Lottery potency"
            max={10}
            min={destinationType === "lottery_buffer" ? 1 : 0}
            set={setLottery}
            value={lottery}
          />
          <NumberField
            label="Roll count"
            min={0}
            set={setRollCount}
            value={rollCount}
          />
          <NumberField
            label="Reroll spent"
            min={0}
            set={setRerollSpent}
            value={rerollSpent}
          />
          <NumberField
            label="Forgery quality %"
            max={100}
            min={0}
            set={setForgeryQuality}
            value={forgeryQuality}
          />
        </div>
        <div className="admin-item-grid">
          <label>
            Card style
            <select
              onChange={(event) => setCardRenderer(event.target.value)}
              value={cardRenderer}
            >
              {CARD_COSMETICS.map((cosmetic) => (
                <option key={cosmetic.id} value={cosmetic.id}>
                  {cosmetic.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <input
              maxLength={100}
              onChange={(event) => setSource(event.target.value)}
              value={source}
            />
          </label>
          <label className="admin-item-wide">
            Tags
            <input
              onChange={(event) => setTags(event.target.value)}
              placeholder="comma-separated"
              value={tags}
            />
          </label>
        </div>
        <div className="admin-item-flags">
          <Flag checked={mint} label="Mint" set={setMint} />
          <Flag checked={foil} label="Foil" set={setFoil} />
          <Flag
            checked={unlocked}
            label="Unlocked"
            set={setUnlockedItem}
          />
          <Flag checked={seasonal} label="Seasonal" set={setSeasonal} />
          <Flag checked={original} label="Original" set={setOriginal} />
          <Flag checked={patreon} label="Patreon" set={setPatreon} />
          <Flag checked={vintage} label="Vintage" set={setVintage} />
          <Flag checked={permanent} label="Permanent" set={setPermanent} />
          <Flag checked={misprint} label="Misprint" set={setMisprint} />
          <Flag checked={forgery} label="Forgery" set={setForgery} />
          <Flag
            checked={forgeryIdentified}
            label="Forgery identified"
            set={setForgeryIdentified}
          />
          <Flag checked={debug} label="Debug" set={setDebug} />
        </div>
      </section>

      <section className="admin-item-section">
        <h2>Destination</h2>
        <div className="admin-item-destinations">
          <Flag
            checked={destinationType === "player"}
            label="Player"
            set={() => selectDestination("player")}
            type="radio"
          />
          <Flag
            checked={destinationType === "lottery_buffer"}
            label="Lottery buffer"
            set={() => selectDestination("lottery_buffer")}
            type="radio"
          />
          <Flag
            checked={destinationType === "live_auction_buffer"}
            label="Live auction buffer"
            set={() => selectDestination("live_auction_buffer")}
            type="radio"
          />
        </div>
        {destinationType === "player" ? (
          <div className="admin-player-search">
            <label>
              Find player
              <input
                onChange={(event) => {
                  setPlayerQuery(event.target.value);
                  setSelectedPlayer(null);
                }}
                placeholder="screen name or email"
                type="search"
                value={playerQuery}
              />
            </label>
            {searchingPlayers ? <p>Searching...</p> : null}
            <div className="admin-player-results">
              {playerResults.map((player) => (
                <button
                  className={
                    selectedPlayer?.id === player.id ? "selected" : ""
                  }
                  key={player.id}
                  onClick={() => {
                    setSelectedPlayer(player);
                    setPlayerQuery(player.screenName);
                  }}
                  type="button"
                >
                  <strong>{player.screenName}</strong>
                  <span>{player.email}</span>
                  {player.testAccount ? <small>test account</small> : null}
                </button>
              ))}
            </div>
          </div>
        ) : destinationType === "lottery_buffer" ? (
          <p>
            The item will be appended to the expandable lottery replacement
            buffer without replacing an existing prize.
          </p>
        ) : (
          <p>
            The item will be appended to the live auction queue for an admin
            to present during a stream.
          </p>
        )}
        <button
          aria-disabled={sendUnavailable}
          className="admin-item-send"
          onClick={() => {
            if (!sendUnavailable) void sendItem();
          }}
          type="button"
        >
          {pending
            ? "Sending..."
            : destinationType === "player"
              ? "Send item"
              : destinationType === "lottery_buffer"
                ? "Send to lottery buffer"
                : "Send to live auction buffer"}
        </button>
        {status ? <p className="admin-item-status">{status}</p> : null}
      </section>
      </div>
      <aside className="admin-item-preview">
        <h2>Item preview</h2>
        {previewLoading ? <p>Refreshing preview...</p> : null}
        {previewError ? <p className="admin-error">{previewError}</p> : null}
        {previewItem ? (
          <ItemCard
            interactive={false}
            item={previewItem}
            key={JSON.stringify(previewItem)}
            legendaryAttributes={legendaryAttributes}
            permissions={{
              canManageItem: false,
              canCustomizeCosmetic: false,
            }}
          />
        ) : null}
      </aside>
    </div>
  );
}

function AttributeEditor({
  attributes,
  group,
  onUpdate,
  usedAttributeIds,
  values,
}: {
  attributes: AdminAttributeOption[];
  group: AttributeGroup;
  onUpdate: (index: number, update: Partial<AttributeValue>) => void;
  usedAttributeIds: Set<string>;
  values: AttributeValue[];
}) {
  return (
    <div className="admin-attribute-group">
      <div>
        <h3>{group}</h3>
      </div>
      {values.length === 0 ? <p>No {group} attributes.</p> : null}
      {values.map((attribute, index) => (
        <div className="admin-attribute-row" key={`${group}:${index}`}>
          {group === "special" ? (
            <span className="admin-attribute-fixed">
              {attributes.find(
                (option) => option._id === attribute.attributeId,
              )?.title ?? attribute.attributeId}
            </span>
          ) : (
            <select
              onChange={(event) =>
                onUpdate(index, { attributeId: event.target.value })
              }
              value={attribute.attributeId}
            >
              {attributes
                .filter(
                  (option) =>
                    option._id === attribute.attributeId ||
                    !usedAttributeIds.has(option._id),
                )
                .map((option) => (
                  <option key={option._id} value={option._id}>
                    {option.title} · {option.type}
                  </option>
                ))}
            </select>
          )}
          <label>
            <span>Value %</span>
            <input
              max={100}
              min={0}
              onChange={(event) =>
                onUpdate(index, { value: Number(event.target.value) / 100 })
              }
              step="1"
              type="number"
              value={Math.round(attribute.value * 100)}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function NumberField({
  disabled = false,
  label,
  max,
  min,
  set,
  step = 1,
  value,
}: {
  disabled?: boolean;
  label: string;
  max?: number;
  min: number;
  set: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label>
      {label}
      <input
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => set(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function Flag({
  checked,
  label,
  set,
  type = "checkbox",
}: {
  checked: boolean;
  label: string;
  set: (checked: boolean) => void;
  type?: "checkbox" | "radio";
}) {
  return (
    <label>
      <input
        checked={checked}
        onChange={(event) => set(event.target.checked)}
        type={type}
      />
      {label}
    </label>
  );
}

function getRandomAttributeGroups(
  artwork: AdminArtworkOption,
  unlocked: boolean,
  attributes: AdminAttributeOption[],
  random: () => number = Math.random,
): AttributeGroups {
  const result: AttributeGroups = {
    locked: [],
    unlocked: [],
    special: [],
  };
  const attributeById = new Map(
    attributes.map((attribute) => [attribute._id, attribute]),
  );
  const remaining = attributes.filter((attribute) => attribute.active);
  for (const attributeId of artwork.effectAttributeIds) {
    const attribute = attributeById.get(attributeId);
    if (!attribute) continue;
    result.special.push({
      attributeId,
      value: randomAttributeValue(0.8, random),
    });
    const index = remaining.findIndex((candidate) => candidate._id === attributeId);
    if (index >= 0) remaining.splice(index, 1);
  }
  const masterpiece = artwork.rarity === "masterpiece";
  const lockedCount =
    masterpiece ? 1 : artwork.rarity === "common" || unlocked ? 0 : 1;
  const unlockedCount = masterpiece
    ? unlocked
      ? 4
      : 3
    : artwork.rarity === "common" || !unlocked
      ? 1
      : 2;
  takeRandomAttributes(result.locked, remaining, lockedCount, 0.5, random);
  takeRandomAttributes(result.unlocked, remaining, unlockedCount, 0, random);
  return result;
}

function takeRandomAttributes(
  target: AttributeValue[],
  remaining: AdminAttributeOption[],
  count: number,
  minimum: number,
  random: () => number,
) {
  for (let index = 0; index < count && remaining.length > 0; index += 1) {
    const selectedIndex = Math.floor(random() * remaining.length);
    const [attribute] = remaining.splice(selectedIndex, 1);
    target.push({
      attributeId: attribute._id,
      value: randomAttributeValue(minimum, random),
    });
  }
}

function randomAttributeValue(minimum: number, random: () => number) {
  return Number((minimum + random() * (1 - minimum)).toFixed(2));
}

function createSeededRandom(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

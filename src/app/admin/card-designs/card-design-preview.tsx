"use client";

import { useMemo, useState } from "react";

import ItemCard from "@/components/item-cards/item-card";
import type {
  CardLegendaryAttribute,
  CardRendererId,
} from "@/components/item-cards/types";
import {
  ARTWORK_RARITIES,
  calculateItemValues,
  LOTTERY_LEVEL_MAX,
  type ArtworkRarity,
  type LootData,
} from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

import CardRendererActivation from "./card-renderer-activation";

const PREVIEW_STATES = [
  ["mint", "Mint"],
  ["foil", "Foil"],
  ["unlocked", "Unlocked"],
  ["seasonal", "Seasonal"],
  ["original", "Original"],
  ["vintage", "Vintage"],
] as const;

type PreviewState = (typeof PREVIEW_STATES)[number][0];

export default function CardDesignPreview({
  description,
  initialActive,
  initialPrice,
  item,
  items,
  legendaryAttributes,
  lootData,
  name,
  number,
  rendererId,
}: {
  description?: string;
  initialActive: boolean;
  initialPrice: number;
  item: HydratedGameItem;
  items: HydratedGameItem[];
  legendaryAttributes: CardLegendaryAttribute[];
  lootData: LootData;
  name: string;
  number?: number;
  rendererId: CardRendererId;
}) {
  const [states, setStates] = useState<Record<PreviewState, boolean>>({
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    original: false,
    vintage: false,
  });
  const [rarity, setRarity] = useState<ArtworkRarity>(item.artwork.rarity);
  const [lotteryLevel, setLotteryLevel] = useState(0);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const rarityItems = items.filter(
    (candidate) => candidate.artwork.rarity === rarity,
  );
  const selectedItem =
    rarityItems[selectionIndex % Math.max(rarityItems.length, 1)] ?? item;
  const previewItem = useMemo(() => {
    const nextItem = {
      ...selectedItem,
      ...states,
      lottery: lotteryLevel,
      attributes:
        states.unlocked && selectedItem.artwork.rarity !== "common"
          ? {
              locked: [],
              unlocked: [
                ...selectedItem.attributes.unlocked,
                ...selectedItem.attributes.locked,
              ],
              special: selectedItem.attributes.special,
            }
          : selectedItem.attributes,
      condition: states.mint ? 1 : selectedItem.condition,
      mint_value_multiplier: states.mint ? 2 : 1,
    };

    return {
      ...nextItem,
      values: calculateItemValues(nextItem, nextItem.artwork, lootData),
    };
  }, [lootData, lotteryLevel, selectedItem, states]);

  function toggle(state: PreviewState) {
    setStates((current) => ({ ...current, [state]: !current[state] }));
  }

  function randomizeArtwork(nextRarity = rarity) {
    const candidates = items.filter(
      (candidate) => candidate.artwork.rarity === nextRarity,
    );
    setSelectionIndex(
      candidates.length > 1
        ? Math.floor(Math.random() * candidates.length)
        : 0,
    );
  }

  return (
    <article className="card-design-preview">
      <header>
        <span>
          Style #{(number ?? 0).toString().padStart(2, "0")} · {rendererId}
        </span>
        <h3>{name}</h3>
        <p>{description}</p>
        <CardRendererActivation
          initialActive={initialActive}
          initialPrice={initialPrice}
          rendererId={rendererId}
        />
        <div className="card-design-artwork-controls">
          <label>
            Rarity
            <select
              onChange={(event) => {
                const nextRarity = event.target.value as ArtworkRarity;
                setRarity(nextRarity);
                randomizeArtwork(nextRarity);
              }}
              value={rarity}
            >
              {ARTWORK_RARITIES.map((option) => (
                <option
                  disabled={
                    !items.some(
                      (candidate) => candidate.artwork.rarity === option,
                    )
                  }
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lottery level
            <select
              onChange={(event) => setLotteryLevel(Number(event.target.value))}
              value={lotteryLevel}
            >
              <option value={0}>None</option>
              {Array.from(
                { length: LOTTERY_LEVEL_MAX },
                (_, index) => index + 1,
              ).map((level) => (
                <option key={level} value={level}>
                  L{level}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="card-design-state-controls">
          <legend>Preview item states</legend>
          {PREVIEW_STATES.map(([state, label]) => (
            <label key={state}>
              <input
                checked={states[state]}
                onChange={() => toggle(state)}
                type="checkbox"
              />
              {label}
            </label>
          ))}
        </fieldset>
      </header>
      <div className="card-design-stage">
        <ItemCard
          alreadyOwned={false}
          forceRendererId={rendererId}
          item={previewItem}
          key={[
            selectedItem._id,
            `lottery-${lotteryLevel}`,
            ...PREVIEW_STATES.map(([state]) => (states[state] ? state : "")),
          ].join(":")}
          legendaryAttributes={legendaryAttributes}
        />
      </div>
    </article>
  );
}

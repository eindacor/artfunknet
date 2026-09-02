"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import { CARD_RENDERERS } from "./registry";
import { resolveCardRendererId } from "./selection";
import StandardItemDialog from "./standard-item-dialog";
import type { ItemCardProps } from "./types";

export default function ItemCard({
  item,
  actions,
  activeRendererIds,
  forceRendererId,
  legendaryAttributes,
  alreadyOwned = false,
  ownedRendererIds,
  permissions = {
    canManageItem: false,
    canCustomizeCosmetic: false,
  },
  rendererPrices,
  rendererId,
}: ItemCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(item);
  const [itemRendererId, setItemRendererId] = useState(
    currentItem.card_renderer,
  );

  const resolvedRendererId = resolveCardRendererId({
    forcedRendererId: forceRendererId,
    itemRendererId,
    preferredRendererId: rendererId,
  });
  const Renderer = CARD_RENDERERS[resolvedRendererId];
  const animationOffset = getItemAnimationOffset(currentItem._id);

  return (
    <article
      className={`item-info rendered-item-card rendered-item-card-${resolvedRendererId}`}
      data-card-renderer={resolvedRendererId}
      data-foil={currentItem.foil ? "true" : undefined}
      data-mint={currentItem.mint ? "true" : undefined}
      data-lottery={currentItem.lottery || undefined}
      data-original={currentItem.original ? "true" : undefined}
      data-rarity={currentItem.artwork.rarity}
      data-seasonal={currentItem.seasonal ? "true" : undefined}
      data-vintage={currentItem.vintage ? "true" : undefined}
      style={
        {
          "--item-animation-offset": `${animationOffset}s`,
        } as CSSProperties
      }
    >
      <div
        aria-label={`Open details for ${item.artwork.title} by ${item.artwork.artist}`}
        className="rendered-item-card-trigger"
        onClick={() => setDialogOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setDialogOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Renderer
          alreadyOwned={alreadyOwned}
          item={{ ...currentItem, card_renderer: itemRendererId }}
          legendaryAttributes={legendaryAttributes}
        />
      </div>
      {permissions.canManageItem && actions ? (
        <div className="card-actions">{actions}</div>
      ) : null}
      {dialogOpen ? (
        <StandardItemDialog
          actions={actions}
          activeRendererIds={activeRendererIds}
          currentRendererId={resolvedRendererId}
          item={{ ...currentItem, card_renderer: itemRendererId }}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setDialogOpen(false)}
          onRendererSelected={(nextRendererId, nextItem) => {
            setItemRendererId(nextRendererId);
            setCurrentItem((current) => ({
              ...current,
              ...nextItem,
              artwork: current.artwork,
            }));
          }}
          ownedRendererIds={ownedRendererIds}
          permissions={{
            canManageItem: permissions.canManageItem,
            canCustomizeCosmetic:
              permissions.canCustomizeCosmetic &&
              (currentItem.status === "claimed" ||
                currentItem.status === "displayed"),
          }}
          rendererPrices={rendererPrices}
        />
      ) : null}
    </article>
  );
}

function getItemAnimationOffset(itemId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < itemId.length; index += 1) {
    hash ^= itemId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return -Number((((hash >>> 0) / 0xffffffff) * 8).toFixed(3));
}

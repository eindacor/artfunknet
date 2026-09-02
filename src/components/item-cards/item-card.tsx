"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

import ArtStyleDialog from "./art-style-dialog";
import ArtStyleActionButton from "./art-style-action-button";
import { CARD_RENDERERS } from "./registry";
import { resolveCardRendererId } from "./selection";
import StandardItemDialog from "./standard-item-dialog";
import type { ItemCardProps } from "./types";

export default function ItemCard({
  item,
  actions,
  forceRendererId,
  legendaryAttributes,
  alreadyOwned = false,
  consigned = false,
  interactive = true,
  permissions = {
    canManageItem: false,
    canCustomizeCosmetic: false,
  },
  rendererId,
  researchTarget = false,
  styleInventory,
}: ItemCardProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [artStyleDialogOpen, setArtStyleDialogOpen] = useState(false);
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
        aria-label={
          interactive
            ? `Open details for ${item.artwork.title} by ${item.artwork.artist}`
            : undefined
        }
        className="rendered-item-card-trigger"
        onClick={
          interactive
            ? () => {
                setDialogOpen(true);
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDialogOpen(true);
                }
              }
            : undefined
        }
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
      >
        <Renderer
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          item={{ ...currentItem, card_renderer: itemRendererId }}
          legendaryAttributes={legendaryAttributes}
          researchTarget={researchTarget}
        />
      </div>
      {permissions.canManageItem &&
      (actions || permissions.canCustomizeCosmetic) ? (
        <div className="card-actions">
          {actions}
          {permissions.canCustomizeCosmetic ? (
            <ArtStyleActionButton
              onClick={() => {
                setArtStyleDialogOpen(true);
              }}
            />
          ) : null}
        </div>
      ) : null}
      {interactive && dialogOpen ? (
        <StandardItemDialog
          actions={actions}
          currentRendererId={resolvedRendererId}
          item={{ ...currentItem, card_renderer: itemRendererId }}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setDialogOpen(false)}
          onOpenArtStyle={() => setArtStyleDialogOpen(true)}
          permissions={{
            canManageItem: permissions.canManageItem,
            canCustomizeCosmetic:
              permissions.canCustomizeCosmetic &&
              (currentItem.status === "claimed" ||
                currentItem.status === "displayed"),
          }}
        />
      ) : null}
      {interactive && artStyleDialogOpen ? (
        <ArtStyleDialog
          currentRendererId={resolvedRendererId}
          item={{ ...currentItem, card_renderer: itemRendererId }}
          legendaryAttributes={legendaryAttributes}
          onApplied={(nextRendererId, nextItem) => {
            setItemRendererId(nextRendererId);
            setCurrentItem((current) => ({
              ...current,
              ...nextItem,
              artwork: current.artwork,
            }));
            router.refresh();
          }}
          onClose={() => setArtStyleDialogOpen(false)}
          researchTarget={researchTarget}
          styleInventory={styleInventory}
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

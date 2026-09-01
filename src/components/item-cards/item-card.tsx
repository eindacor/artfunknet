"use client";

import { useState } from "react";

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
  rendererId,
}: ItemCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemRendererId, setItemRendererId] = useState(item.card_renderer);
  const resolvedRendererId = resolveCardRendererId({
    forcedRendererId: forceRendererId,
    itemRendererId,
    preferredRendererId: rendererId,
  });
  const Renderer = CARD_RENDERERS[resolvedRendererId];

  return (
    <article
      className={`item-info rendered-item-card rendered-item-card-${resolvedRendererId}`}
      data-card-renderer={resolvedRendererId}
      data-rarity={item.artwork.rarity}
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
          item={{ ...item, card_renderer: itemRendererId }}
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
          item={{ ...item, card_renderer: itemRendererId }}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setDialogOpen(false)}
          onRendererSelected={setItemRendererId}
          ownedRendererIds={ownedRendererIds}
          permissions={{
            canManageItem: permissions.canManageItem,
            canCustomizeCosmetic:
              permissions.canCustomizeCosmetic &&
              (item.status === "claimed" || item.status === "displayed"),
          }}
        />
      ) : null}
    </article>
  );
}

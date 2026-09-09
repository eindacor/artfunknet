"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import { CommunityReactionLoader } from "@/components/community-emotes";
import { ItemExpirationBadge } from "@/components/item-expiration-display";

import ArtStyleActionButton from "./art-style-action-button";
import AuctionWatermark from "./auction-watermark";
import KnownForgeryWatermark from "./known-forgery-watermark";
import { CARD_RENDERERS } from "./registry";
import {
  AttributeIcons,
  CompleteItemRecord,
  ItemVariantBadges,
} from "./shared";
import type {
  CardLegendaryAttribute,
  CardRendererId,
  ItemDisplayOwner,
  ItemDialogPermissions,
  ItemOwner,
} from "./types";
import type { GalleryChatMessageView } from "@/server/gallery-chat";
import type { HydratedGameItem } from "@/server/item-artwork";
import { RAFFLE_OWNER_ID } from "@/server/raffle-core";

export default function StandardItemDialog({
  item,
  legendaryAttributes,
  currentRendererId,
  actions,
  primaryAction,
  permissions,
  onClose,
  onOpenArtStyle,
  displayOwner,
  owner,
  headerDetails,
  viewerId,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  currentRendererId: CardRendererId;
  actions?: React.ReactNode;
  primaryAction?: React.ReactNode;
  permissions: ItemDialogPermissions;
  onClose: () => void;
  onOpenArtStyle?: () => void;
  displayOwner?: ItemDisplayOwner;
  owner?: ItemOwner;
  headerDetails?: React.ReactNode;
  viewerId?: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
      window.scrollTo(scrollPosition.x, scrollPosition.y);
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    returnFocusRef.current?.focus();
    onClose();
  }

  return (
    <dialog
      aria-labelledby={`standard-item-title-${item._id}`}
      className="standard-item-dialog"
      data-mint={item.mint ? "true" : undefined}
      data-rarity={item.artwork.rarity}
      data-seasonal={item.seasonal ? "true" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
      tabIndex={-1}
    >
      <StandardItemDetails
        actions={actions}
        primaryAction={primaryAction}
        currentRendererId={currentRendererId}
        displayOwner={displayOwner}
        owner={owner}
        headerDetails={headerDetails}
        item={item}
        legendaryAttributes={legendaryAttributes}
        onClose={closeDialog}
        onOpenArtStyle={onOpenArtStyle}
        permissions={permissions}
        viewerId={viewerId}
      />
    </dialog>
  );
}

export function StandardItemDetails({
  item,
  legendaryAttributes,
  currentRendererId,
  actions,
  primaryAction,
  permissions,
  onClose,
  onOpenArtStyle,
  displayOwner,
  owner,
  headerDetails,
  viewerId,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  currentRendererId: CardRendererId;
  actions?: React.ReactNode;
  primaryAction?: React.ReactNode;
  permissions: ItemDialogPermissions;
  onClose?: () => void;
  onOpenArtStyle?: () => void;
  displayOwner?: ItemDisplayOwner;
  owner?: ItemOwner;
  headerDetails?: React.ReactNode;
  viewerId?: string | null;
}) {
  const Renderer = CARD_RENDERERS[currentRendererId];
  const displayedStatus =
    item.status === "claimed" && item.owner === RAFFLE_OWNER_ID ? (
      <span>
        unclaimed · <Link href="/play?section=raffle">View lottery</Link>
      </span>
    ) : item.status === "displayed" && displayOwner ? (
      <span>
        On display in{" "}
        <Link href={`/gallery/${encodeURIComponent(displayOwner.playerId)}`}>
          @{displayOwner.screenName}&apos;s gallery
        </Link>
      </span>
    ) : undefined;

  return (
    <div
      className="standard-item-dialog-content"
      data-viewer={
        viewerId === null
          ? "anonymous"
          : viewerId === item.owner
            ? "owner"
            : "visitor"
      }
    >
      <header className="standard-item-dialog-header">
          <div className="standard-item-dialog-feature">
            <p className="standard-item-dialog-kicker">
              <span className="card-rarity-label">
                {item.artwork.rarity}
              </span>{" "}
              artwork · promotion level {item.level}
            </p>
            <div className="standard-item-dialog-identity">
              <div className="standard-item-dialog-heading">
                <h2 id={`standard-item-title-${item._id}`}>
                  {item.artwork.title}
                </h2>
                <p>{item.artwork.artist}</p>
                <p className="standard-item-dialog-workline">
                  {item.artwork.date} · {item.artwork.medium}
                </p>
                {headerDetails}
              </div>
            </div>
          </div>
          <div className="standard-item-dialog-header-actions">
            <ItemLinkButton itemId={item._id} />
            {viewerId ? <ItemCommunityShareButton itemId={item._id} /> : null}
            {onClose ? (
              <button
                aria-label="Close item details"
                className="reroll-dialog-close"
                onClick={onClose}
                type="button"
              >
                <i aria-hidden="true" className="fa fa-times" />
              </button>
            ) : null}
          </div>
          <div className="standard-item-dialog-visuals">
            <ArtworkThumbnail
            alt={`${item.artwork.title} by ${item.artwork.artist}`}
            artworkId={item.artwork_id}
            className="standard-item-dialog-artwork"
            size={520}
            variant="full"
            />
            <article
            className={`standard-item-dialog-card rendered-item-card rendered-item-card-${currentRendererId}`}
            data-card-renderer={currentRendererId}
            data-foil={item.foil ? "true" : undefined}
            data-known-forgery={
              item.authenticity.identified && item.authenticity.forgery
                ? "true"
                : undefined
            }
            data-mint={item.mint ? "true" : undefined}
            data-lottery={item.lottery || undefined}
            data-original={item.original ? "true" : undefined}
            data-rarity={item.artwork.rarity}
            data-auctioned={
              item.status === "auctioned" ? "true" : undefined
            }
            data-seasonal={item.seasonal ? "true" : undefined}
            data-vintage={item.vintage ? "true" : undefined}
            >
            <div className="rendered-item-card-trigger">
              <AuctionWatermark status={item.status} />
              <ItemExpirationBadge item={item} />
              <KnownForgeryWatermark
                authenticity={item.authenticity}
                rendererId={currentRendererId}
              />
              <Renderer
                alreadyOwned={false}
                consigned={item.status === "auctioned"}
                item={{ ...item, card_renderer: currentRendererId }}
                legendaryAttributes={legendaryAttributes}
                researchTarget={false}
              />
            </div>
            </article>
          </div>
        </header>
        {viewerId ? (
          <div className="standard-item-community-reactions">
            <span>
              <small>item</small>
              <CommunityReactionLoader
                targetId={item._id}
                targetType="item"
              />
            </span>
            <span>
              <small>artwork</small>
              <CommunityReactionLoader
                targetId={item.artwork_id}
                targetType="artwork"
              />
            </span>
            <span>
              <small>artist</small>
              <CommunityReactionLoader
                targetId={item.artwork.artist_id}
                targetType="artist"
              />
            </span>
          </div>
        ) : null}
        <div className="standard-item-dialog-layout">
          <div className="standard-item-dialog-sidebar">
            <section className="standard-item-dialog-attributes">
              <span>Attributes</span>
              <AttributeIcons item={item} />
            </section>
            <section className="standard-item-dialog-properties">
              <span>Variants</span>
              <ItemVariantBadges item={item} />
            </section>
            {item.status !== "auctioned" &&
            permissions.canManageItem &&
            (primaryAction || actions || permissions.canCustomizeCosmetic) ? (
              <div
                className={`standard-item-dialog-actions card-actions${
                  primaryAction ? " card-actions-with-primary" : ""
                }`}
                onClick={(event) => {
                  const target =
                    event.target instanceof Element
                      ? event.target.closest("button")
                      : null;
                  if (
                    target instanceof HTMLButtonElement &&
                    !target.disabled &&
                    target.getAttribute("aria-disabled") !== "true" &&
                    target.dataset.dialogPersistent !== "true"
                  ) {
                    onClose?.();
                  }
                }}
              >
                {primaryAction ? (
                  <>
                    <div className="card-action-primary">{primaryAction}</div>
                    <div className="card-action-array">
                      {actions}
                      {permissions.canCustomizeCosmetic ? (
                        <ArtStyleActionButton
                          onClick={() => {
                            onOpenArtStyle?.();
                            onClose?.();
                          }}
                        />
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    {actions}
                    {permissions.canCustomizeCosmetic ? (
                      <ArtStyleActionButton
                        onClick={() => {
                          onOpenArtStyle?.();
                          onClose?.();
                        }}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
          <CompleteItemRecord
            item={item}
            legendaryAttributes={legendaryAttributes}
            owner={owner}
            showAttributeDetails={false}
            showProperties={false}
            statusValue={displayedStatus}
          />
        </div>
    </div>
  );
}

function ItemLinkButton({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyLink() {
    try {
      const itemUrl = new URL(
        `/items/${encodeURIComponent(itemId)}`,
        window.location.origin,
      ).toString();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(itemUrl);
      } else {
        const input = document.createElement("textarea");
        input.value = itemUrl;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Clipboard copy was rejected.");
      }
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      aria-label="Copy item link"
      className="standard-item-link-button"
      onClick={() => void copyLink()}
      title={
        status === "copied"
          ? "Link copied"
          : status === "error"
            ? "Unable to copy link"
            : "Copy item link"
      }
      type="button"
    >
      <i
        aria-hidden="true"
        className={`fa ${status === "copied" ? "fa-check" : "fa-link"}`}
      />
      <span>
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Copy failed"
            : "Link"}
      </span>
    </button>
  );
}

function ItemCommunityShareButton({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<"idle" | "sharing" | "shared" | "error">(
    "idle",
  );

  async function shareItem() {
    setStatus("sharing");
    try {
      const response = await fetch("/api/play/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: `/items/${encodeURIComponent(itemId)}`,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: GalleryChatMessageView;
      };
      if (!response.ok || !body.message) {
        throw new Error(body.error ?? "The item could not be shared.");
      }
      window.dispatchEvent(
        new CustomEvent<GalleryChatMessageView>(
          "artfunkel:global-chat-message",
          { detail: body.message },
        ),
      );
      setStatus("shared");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      aria-label="Share with the community"
      className="standard-item-link-button"
      disabled={status === "sharing"}
      onClick={() => void shareItem()}
      title={
        status === "shared"
          ? "Shared with the community"
          : status === "error"
            ? "Unable to share item"
            : "Share with the community"
      }
      type="button"
    >
      <i
        aria-hidden="true"
        className={`fa ${status === "shared" ? "fa-check" : "fa-share-square"}`}
      />
      <span>
        {status === "sharing"
          ? "Sharing"
          : status === "shared"
            ? "Shared"
            : status === "error"
              ? "Share failed"
              : "Share"}
      </span>
    </button>
  );
}

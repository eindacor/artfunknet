"use client";

import { useEffect, useRef, useState } from "react";

import ItemThumbnail from "@/components/item-thumbnail";
import ItemCard from "@/components/item-cards/item-card";
import StandardItemDialog from "@/components/item-cards/standard-item-dialog";
import { resolveCardRendererId } from "@/components/item-cards/selection";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { GalleryFinishes } from "@/server/gallery-finishes";
import type { HydratedGameItem } from "@/server/item-artwork";
import type { RoomRevealPhase, OfferRevealSceneController } from "./offer-reveal-scene";
import styles from "./offer-reveal.module.css";

export default function OfferRevealDialog({
  displayed,
  error,
  finishes,
  item,
  legendaryAttributes,
  onCancel,
  onConfirm,
  saving,
}: {
  displayed: HydratedGameItem[];
  error: string;
  finishes: GalleryFinishes;
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<OfferRevealSceneController | null>(null);
  const skipRequested = useRef(false);
  const [displayedSnapshot] = useState(displayed);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [phase, setPhase] = useState<RoomRevealPhase | "loading" | "fallback">("loading");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    let scene: OfferRevealSceneController | null = null;
    import("./offer-reveal-scene").then(({ createOfferRevealLayout, mountOfferRevealScene }) => {
      if (!active || !host.current) return;
      const dimensions = (work: HydratedGameItem) => ({
        id: work._id,
        artworkId: work.artwork_id,
        image: work.artwork.image,
        width: work.artwork.width,
        height: work.artwork.height,
      });
      const layout = createOfferRevealLayout(dimensions(item), displayedSnapshot.map(dimensions), finishes);
      scene = mountOfferRevealScene(
        host.current, layout, finishes, item.artwork.rarity,
        (next) => { if (active) setPhase(next); },
        () => { if (active) setPhase("fallback"); },
        () => { if (active) setDetailsOpen(true); },
      );
      controller.current = scene;
      if (skipRequested.current) scene.skip();
    }).catch(() => { if (active) setPhase("fallback"); });
    return () => {
      active = false;
      scene?.dispose();
      controller.current = null;
    };
  }, [item, finishes, displayedSnapshot]);
  const ready = phase === "presenting" || phase === "ready" || phase === "fallback";
  const detailsLabel = `Open details for ${item.artwork.title} by ${item.artwork.artist}`;
  function openDetails() {
    if (ready && !saving) setDetailsOpen(true);
  }
  return (
    <>
      <dialog
        aria-labelledby="offer-reveal-title"
        className={styles.dialog}
        data-offer-reveal
        data-phase={phase}
        onCancel={(event) => {
          event.preventDefault();
          if (!saving) onCancel();
        }}
        ref={dialog}
      >
        <header className={styles.dialogHeader}>
          <h2 className="sr-only" id="offer-reveal-title">Something extraordinary awaits</h2>
          <button aria-label="Cancel reveal" disabled={saving} onClick={onCancel} type="button">&times;</button>
        </header>
        <div className={styles.stage}>
          <div className={styles.canvas} inert={!ready || saving} ref={host} />
          {phase === "fallback" ? (
            <div className={styles.fallback}>
              <button
                aria-label={detailsLabel}
                className={styles.fallbackArtwork}
                disabled={saving}
                onClick={openDetails}
                type="button"
              >
                <ItemThumbnail alt="The extraordinary artwork" item={item} size={400} />
              </button>
            </div>
          ) : null}
          <div aria-hidden={!ready} className={styles.revealCard} data-visible={ready || undefined}>
            <ItemCard
              interactive={ready && !saving}
              item={item}
              legendaryAttributes={legendaryAttributes}
              onActivate={openDetails}
            />
          </div>
          <p aria-live="polite" className="sr-only">
            {phase === "loading" ? "Preparing your gallery..." :
              phase === "approaching" ? "Follow the lights." :
              phase === "loading-artwork" ? "Loading your artwork..." :
              phase === "revealing" ? "An extraordinary discovery." :
              phase === "fallback" ? "The 3D scene is unavailable. You can still reveal your artwork." :
              "Your discovery awaits."}
          </p>
        </div>
        <footer className={styles.footer}>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button
            disabled={saving || ready}
            onClick={() => { skipRequested.current = true; controller.current?.skip(); }}
            type="button"
          >Skip</button>
          <button className={styles.confirm} disabled={saving || !ready} onClick={onConfirm} type="button">
            {saving ? "Revealing..." : "OK"}
          </button>
        </footer>
      </dialog>
      {detailsOpen ? (
        <StandardItemDialog
          currentRendererId={resolveCardRendererId({ itemRendererId: item.card_renderer })}
          item={item}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setDetailsOpen(false)}
          permissions={{ canManageItem: false, canCustomizeCosmetic: false }}
        />
      ) : null}
    </>
  );
}

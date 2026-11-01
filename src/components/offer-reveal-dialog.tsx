"use client";

import { useEffect, useRef, useState } from "react";

import ItemThumbnail from "@/components/item-thumbnail";
import type { GalleryFinishes } from "@/server/gallery-finishes";
import type { HydratedGameItem } from "@/server/item-artwork";
import { createGalleryLayout } from "./gallery-layout";
import type { HallwayPhase, OfferRevealSceneController } from "./offer-reveal-scene";
import styles from "./offer-reveal.module.css";

export default function OfferRevealDialog({
  error,
  finishes,
  item,
  onCancel,
  onConfirm,
  saving,
}: {
  error: string;
  finishes: GalleryFinishes;
  item: HydratedGameItem;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<OfferRevealSceneController | null>(null);
  const skipRequested = useRef(false);
  const [phase, setPhase] = useState<HallwayPhase | "loading" | "fallback">("loading");
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
    const layout = createGalleryLayout([{
      id: item._id,
      artworkId: item.artwork_id,
      width: item.artwork.width,
      height: item.artwork.height,
    }], finishes);
    import("./offer-reveal-scene").then(({ mountOfferRevealScene }) => {
      if (!active || !host.current) return;
      scene = mountOfferRevealScene(
        host.current, layout, finishes, item.artwork.rarity,
        (next) => { if (active) setPhase(next); },
        () => { if (active) setPhase("fallback"); },
      );
      controller.current = scene;
      if (skipRequested.current) scene.skip();
    }).catch(() => { if (active) setPhase("fallback"); });
    return () => {
      active = false;
      scene?.dispose();
      controller.current = null;
    };
  }, [item, finishes]);
  const ready = phase === "ready" || phase === "fallback";
  return (
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
        <div className={styles.canvas} ref={host} />
        {phase === "fallback" ? (
          <div className={styles.fallback}>
            <ItemThumbnail alt="The extraordinary artwork" item={item} size={400} />
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {phase === "loading" ? "Preparing your gallery..." :
            phase === "walking" ? "Follow the lights." :
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
  );
}

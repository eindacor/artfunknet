"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  createGalleryLayout,
  type GalleryArtworkDimensions,
} from "./gallery-layout";
import type { GallerySceneController } from "./gallery-scene";
import {
  DEFAULT_GALLERY_FINISHES,
  type GalleryFinishes,
} from "@/server/gallery-finishes";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function GalleryView({
  disabled = false,
  emptyMessage,
  finishes = DEFAULT_GALLERY_FINISHES,
  focusedItemId,
  items,
  navigation,
  onFocusItem,
  onSelectItem,
}: {
  disabled?: boolean;
  emptyMessage: string;
  finishes?: GalleryFinishes;
  focusedItemId?: string;
  items: HydratedGameItem[];
  navigation?: ReactNode;
  onFocusItem?: (item: HydratedGameItem) => void;
  onSelectItem: (item: HydratedGameItem) => void;
}) {
  const [view, setView] = useState({
    itemId: focusedItemId ?? items[0]?._id ?? null,
    zoomed: false,
  });
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef<GallerySceneController | null>(null);
  const select = useRef<(id: string) => void>(() => {});
  const activeItem =
    items.find(({ _id }) => _id === focusedItemId)
    ?? items.find(({ _id }) => _id === view.itemId)
    ?? items[0];
  const activeId = activeItem?._id ?? null;
  if (view.itemId !== activeId) {
    setView({ itemId: activeId, zoomed: false });
  }
  const zoomed = view.itemId === activeId && view.zoomed;
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1;
  const initialView = useRef({ id: activeItem?._id, zoomed });
  const initialFinishes = useRef(finishes);
  const sceneKey = JSON.stringify(
    items.map((item) => ({
      id: item._id,
      artworkId: item.artwork_id,
      width: item.artwork.width,
      height: item.artwork.height,
      title: item.artwork.title,
      artist: item.artwork.artist,
      date: item.artwork.date,
    })),
  );
  const { frame_width: frameWidth, matte_width: matteWidth } = finishes;
  const layout = useMemo(
    () => createGalleryLayout(JSON.parse(sceneKey) as GalleryArtworkDimensions[], {
      frame_width: frameWidth,
      matte_width: matteWidth,
    }),
    [sceneKey, frameWidth, matteWidth],
  );

  const focusItem = useCallback(
    (item: HydratedGameItem, preserveZoom = false) => {
      setView((current) => ({
        itemId: item._id,
        zoomed: preserveZoom && current.zoomed,
      }));
      onFocusItem?.(item);
    },
    [onFocusItem],
  );

  const activateItem = useCallback(
    (item: HydratedGameItem) => {
      if (item._id !== activeItem?._id) {
        focusItem(item);
        return;
      }
      setView((current) => ({
        itemId: item._id,
        zoomed: !(current.itemId === item._id && current.zoomed),
      }));
    },
    [activeItem, focusItem],
  );

  useEffect(() => {
    initialView.current = { id: activeItem?._id, zoomed };
    select.current = (id) => {
      if (disabled) return;
      const item = items.find(({ _id }) => _id === id);
      if (item) activateItem(item);
    };
  }, [activeItem, activateItem, disabled, items, zoomed]);

  useEffect(() => {
    let cancelled = false;
    let scene: GallerySceneController | undefined;
    void import("./gallery-scene")
      .then(({ mountGalleryScene }) => {
        if (cancelled || !host.current) return;
        try {
          scene = mountGalleryScene(
            host.current,
            layout,
            initialView.current.id,
            (id) => select.current(id),
            () => {
              if (!cancelled) setStatus("unavailable");
            },
            initialView.current.zoomed,
            initialFinishes.current,
          );
          controller.current = scene;
          setStatus("ready");
        } catch {
          setStatus("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      controller.current = null;
    };
  }, [layout]);

  useEffect(() => {
    if (activeItem) controller.current?.focus(activeItem._id, zoomed);
  }, [activeItem, zoomed]);

  useEffect(() => {
    initialFinishes.current = finishes;
    controller.current?.setFinishes(finishes);
  }, [finishes]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || disabled) return;
    let start: { x: number; y: number } | null = null;

    function touchStart(event: TouchEvent) {
      if (
        event.touches.length !== 1 ||
        (event.target instanceof Element && event.target.closest(
          "button:not(.gallery-image-fallback), a, input, select, textarea",
        ))
      ) {
        start = null;
        return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    function touchMove(event: TouchEvent) {
      if (event.touches.length !== 1) {
        start = null;
        return;
      }
      if (!start) return;
      const x = Math.abs(event.touches[0].clientX - start.x);
      const y = Math.abs(event.touches[0].clientY - start.y);
      if (x > 12 && x > y * 1.5 && event.cancelable) event.preventDefault();
    }

    function touchEnd(event: TouchEvent) {
      const origin = start;
      start = null;
      if (!origin || event.touches.length || event.changedTouches.length !== 1) return;
      const x = event.changedTouches[0].clientX - origin.x;
      const y = event.changedTouches[0].clientY - origin.y;
      if (Math.abs(x) < 50 || Math.abs(x) <= Math.abs(y) * 1.5) return;
      // A swipe must not also click the artwork and toggle zoom or open details.
      if (event.cancelable) event.preventDefault();
      const index = activeIndex + (x < 0 ? 1 : -1);
      if (index >= 0 && index < items.length) focusItem(items[index], true);
    }

    function touchCancel() {
      start = null;
    }

    element.addEventListener("touchstart", touchStart, { passive: true });
    element.addEventListener("touchmove", touchMove, { passive: false });
    element.addEventListener("touchend", touchEnd, { passive: false });
    element.addEventListener("touchcancel", touchCancel, { passive: true });
    return () => {
      element.removeEventListener("touchstart", touchStart);
      element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("touchend", touchEnd);
      element.removeEventListener("touchcancel", touchCancel);
    };
  }, [activeIndex, disabled, focusItem, items]);

  return (
    <div className="gallery-view">
      <div
        aria-label="Gallery artworks"
        className="gallery-viewport"
        onKeyDown={(event) => {
          if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
          if (
            (event.key === "Enter" || event.key === " ") &&
            event.target === event.currentTarget &&
            activeItem &&
            status === "ready"
          ) {
            event.preventDefault();
            activateItem(activeItem);
            return;
          }
          const index =
            event.key === "ArrowLeft" ? activeIndex - 1
              : event.key === "ArrowRight" ? activeIndex + 1
                : -1;
          if (index >= 0 && index < items.length) {
            event.preventDefault();
            focusItem(items[index], true);
          }
        }}
        role="region"
        ref={viewport}
        style={{ "--gallery-overlay-opacity": finishes.brightness * 0.4 } as CSSProperties}
        tabIndex={0}
      >
        <div
          className="gallery-canvas"
          hidden={status === "unavailable"}
          ref={host}
        />
        {navigation}
        {status === "loading" && activeItem ? (
          <p className="gallery-scene-message" role="status">
            Preparing the exhibition...
          </p>
        ) : null}
        {status === "unavailable" && activeItem ? (
          <button
            aria-label={`View ${activeItem.artwork.title} by ${activeItem.artwork.artist}`}
            className="gallery-image-fallback"
            disabled={disabled}
            onClick={() => onSelectItem(activeItem)}
            type="button"
          >
            <Image
              alt={activeItem.artwork.title}
              fill
              sizes="(max-width: 700px) 80vw, 900px"
              src={`/api/artwork/${encodeURIComponent(activeItem.artwork_id)}/image?variant=card`}
              unoptimized
            />
          </button>
        ) : null}
        {status === "unavailable" && !activeItem ? (
          <p className="gallery-render-notice">
            3D is unavailable on this device. Artwork browsing is still available.
          </p>
        ) : null}
        {!activeItem ? (
          <p className="gallery-scene-message">{emptyMessage}</p>
        ) : null}
        {activeItem ? (
          <>
            <button
              aria-label="Previous painting"
              className="gallery-painting-control previous"
              disabled={disabled || activeIndex <= 0}
              onClick={() => focusItem(items[activeIndex - 1], true)}
              title="Previous painting"
              type="button"
            >
              <i aria-hidden="true" className="fa fa-chevron-left" />
            </button>
            <button
              aria-label="Next painting"
              className="gallery-painting-control next"
              disabled={disabled || activeIndex >= items.length - 1}
              onClick={() => focusItem(items[activeIndex + 1], true)}
              title="Next painting"
              type="button"
            >
              <i aria-hidden="true" className="fa fa-chevron-right" />
            </button>
          </>
        ) : null}
        {activeItem ? (
          <div className="gallery-artwork-label">
            <div aria-atomic="true" aria-live="polite">
              <strong>{activeItem.artwork.title}</strong>
              <span>
                {activeItem.artwork.artist}, {activeItem.artwork.date}
              </span>
              <span>
                {activeItem.artwork.width} &times; {activeItem.artwork.height} cm
                {" / "}
                <span className={`rarity-text ${activeItem.artwork.rarity}`}>
                  {activeItem.artwork.rarity}
                </span>
              </span>
            </div>
            {status === "ready" ? (
              <button
                aria-label={zoomed ? "Zoom out" : "Zoom in"}
                aria-pressed={zoomed}
                disabled={disabled}
                onClick={() => activateItem(activeItem)}
                title={zoomed ? "Zoom out" : "Zoom in"}
                type="button"
              >
                <i
                  aria-hidden="true"
                  className={`fa ${zoomed ? "fa-magnifying-glass-minus" : "fa-magnifying-glass-plus"}`}
                />{" "}
                <span className="gallery-artwork-button-text">
                  {zoomed ? "Zoom out" : "Zoom in"}
                </span>
              </button>
            ) : null}
            <button
              aria-label="View details"
              disabled={disabled}
              onClick={() => onSelectItem(activeItem)}
              title="View details"
              type="button"
            >
              <i
                aria-hidden="true"
                className="fa fa-circle-info gallery-artwork-details-icon"
              />
              <span className="gallery-artwork-button-text">View details</span>
              <span className="gallery-artwork-position">
                {activeIndex + 1} / {items.length}
              </span>
            </button>
            {status === "unavailable" ? (
              <p className="gallery-render-notice">
                3D is unavailable on this device. Artwork browsing is still available.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

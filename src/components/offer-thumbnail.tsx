"use client";

import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useId,
  useRef,
} from "react";

import type { OfferRevealTier } from "@/server/offer-reveal";
import styles from "./offer-reveal.module.css";

export type OfferRevealTransition = OfferRevealTier | "burst";

export function MysteryOfferFace({ tier }: { tier: OfferRevealTier }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.mysteryFace} ${styles[`face${tier}`] ?? ""}`}
    >
      <span className={tier === 3 ? styles.logo : styles.question}>
        {tier === 3 ? "a" : "?"}
      </span>
      {tier !== 3 ? <span className={styles.sparkles} /> : null}
    </span>
  );
}

type ThumbnailTap = {
  pointerId: number;
  time: number;
  x: number;
  y: number;
};

export default function OfferThumbnail({
  children,
  className = "",
  tier,
  transitionTier,
  unrevealed,
  onReveal,
  ...buttonProps
}: Omit<ComponentProps<"button">, "children"> & {
  children: ReactNode;
  tier: OfferRevealTier;
  transitionTier?: OfferRevealTransition;
  unrevealed: boolean;
  onReveal?: () => void;
}) {
  const animationSeed = Array.from(useId()).reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0;
  const animationStyle = {
    "--mystery-animation-delay": `${-(animationSeed % 6000)}ms`,
  } as CSSProperties;
  const touch = useRef<{
    start: ThumbnailTap | null;
    previous: ThumbnailTap | null;
    reveal: boolean;
    lastTouch: number;
  }>({ start: null, previous: null, reveal: false, lastTouch: -Infinity });
  const pressed = buttonProps["aria-pressed"];
  const selectionDecoration = pressed === true ? (
    <>
      <span aria-hidden="true" className={styles.selectionShadow} />
      <span aria-hidden="true" className={styles.selectionTint} />
    </>
  ) : null;
  return (
    <button
      {...buttonProps}
      className={`${className} ${styles.thumbnail} ${transitionTier ? styles[`unmask${transitionTier}`] : ""}`.trim()}
      data-reveal-tier={tier}
      data-unrevealed={unrevealed || undefined}
      style={{ ...buttonProps.style, ...animationStyle }}
      onClick={(event) => {
        const reveal = touch.current.reveal;
        touch.current.reveal = false;
        buttonProps.onClick?.(event);
        if (reveal && unrevealed && !event.defaultPrevented) {
          onReveal?.();
        }
      }}
      onDoubleClick={(event) => {
        buttonProps.onDoubleClick?.(event);
        // Touch double taps use the movement and duration checks below.
        if (
          unrevealed && !event.defaultPrevented && !event.ctrlKey && !event.metaKey &&
          event.timeStamp - touch.current.lastTouch > 500
        ) onReveal?.();
      }}
      onPointerDown={(event) => {
        buttonProps.onPointerDown?.(event);
        if (event.pointerType === "touch") touch.current.lastTouch = event.timeStamp;
        touch.current.start = null;
        touch.current.reveal = false;
        if (
          !unrevealed || !onReveal || event.defaultPrevented ||
          event.pointerType !== "touch" || !event.isPrimary || event.button !== 0
        ) {
          touch.current.previous = null;
          return;
        }
        touch.current.start = {
          pointerId: event.pointerId, time: event.timeStamp,
          x: event.clientX, y: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        buttonProps.onPointerMove?.(event);
        const start = touch.current.start;
        if (start?.pointerId === event.pointerId &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
          touch.current.start = null;
          touch.current.previous = null;
        }
      }}
      onPointerCancel={(event) => {
        buttonProps.onPointerCancel?.(event);
        if (event.pointerType === "touch") touch.current.lastTouch = event.timeStamp;
        touch.current.start = null;
        touch.current.previous = null;
        touch.current.reveal = false;
      }}
      onPointerUp={(event) => {
        buttonProps.onPointerUp?.(event);
        if (event.pointerType === "touch") touch.current.lastTouch = event.timeStamp;
        const start = touch.current.start;
        touch.current.start = null;
        if (!start || start.pointerId !== event.pointerId || event.timeStamp - start.time > 350) {
          touch.current.previous = null;
          return;
        }
        const previous = touch.current.previous;
        touch.current.reveal = Boolean(previous &&
          event.timeStamp - previous.time <= 350 &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 24);
        touch.current.previous = touch.current.reveal ? null : {
          pointerId: event.pointerId, time: event.timeStamp,
          x: event.clientX, y: event.clientY,
        };
      }}
    >
      {unrevealed ? (
        <span className={styles.thumbnailFace}>
          <MysteryOfferFace tier={tier} />
        </span>
      ) : children}
      {selectionDecoration}
    </button>
  );
}

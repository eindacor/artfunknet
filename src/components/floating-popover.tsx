"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type ReactNode,
  type RefObject,
} from "react";

type PopoverPosition = {
  left: number;
  top: number;
};

export function FloatingPopover({
  anchorRef,
  ariaLabel,
  children,
  className,
  onDismiss,
  open,
  role,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  onDismiss?: () => void;
  open: boolean;
  role?: AriaRole;
}) {
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover || !open) {
      setPosition(null);
      if (popover?.matches(":popover-open")) popover.hidePopover();
      return;
    }
    const anchorElement = anchor;
    const popoverElement = popover;

    if (!popoverElement.matches(":popover-open")) {
      popoverElement.showPopover();
    }

    function updatePosition() {
      const anchorBounds = anchorElement.getBoundingClientRect();
      const popoverBounds = popoverElement.getBoundingClientRect();
      const gap = 6;
      const viewportPadding = 8;
      const centeredLeft =
        anchorBounds.left + (anchorBounds.width - popoverBounds.width) / 2;
      const left = Math.min(
        Math.max(centeredLeft, viewportPadding),
        window.innerWidth - popoverBounds.width - viewportPadding,
      );
      const above = anchorBounds.top - popoverBounds.height - gap;
      const top =
        above >= viewportPadding
          ? above
          : Math.min(
              anchorBounds.bottom + gap,
              window.innerHeight - popoverBounds.height - viewportPadding,
            );

      setPosition({ left, top });
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        onDismiss &&
        event.target instanceof Node &&
        !anchorElement.contains(event.target) &&
        !popoverElement.contains(event.target)
      ) {
        onDismiss();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (onDismiss && event.key === "Escape") onDismiss();
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      if (popoverElement.matches(":popover-open")) {
        popoverElement.hidePopover();
      }
    };
  }, [anchorRef, onDismiss, open]);

  return (
    <span
      aria-label={ariaLabel}
      className={`${className} floating-popover`}
      popover="manual"
      ref={popoverRef}
      role={role}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </span>
  );
}

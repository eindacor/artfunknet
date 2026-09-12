"use client";

import type { ComponentPropsWithoutRef, ElementType, MouseEvent } from "react";

import styles from "./action-button.module.css";

/**
 * The glyph's font-size is the only thing setting the control's footprint.
 * Spelled out rather than built as `text-${size}`, because Tailwind scans the
 * source as text and never sees a class name assembled at runtime.
 */
const ICON_SIZES = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
} as const;

type OwnProps = {
  icon: string;
  label: string;
  size?: keyof typeof ICON_SIZES;
  className?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  active?: boolean;
  /** Blocks onClick and greys the control out. Set through aria-disabled rather
      than the disabled attribute, so the control stays focusable. */
  disabled?: boolean;
  /** Appended to the accessible name to say why the control is unavailable. */
  disabledReason?: string;
  onDisabledClick?: () => void | Promise<void>;
  /** Keeps an enclosing dialog open when the control is clicked. */
  dialogPersistent?: boolean;
};

export type ActionButtonProps<T extends ElementType> = OwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof OwnProps | "as">;

export default function ActionButton<T extends ElementType = "button">({
  as,
  icon,
  size = "base",
  label,
  className = "",
  onClick,
  active = false,
  disabled = false,
  disabledReason,
  onDisabledClick,
  dialogPersistent = false,
  ...rest
}: ActionButtonProps<T>) {
  const Component = (as ?? "button") as ElementType;
  const reason =
    disabledReason ?? (disabled ? "Another action is being processed." : "");

  return (
    <Component
      aria-disabled={disabled || undefined}
      aria-label={reason ? `${label}. Unavailable: ${reason}` : label}
      className={`p-1 ${styles.button} ${
        active ? styles.active : ""
      } ${className}`}
      data-dialog-persistent={dialogPersistent ? "true" : undefined}
      type={Component === "button" ? "button" : undefined}
      {...rest}
      onClick={disabled ? undefined : (event: MouseEvent<HTMLElement>) => onClick?.(event)}
    >
      <i
        aria-hidden="true"
        className={`${ICON_SIZES[size]} fa fa-fw ${icon}`}
      />
    </Component>
  );
}

"use client";

import type { ComponentProps, ElementType, ReactNode } from "react";

import styles from "./icon-button.module.css";

type OwnProps = {
  /** Font Awesome classes, such as "fa-bell" or "fa-brands fa-discord". */
  icon: string;
  /** Drawn over the top-right corner. Nothing renders when it is null. */
  badge?: ReactNode;
  className?: string;
};

export type IconButtonProps<T extends ElementType> = OwnProps & {
  as?: T;
} & Omit<ComponentProps<T>, keyof OwnProps | "as" | "children">;

export default function IconButton<T extends ElementType = "button">({
  as,
  badge = null,
  className = "",
  icon,
  ...rest
}: IconButtonProps<T>) {
  const Component = (as ?? "button") as ElementType;

  return (
    <Component
      className={`${styles.button} ${className}`}
      type={Component === "button" ? "button" : undefined}
      {...rest}
    >
      <i aria-hidden="true" className={`fa ${icon}`} />
      {badge === null ? null : <span className={styles.badge}>{badge}</span>}
    </Component>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function ResponsiveMenu({
  children, className = "", label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    }
    const mobile = window.matchMedia("(max-width: 1200px)");
    function resize() { setOpen(false); }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    mobile.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      mobile.removeEventListener("change", resize);
    };
  }, [open]);

  return (
    <div className={`responsive-menu ${className}`.trim()} ref={root}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
      <button aria-controls={id} aria-expanded={open} aria-label={`${label} menu`}
        className="responsive-menu-toggle" onClick={() => setOpen(current => !current)}
        ref={toggle} type="button">
        <i aria-hidden="true" className={`fa ${open ? "fa-times" : "fa-bars"}`} />
        <span>{label}</span>
      </button>
      <div className="responsive-menu-content" data-open={open || undefined} id={id}
        onClick={event => {
          if (!(event.target instanceof Element) || !event.target.closest("a, button")) return;
          setOpen(false);
          if (toggle.current?.getClientRects().length) toggle.current.focus();
        }}>
        {children}
      </div>
    </div>
  );
}

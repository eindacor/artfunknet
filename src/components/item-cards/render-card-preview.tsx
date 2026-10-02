"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function RenderCardPreview({
  children,
  foil,
}: {
  children: ReactNode;
  foil: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [renderCard, setRenderCard] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const nextRenderCard =
      previewRef.current?.querySelector<HTMLElement>(":scope > .render-card") ??
      null;
    setRenderCard((current) =>
      current === nextRenderCard ? current : nextRenderCard,
    );
  }, [children]);

  return (
    <div className="render-card-preview" ref={previewRef}>
      {children}
      {foil && renderCard
        ? createPortal(
            <span aria-hidden="true" className="render-card-foil-sheen" />,
            renderCard,
          )
        : null}
    </div>
  );
}

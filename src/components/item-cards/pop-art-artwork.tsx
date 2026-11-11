"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArtworkImage,
  ArtworkImageSourceContext,
  useArtworkImageSource,
} from "./shared";
import { loadPopArtHalftone } from "./pop-art-halftone";
import type { ItemCardRendererProps } from "./types";

export default function PopArtBackdrop({ item }: Pick<ItemCardRendererProps, "item">) {
  const source = useArtworkImageSource(item.artwork_id, item.artwork.image);
  const misregistered = Boolean(item.unlocked);
  const key = `${source}|${misregistered}`;
  const [print, setPrint] = useState<{ key: string; source: string } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rendered = print?.key === key;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadPopArtHalftone(source, misregistered)
        .then((image) => {
          if (!cancelled) setPrint({ key, source: image });
        })
        .catch(() => {
          // Keep the readable, posterized artwork when pixels cannot be processed.
        });
    });
    observer.observe(frame);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [source, misregistered, key]);

  return (
    <ArtworkImageSourceContext value={rendered ? print.source : source}>
      <div
        className="pop-art-card-backdrop"
        aria-hidden="true"
        data-halftone={rendered || undefined}
        ref={frameRef}
      >
        <div className="pop-art-card-panels">
          {Array.from({ length: item.seasonal ? 4 : 1 }, (_, index) => (
            <div className="pop-art-card-panel" key={index}>
              <ArtworkImage className="pop-art-card-backdrop-image" item={item} />
            </div>
          ))}
        </div>
      </div>
    </ArtworkImageSourceContext>
  );
}

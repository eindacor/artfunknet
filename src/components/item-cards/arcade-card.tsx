"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { formatItemSerialNumber } from "@/server/item-serial-format";
import {
  ArtworkImage,
  ArtworkImageSourceContext,
  AttributeIcons,
  useArtworkImageSource,
} from "./shared";
import { getArcadePixelSource, loadArcadePixelArt } from "./arcade-pixel-art";
import type { ItemCardRendererProps } from "./types";

// Red lowers the outer edges while neutral blue leaves horizontal placement unchanged.
const TITLE_ARCH_MAP = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="256" height="1" viewBox="0 0 256 1" preserveAspectRatio="none">
    <defs><linearGradient id="arch">
      <stop offset="0" stop-color="#008080"/>
      <stop offset=".125" stop-color="#388080"/>
      <stop offset=".25" stop-color="#608080"/>
      <stop offset=".375" stop-color="#788080"/>
      <stop offset=".5" stop-color="#808080"/>
      <stop offset=".625" stop-color="#788080"/>
      <stop offset=".75" stop-color="#608080"/>
      <stop offset=".875" stop-color="#388080"/>
      <stop offset="1" stop-color="#008080"/>
    </linearGradient></defs>
    <path fill="url(#arch)" d="M0 0h256v1H0z"/>
  </svg>
`)}`;

export default function ArcadeCard({ item }: ItemCardRendererProps) {
  const titleArchId = `arcade-title-arch-${useId().replace(/:/g, "")}`;
  const title = item.lottery ? `${item.artwork.title} ${item.lottery}` : item.artwork.title;
  const titleSize = title.length > 44 ? "long" : title.length > 26 ? "medium" : "short";
  const serial = formatItemSerialNumber(item.artwork_id, item.serial_number, item.serial_prefix);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const heading = titleRef.current;
    const cover = heading?.parentElement;
    if (!heading || !cover) return;
    fitArcadeTitle(heading);
    const observer = new ResizeObserver(() => fitArcadeTitle(heading));
    observer.observe(cover);
    return () => observer.disconnect();
  }, [title]);
  return (
    <div
      className="render-card arcade-card"
      data-unlocked={item.unlocked || undefined}
      data-mint={item.mint || undefined}
    >
      <div aria-hidden="true" className="arcade-box-spine">
        <strong>AF</strong>
        <span>ARTFUNKEL GAME SYSTEM</span>
        <small title={`Serial number: ${serial}`}>{serial}</small>
      </div>
      <header className="arcade-system-logo" aria-label="ARTFUNKEL GAME SYSTEM">
        <span aria-hidden="true" className="arcade-system-mark">
          <i className="fa fa-paintbrush" />
        </span>
        <div>
          <strong>ARTFUNKEL</strong>
          <span>GAME SYSTEM</span>
        </div>
      </header>
      <div className="arcade-box-edition">
        {item.unlocked ? "ALL-ACCESS EDITION" : "THE ARTWORK COLLECTION"}
        {item.lottery ? (
          <strong aria-label={`Lottery sequel ${item.lottery}`}>VOL. {item.lottery}</strong>
        ) : null}
      </div>
      <div className="arcade-box-cover">
        <div className="arcade-cover-window">
          <ArcadeArtwork item={item} />
          <div aria-hidden="true" className="arcade-cover-shade" />
          {item.unlocked ? (
            <span className="arcade-access-sticker">
              <i aria-hidden="true" className="fa fa-hat-wizard" /> GAME WIZARD COMPATIBLE
            </span>
          ) : null}
          <p className="arcade-box-credit render-card-artist">BY {item.artwork.artist}</p>
        </div>
        <svg aria-hidden="true" focusable="false" className="arcade-title-filter" width="0" height="0">
          <defs>
            <filter id={titleArchId} x="0" y="0" width="100%" height="150%" colorInterpolationFilters="sRGB">
              <feImage href={TITLE_ARCH_MAP} preserveAspectRatio="none" result="arch-map" />
              <feDisplacementMap in="SourceGraphic" in2="arch-map" scale={Math.min(16, title.length * 1.5)} xChannelSelector="B" yChannelSelector="R" />
            </filter>
          </defs>
        </svg>
        <h3 ref={titleRef} className="arcade-game-title" data-title-size={titleSize} title={title} style={{ filter: `url(#${titleArchId})` }}>
          <span className="arcade-title-lettering">
            <span aria-hidden="true" className="arcade-title-extrusion">{title}</span>
            <span className="arcade-title-face">{title}</span>
          </span>
        </h3>
        {item.seasonal ? (
          <span className="arcade-graphics-burst">
            <small>INCREDIBLE</small>
            <strong>16-BIT</strong>
            <span>HIGH QUALITY<br />GRAPHICS!</span>
          </span>
        ) : null}
      </div>
      <footer className="arcade-box-footer">
        <div className="arcade-box-stats">
          <div className="arcade-box-rating">
            <span className="card-rarity-label">{item.artwork.rarity}</span>
            <strong>LV. {item.level}</strong>
          </div>
          <AttributeIcons item={item} />
          <div className="arcade-box-fine-print">
            <span>COND. {Math.round(item.condition * 100)}%</span>
            <strong>${item.values.actual.toLocaleString()}</strong>
          </div>
        </div>
        <span
          className="arcade-multiplayer-badge"
          aria-label="4-way play enabled"
        >
          <i aria-hidden="true" className="fa fa-gamepad" />
          <strong>4-WAY</strong>{" "}
          <small>PLAY ENABLED</small>
        </span>
      </footer>
      {item.mint ? <span aria-hidden="true" className="arcade-shrink-wrap" /> : null}
    </div>
  );
}

function fitArcadeTitle(heading: HTMLHeadingElement) {
  const face = heading.querySelector<HTMLElement>(".arcade-title-face");
  if (!face || !heading.clientWidth) return;
  heading.style.removeProperty("font-size");
  const fits = () => face.scrollWidth <= face.clientWidth && face.scrollHeight <= face.clientHeight;
  if (fits()) return;

  let minimum = 0.1;
  let maximum = parseFloat(getComputedStyle(heading).fontSize);
  for (let step = 0; step < 8; step++) {
    const size = (minimum + maximum) / 2;
    heading.style.fontSize = `${size}px`;
    if (fits()) minimum = size;
    else maximum = size;
  }
  heading.style.fontSize = `${minimum}px`;
}

function ArcadeArtwork({ item }: Pick<ItemCardRendererProps, "item">) {
  const artworkSource = useArtworkImageSource(item.artwork_id, item.artwork.image);
  const source = item.seasonal ? getArcadePixelSource(artworkSource) : artworkSource;
  const [pixelArt, setPixelArt] = useState<{ source: string; image: string } | null>(null);
  useEffect(() => {
    if (!item.seasonal) return;
    let cancelled = false;
    void loadArcadePixelArt(source)
      .then(image => {
        if (!cancelled) setPixelArt({ source, image });
      })
      .catch(() => {
        // Keep the original artwork when a preview source cannot be read by canvas.
      });
    return () => { cancelled = true; };
  }, [item.seasonal, source]);
  const image = item.seasonal && pixelArt?.source === source ? pixelArt.image : source;
  return (
    <ArtworkImageSourceContext value={image}>
      <div className="arcade-box-art" data-pixelated={item.seasonal || undefined}>
        <ArtworkImage className="arcade-card-image" item={item} />
      </div>
    </ArtworkImageSourceContext>
  );
}

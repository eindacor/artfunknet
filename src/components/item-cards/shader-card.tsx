"use client";

import type { CSSProperties } from "react";

import { useShaderCard } from "./use-shader-card";
import type { ShaderUniforms } from "./use-shader-card";
import { rarityToVec3 } from "./shader-utils";
import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

// ── ShaderBackground ──────────────────────────────────────────────────────────

/**
 * Renders a WebGL canvas that fills its parent using the given `.frag` shader.
 * All standard item uniforms are set automatically; pass `extraUniforms` for
 * any shader-specific ones.
 *
 * The canvas is `position: absolute; inset: 0` so the card layout
 * (header, image frame, stats) can sit on top as normal DOM children.
 */
export function ShaderBackground({
  item,
  shaderUrl,
  extraUniforms,
}: Pick<ItemCardRendererProps, "item"> & {
  shaderUrl: string;
  extraUniforms?: ShaderUniforms;
}) {
  const imageUrl = `/api/artwork/${item.artwork_id}/image?variant=card`;

  const canvasRef = useShaderCard({
    shaderUrl,
    imageUrl,
    itemRarity: rarityToVec3(item.artwork.rarity),
    condition: item.condition,
    level: item.level,
    foil: item.foil ? 1 : 0,
    mint: item.mint ? 1 : 0,
    extraUniforms,
  });

  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  };

  return <canvas ref={canvasRef} style={style} aria-hidden="true" />;
}

// ── ShaderCard ────────────────────────────────────────────────────────────────

/**
 * A full card renderer backed by a WebGL fragment shader.
 *
 * The shader file is resolved from `public/shaders/<shaderFile>`.
 * Defaults to `default.frag`.
 *
 * The card places `ShaderBackground` as the bottom layer and renders the
 * normal artwork image + metadata on top.  The artwork image is also
 * available inside the shader as `u_image` so you can composite it however
 * you like.
 */
export default function ShaderCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
  shaderFile = "my-effect.frag",
  extraUniforms,
}: ItemCardRendererProps & {
  /** Path relative to `public/shaders/`. Defaults to `"default.frag"`. */
  shaderFile?: string;
  /** Extra GLSL uniforms forwarded to the shader (name → value). */
  extraUniforms?: ShaderUniforms;
}) {
  const shaderUrl = `/shaders/${shaderFile}`;

  return (
    <div
      className="render-card shader-card"
      style={{ position: "relative", overflow: "hidden" }}
    >
      {/* WebGL layer — full bleed behind everything */}
      <ShaderBackground
        item={item}
        shaderUrl={shaderUrl}
        extraUniforms={extraUniforms}
      />

      {/* Card chrome — same layout pattern as other cards */}
      <header style={{ position: "relative", zIndex: 1 }}>
        <span className="card-rarity-label">{item.artwork.rarity}</span>
        <strong>
          P{item.level}
        </strong>
      </header>

      <div className="shader-card-image-frame" style={{ position: "relative", zIndex: 1 }}>
        <ArtworkImage className="shader-card-image" item={item} />
      </div>

      <section style={{ position: "relative", zIndex: 1 }}>
        <ItemStatusBadges
          item={item}
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          researchTarget={researchTarget}
        />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <CompactStats item={item} />
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}

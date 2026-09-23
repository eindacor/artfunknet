import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";
import { useShaderCard } from "./use-shader-card";
import { rarityToVec3 } from "./shader-utils";
import type { CSSProperties } from "react";
import type { ShaderUniforms } from "./use-shader-card";

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

export default function MinimalistCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
  extraUniforms,
}: ItemCardRendererProps) {
  const marks = [
    item.mint ? ["mint", "Mint"] : null,
    item.lottery ? ["lottery", `Lottery level ${item.lottery}`] : null,
    item.unlocked ? ["unlocked", "Unlocked"] : null,
    item.seasonal ? ["seasonal", "Seasonal"] : null,
    item.foil ? ["foil", "Foil"] : null,
    item.original ? ["original", "Original"] : null,
    item.vintage ? ["vintage", "Vintage"] : null,
  ].filter((mark): mark is string[] => mark !== null);

  const shaderUrl = `/shaders/full_bleed_seasonal.frag`;

  return (
    <div className="render-card minimalist-card">
      {item.seasonal ? (
        <ShaderBackground
          item={item}
          shaderUrl={shaderUrl}
          extraUniforms={extraUniforms}
        />
      ) : (
        <ArtworkImage className="minimalist-card-image" item={item} />
      )}
      <div className="minimalist-card-shade" />
      <header>
        <span className="minimalist-card-artist">
          <i aria-hidden="true" className="minimalist-card-rarity-mark" />
          {item.artwork.artist}
        </span>
        <span>{item.artwork.date}</span>
      </header>
      <section>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.medium}</p>
      </section>
      <footer>
        <span className="minimalist-card-marks">
          {marks.map(([key, label]) => (
            <i
              aria-label={label}
              className={`minimalist-mark minimalist-mark-${key}`}
              key={key}
            />
          ))}
        </span>
        <span className="minimalist-card-level">P{item.level}</span>
        <AttributeIcons item={item} />
      </footer>
      <ItemStatusBadges
        alreadyOwned={alreadyOwned}
        consigned={consigned}
        item={item}
        researchTarget={researchTarget}
        showFoil={false}
        showMint={false}
        showUnlocked={false}
      />
    </div>
  );
}

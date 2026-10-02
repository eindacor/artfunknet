import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import { ShaderBackground } from "./shader-card";
import type { ItemCardRendererProps } from "./types";

export default function PrismaticCard(props: ItemCardRendererProps) {
  const {
    item,
    alreadyOwned,
    consigned,
    researchTarget,
    extraUniforms,
  } = props;

  return (
    <div className="render-card prismatic-card prismatic-card-shader">
      <ShaderBackground
          item={item}
          shaderUrl="/shaders/prismatic-showcase.frag"
          extraUniforms={extraUniforms}
        />
      <header>
        <span className="card-rarity-label">{item.artwork.rarity}</span>
        <strong>✦ {item.level} ✦</strong>
      </header>
      <div className="prismatic-card-image-frame">
        <ArtworkImage className="prismatic-card-image" item={item} />
      </div>
      <section>
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <CompactStats item={item} />
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}

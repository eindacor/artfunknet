import ArtworkThumbnail from "@/components/artwork-thumbnail";
import { getArtworkFeatureCardAdjustment } from "@/components/item-cards/artwork-image-adjustments";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function FeaturedWorkContent({ item, legendaryEffect, unrevealed = false }: {
  item: HydratedGameItem;
  legendaryEffect?: CardLegendaryAttribute;
  unrevealed?: boolean;
}) {
  return <>
    {!unrevealed ? <ArtworkThumbnail
      adjustment={getArtworkFeatureCardAdjustment(item.artwork)}
      alt=""
      artworkId={item.artwork_id}
      className="home-featured-image"
      image={item.artwork.image}
      size={360}
      variant="card"
    /> : null}
    <span className="home-featured-copy" data-has-effect={legendaryEffect ? true : undefined}>
      <span className="home-featured-details">
        <small className="home-featured-rarity">{item.artwork.rarity}</small>
        <strong>{unrevealed ? "Unrevealed featured work" : item.artwork.title}</strong>
        <span>{unrevealed ? "Select to reveal this artwork" : item.artwork.artist}</span>
        {!unrevealed ? <small>{item.artwork.date}{" \u00b7 "}${item.values.actual.toLocaleString()}</small> : null}
      </span>
      {legendaryEffect ? <span className="home-featured-effect" id={`featured-effect-${item._id}`}>
        <strong>{legendaryEffect.title}</strong>
        <span>{legendaryEffect.description}</span>
      </span> : null}
    </span>
  </>;
}

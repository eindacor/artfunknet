import {
  ArtworkImage,
  AttributeIcons,
  getActiveLegendaryAttribute,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function DiabloDetailCard({
  item,
  consigned,
  legendaryAttributes,
  researchTarget,
}: ItemCardRendererProps) {
  const rarity = item.artwork.rarity;
  const legendaryEffect =
    rarity === "legendary" || rarity === "masterpiece"
      ? getActiveLegendaryAttribute(item, legendaryAttributes)
      : undefined;

  return (
    <div
      className="render-card d3-item-tooltip"
      data-seasonal={item.seasonal ? "true" : undefined}
    >
      <div className="d3-item-frame">
        <div className="d3-item-nameplate">
          <div className="d3-item-name">
            {item.artwork.title}
          </div>
        </div>

        <div className="d3-item-content">
          <div className="d3-item-overview">
            <div className="d3-item-icon">
              <ArtworkImage className="d3-item-image" item={item} />
            </div>

            <div className="d3-item-summary">
              <div className="d3-item-type">
                {rarity === "legendary"
                  ? "Legendary artwork"
                  : `${rarity} artwork`}
              </div>

              <div className="d3-item-subtype">
                {item.artwork.artist}
              </div>

              <div className="d3-item-value">
                {item.values?.actual != null
                  ? item.values.actual.toLocaleString()
                  : "—"}
              </div>

              <div className="d3-item-value-label">
                Damage Per Second
              </div>
            </div>
          </div>

          <div className="d3-item-stat-group">
            <div className="d3-item-section-title">
              Primary Attributes
            </div>
            <div className="d3-item-attributes">
              <AttributeIcons item={item} />
            </div>
          </div>

          <div className="d3-item-stat-group">
            <div className="d3-item-section-title">
              Secondary Attributes
            </div>
            <div className="d3-item-stat-line">
              <span className="d3-orange-diamond" />
              {item.artwork.medium}
            </div>
            <div className="d3-item-stat-line">
              <span className="d3-orange-diamond" />
              {item.artwork.genre}
            </div>
            {consigned && (
              <div className="d3-item-stat-line">
                <span className="d3-orange-diamond" />
                Currently consigned
              </div>
            )}
            {researchTarget && (
              <div className="d3-item-stat-line">
                <span className="d3-orange-diamond" />
                Research target
              </div>
            )}
          </div>

          {legendaryEffect ? (
            <div className="d3-item-lore d3-item-effect">
              <span className="d3-gray-diamond" />
              <span className="d3-legendary-text">
                {legendaryEffect.description}
              </span>
            </div>
          ) : null}

          {item.seasonal ? (
            <div className="d3-item-lore">
              <span className="d3-gray-diamond" />
              <span className="d3-legendary-text">
                Reduce the cooldown of Fetish Army and Big Bad Voodoo by 1 second
                each time your fetishes deal damage.
              </span>
            </div>
          ) : null }

          <div className="d3-item-requirements">
            {item.unlocked ? "Unlocked" : "Account Bound"}
          </div>
        </div>

        <div className="d3-item-footer">
          <span>
            Estimated Value: {item.values?.actual != null
              ? item.values.actual.toLocaleString()
              : "—"} 
          </span>
          <span className="d3-gold-symbol">●</span>
          <span>
              {item.mint ? (
                <i aria-label="Mint condition" className="fa fa-leaf" />
              ) : (
                <>Durability: {Math.round(item.condition * 100)}/100</>
              )}
          </span>
        </div>
      </div>
    </div>
  );
}

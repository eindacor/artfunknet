import { formatItemSerialNumber } from "@/server/item-serial-format";
import { ArtworkImage, AttributeIcons } from "./shared";
import PopArtBackdrop from "./pop-art-artwork";
import type { ItemCardRendererProps } from "./types";

const compactValue = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export default function PopArtCard({ item }: ItemCardRendererProps) {
  const serial = formatItemSerialNumber(item.artwork_id, item.serial_number, item.serial_prefix);
  const titleSize = item.artwork.title.length > 42 ? "long" : item.artwork.title.length > 22 ? "medium" : "short";

  return (
    <div
      className="render-card pop-art-card"
      data-mint={item.mint || undefined}
      data-unlocked={item.unlocked || undefined}
      data-seasonal={item.seasonal || undefined}
      data-foil={item.foil || undefined}
    >
      <PopArtBackdrop item={item} />
      <header className="pop-art-card-heading">
        <div className="pop-art-card-imprint">
          <strong>{item.artwork.rarity}</strong>
          <span aria-hidden="true" className="pop-art-card-registration">
            <i /><i /><i /><i />
          </span>
        </div>
        <h3 data-title-size={titleSize} title={item.artwork.title}>{item.artwork.title}</h3>
        <p className="render-card-artist" title={item.artwork.artist}>by {item.artwork.artist}</p>
      </header>
      <figure className="pop-art-card-print">
        <div className="pop-art-card-burst">
          <ArtworkImage className="pop-art-card-image" item={item} />
        </div>
        <figcaption
          className="pop-art-card-caption"
          title={`${item.artwork.medium} / ${item.artwork.date}`}
        >
          {item.artwork.medium} / {item.artwork.date}
        </figcaption>
        {item.lottery > 0 ? (
          <span
            className="pop-art-card-lottery"
            aria-label={`Lottery level ${item.lottery}`}
            title={`Lottery level ${item.lottery}`}
          >
            <i aria-hidden="true" className="fa fa-star" />
            <strong>{item.lottery}</strong>
          </span>
        ) : null}
      </figure>
      <footer className="pop-art-card-footer">
        <div className="pop-art-card-editions">
          {item.mint ? <span aria-label="Mint" title="Mint"><i aria-hidden="true" className="fa fa-leaf" /> MINT</span> : null}
          {item.unlocked ? <span aria-label="Unlocked" title="Unlocked"><i aria-hidden="true" className="fa fa-unlock-alt" /> UNLOCKED</span> : null}
          {item.seasonal ? <span aria-label="Seasonal" title="Seasonal"><i aria-hidden="true" className="fa fa-th-large" /> SERIES</span> : null}
          {item.foil ? <span aria-label="Foil" title="Foil"><i aria-hidden="true" className="fa fa-diamond" /> FOIL</span> : null}
        </div>
        <AttributeIcons item={item} />
        <div className="pop-art-card-stats">
          <span title={`Level: ${item.level.toLocaleString("en-US")}`}>LV. {compactValue.format(item.level)}</span>
          <span title={`Condition: ${Math.round(item.condition * 100)}%`}>{Math.round(item.condition * 100)}%</span>
          <strong title={`$${item.values.actual.toLocaleString("en-US")}`}>${compactValue.format(item.values.actual)}</strong>
        </div>
        <small className="pop-art-card-serial" title={`Serial number: ${serial}`}>{serial}</small>
      </footer>
    </div>
  );
}

import { formatItemSerialNumber } from "@/server/item-serial-format";
import { ArtworkImage, AttributeIcons } from "./shared";
import type { ItemCardRendererProps } from "./types";
import VaporwaveAtmosphere from "./vaporwave-atmosphere";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const weavePaths = Array.from({ length: 15 }, (_, index) => {
  const offset = index * 6;
  return `M ${228 + offset} -15 C ${180 + offset} 85, ${415 - offset} 95, ${340 + offset} 195 S ${235 + offset} 245, ${310 + offset} 290`;
});

export default function VaporwaveCard({ item }: ItemCardRendererProps) {
  const serial = formatItemSerialNumber(item.artwork_id, item.serial_number, item.serial_prefix);
  const condition = `${Math.round(item.condition * 100)}%`;
  const stats = [
    {
      label: `Level: ${item.level.toLocaleString("en-US")}`,
      icon: "fa-bolt",
      value: compactNumber.format(item.level).toLowerCase(),
    },
    {
      label: `Condition: ${condition}`,
      icon: "fa-heartbeat",
      value: condition,
    },
    {
      label: `Value: $${item.values.actual.toLocaleString("en-US")}`,
      icon: "fa-dollar",
      value: compactNumber.format(item.values.actual).toLowerCase(),
    },
  ];

  return (
    <div
      className="render-card vaporwave-card"
      data-mint={item.mint ? "true" : undefined}
      data-unlocked={item.unlocked ? "true" : undefined}
      data-seasonal={item.seasonal ? "true" : undefined}
      data-foil={item.foil ? "true" : undefined}
      data-lottery={item.lottery > 0 ? item.lottery : undefined}
    >
      <ArtworkImage className="vaporwave-card-background" item={item} />
      <span aria-hidden="true" className="vaporwave-card-color-wash" />
      <div aria-hidden="true" className="vaporwave-card-refraction">
        <ArtworkImage className="vaporwave-card-refracted-art" item={item} />
      </div>
      <span aria-hidden="true" className="vaporwave-card-liquid" />
      <VaporwaveAtmosphere />
      <svg
        aria-hidden="true"
        className="vaporwave-card-geometry"
        viewBox="0 0 390 260"
        fill="none"
      >
        <path className="vaporwave-card-prism" d="M20 73 413 -5 367 281 -27 359Z" />
        <path className="vaporwave-card-prism-echo" d="M35 57 396 21 348 297 -13 333Z" />
        <path
          className="vaporwave-card-hairlines"
          d="M0 191 91 169 143 260M281 0 263 36M370 105 390 98"
        />
        <g className="vaporwave-card-mesh">
          {Array.from({ length: 9 }, (_, index) => (
            <path
              key={index}
              d={`M${-90 + index * 22} 260 111 ${169 + index * 3} M0 ${200 + index * 8} 150 ${219 + index * 9}`}
            />
          ))}
        </g>
      </svg>
      <span
        className="vaporwave-card-serial"
        aria-label={`Serial number: ${serial}`}
        title={`Serial number: ${serial}`}
      >
        {serial}
      </span>
      <header className="vaporwave-card-heading">
        <h3 title={item.artwork.title}>
          {item.artwork.title}
        </h3>
        <p className="render-card-artist" title={item.artwork.artist}>
          {item.artwork.artist}
        </p>
      </header>
      {item.seasonal ? (
        <svg
          aria-hidden="true"
          className="vaporwave-card-seasonal-weave"
          viewBox="0 0 390 260"
          fill="none"
        >
          {weavePaths.map((path) => (
            <path key={path} d={path} />
          ))}
        </svg>
      ) : null}
      {item.mint ? (
        <svg
          aria-hidden="true"
          className="vaporwave-card-mint-facet"
          viewBox="0 0 100 100"
          fill="none"
        >
          <path d="M50 4 91 31 78 79 31 96 8 49Z" />
          <path d="M50 4 62 44 91 31M62 44 78 79 31 96 38 55 8 49M38 55 50 4M38 55 62 44 31 96" />
        </svg>
      ) : null}
      {item.unlocked ? (
        <div aria-hidden="true" className="vaporwave-card-signal-slices">
          <ArtworkImage className="vaporwave-card-sliced-art" item={item} />
        </div>
      ) : null}
      {item.lottery > 0 ? (
        <svg
          aria-hidden="true"
          className="vaporwave-card-lottery-seal"
          viewBox="0 0 100 100"
          fill="none"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <g key={index} transform={`rotate(${index * 45} 50 50)`}>
              <path d="M50 3 57 32 50 50 43 32Z" />
              <path d="M50 3 50 50" />
            </g>
          ))}
          <path
            className="vaporwave-card-seal-core"
            d="M50 35 65 50 50 65 35 50Z"
          />
        </svg>
      ) : null}
      <div className="vaporwave-card-attributes">
        <AttributeIcons item={item} />
      </div>
      <footer className="vaporwave-card-info">
        <div className="vaporwave-card-info-heading">
          <strong className="vaporwave-card-rarity card-rarity-label">
            {item.artwork.rarity}
          </strong>
          <div className="vaporwave-card-variants">
            {item.mint ? (
              <i aria-label="Mint" title="Mint" className="fa fa-leaf" />
            ) : null}
            {item.unlocked ? (
              <i
                aria-label="Unlocked"
                title="Unlocked"
                className="fa fa-unlock-alt"
              />
            ) : null}
            {item.seasonal ? (
              <i aria-label="Seasonal" title="Seasonal" className="fa fa-sun-o" />
            ) : null}
            {item.foil ? (
              <i aria-label="Foil" title="Foil" className="fa fa-diamond" />
            ) : null}
            {item.lottery > 0 ? (
              <span
                aria-label={`Lottery level ${item.lottery}`}
                title={`Lottery level ${item.lottery}`}
              >
                <i aria-hidden="true" className="fa fa-star" /> {item.lottery}
              </span>
            ) : null}
          </div>
        </div>
        <p
          className="vaporwave-card-record"
          title={`${item.artwork.medium} / ${item.artwork.date}`}
        >
          <span title={item.artwork.medium}>
            <i aria-hidden="true" className="fa fa-paint-brush" />
            <span>{item.artwork.medium}</span>
          </span>
          <span title={String(item.artwork.date)}>
            <i aria-hidden="true" className="fa fa-calendar-o" />
            <span>{item.artwork.date}</span>
          </span>
        </p>
        <div className="vaporwave-card-stats">
          {stats.map(({ label, icon, value }) => (
            <span key={icon} role="img" aria-label={label} title={label}>
              <i aria-hidden="true" className={`fa ${icon}`} />
              <strong aria-hidden="true">{value}</strong>
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}

import { ArtworkImage } from "./shared";
import type { ItemCardRendererProps } from "./types";

type TarotAttribute = ItemCardRendererProps["item"]["attributes"]["unlocked"][number];
type TarotAttributeKind = "unlocked" | "locked" | "special";

const TAROT_ATTRIBUTE_ICONS: Record<string, string> = {
  FgRMQA6s24wmTRyrx: "fa-balance-scale",
  mZH58WpgbKP9o9WZR: "fa-diamond",
  dTSjqBx45mRTvFJeh: "fa-wand-magic-sparkles",
  Yk2kk2mZtHetvbrY5: "fa-hat-wizard",
  Lacw8fkPYvSQrmpQN: "fa-hand-holding-dollar",
  T8v35e75v4Hh2JpxQ: "fa-masks-theater",
  nwMiN3DFBgsKBNSar: "fa-eye",
  Z7wY5jXkDeckwfFLs: "fa-scroll",
  zR2KgxYe4LQZKBAiE: "fa-shield",
  KsQiutk7Qm4DFWLST: "fa-star-and-crescent",
};

const TAROT_ATTRIBUTE_NAMES: Record<string, string> = {
  FgRMQA6s24wmTRyrx: "Justice",
  mZH58WpgbKP9o9WZR: "The Emperor",
  dTSjqBx45mRTvFJeh: "The Star",
  Yk2kk2mZtHetvbrY5: "The Magician",
  Lacw8fkPYvSQrmpQN: "The Empress",
  T8v35e75v4Hh2JpxQ: "The Fool",
  nwMiN3DFBgsKBNSar: "The High Priestess",
  Z7wY5jXkDeckwfFLs: "The Hierophant",
  zR2KgxYe4LQZKBAiE: "Strength",
  KsQiutk7Qm4DFWLST: "The World",
};

const ARCANA_THEMES = {
  0: { id: "arcana", label: "Astral", icon: "fa-star-and-crescent" },
  1: { id: "earth", label: "Earth", icon: "fa-mountain" },
  2: { id: "fire", label: "Fire", icon: "fa-fire" },
  3: { id: "magma", label: "Magma", icon: "fa-volcano" },
  4: { id: "winter", label: "Winter", icon: "fa-snowflake" },
  5: { id: "glacier", label: "Glacier", icon: "fa-icicles" },
  6: { id: "blue-flame", label: "Blue Flame", icon: "fa-fire-flame-curved" },
  7: { id: "lava-glacier", label: "Lava Glacier", icon: "fa-volcano" },
  8: { id: "plant", label: "Plant", icon: "fa-seedling" },
  9: { id: "forest", label: "Forest", icon: "fa-tree" },
  10: { id: "fire-plant", label: "Fire Bloom", icon: "fa-sun-plant-wilt" },
  11: { id: "forest-fire", label: "Forest Fire", icon: "fa-fire" },
  12: { id: "evergreen", label: "Evergreen", icon: "fa-tree" },
  13: { id: "cave-crystal", label: "Cave Crystal", icon: "fa-gem" },
  14: { id: "snow-orchid", label: "Snow Orchid", icon: "fa-seedling" },
  15: { id: "divine", label: "Divine", icon: "fa-rainbow" },
} as const;

export default function TarotCard({ item }: ItemCardRendererProps) {
  const attributes = [
    ...item.attributes.special.map((attribute) => ({
      attribute,
      kind: "special" as const,
    })),
    ...item.attributes.unlocked.map((attribute) => ({
      attribute,
      kind: "unlocked" as const,
    })),
    ...item.attributes.locked.map((attribute) => ({
      attribute,
      kind: "locked" as const,
    })),
  ];
  const theme = getArcanaTheme(item);
  const leftAttributes = attributes.filter((_, index) => index % 2 === 0);
  const rightAttributes = attributes.filter((_, index) => index % 2 === 1);
  const lotteryPips = Array.from(
    { length: Math.min(10, Math.max(0, item.lottery)) },
    (_, index) => index,
  );

  return (
    <div
      className="render-card tarot-card"
      data-arcana-theme={theme.id}
      data-lottery={item.lottery || undefined}
    >
      <div className="tarot-card-pattern" aria-hidden="true" />
      <div className="tarot-card-aura" aria-hidden="true" />
      <span className="tarot-card-corner corner-top-left" aria-hidden="true" />
      <span className="tarot-card-corner corner-top-right" aria-hidden="true" />
      <span className="tarot-card-corner corner-bottom-left" aria-hidden="true" />
      <span className="tarot-card-corner corner-bottom-right" aria-hidden="true" />

      <header className="tarot-card-header">
        <span className="tarot-card-medallion">
          {item.level.toString().padStart(2, "0")}
        </span>
        <div>
          <span className="tarot-card-arcana">{theme.label} Arcana</span>
          <h3>{item.artwork.title}</h3>
          <p className="render-card-artist">{item.artwork.artist}</p>
        </div>
        <span className="tarot-card-medallion tarot-card-theme-sigil">
          <i aria-hidden="true" className={`fa ${theme.icon}`} />
        </span>
      </header>
      <div className="tarot-card-stage">
        <TarotAttributeRail attributes={leftAttributes} side="left" />
        <div className="tarot-card-art-frame">
          <ArtworkImage className="tarot-card-image" item={item} />
          <span className="tarot-card-art-effect" aria-hidden="true" />
          <span className="tarot-card-art-oval" aria-hidden="true" />
          {item.lottery > 0 ? (
            <span
              aria-label={`Lottery level ${item.lottery}`}
              className="tarot-card-lottery-effects"
              role="img"
            >
              <span
                className="tarot-card-lottery-ring lottery-ring-outer"
                aria-hidden="true"
              />
              <span
                className="tarot-card-lottery-ring lottery-ring-inner"
                aria-hidden="true"
              />
              <span className="tarot-card-lottery-level">
                <span>
                  <i aria-hidden="true" className="fa fa-star" />
                  L{item.lottery}
                  <i aria-hidden="true" className="fa fa-star" />
                </span>
                <span className="tarot-card-lottery-pips" aria-hidden="true">
                  {lotteryPips.map((pip) => (
                    <i className="fa fa-star" key={pip} />
                  ))}
                </span>
              </span>
            </span>
          ) : null}
        </div>
        <TarotAttributeRail attributes={rightAttributes} side="right" />
      </div>

      <section className="tarot-card-reading">
        <span>${item.values.actual.toLocaleString()}</span>
        <strong className="card-rarity-label">{item.artwork.rarity}</strong>
        <span>{Math.round(item.condition * 100)}% condition</span>
      </section>

      <div className="tarot-card-state-icons">
        {item.unlocked ? (
          <span aria-label="Earth power" title="Earth">
            <i aria-hidden="true" className="fa fa-mountain" />
          </span>
        ) : null}
        {item.foil ? (
          <span aria-label="Fire power" title="Fire">
            <i aria-hidden="true" className="fa fa-fire" />
          </span>
        ) : null}
        {item.seasonal ? (
          <span aria-label="Winter power" title="Winter">
            <i aria-hidden="true" className="fa fa-snowflake" />
          </span>
        ) : null}
        {item.mint ? (
          <span aria-label="Plant power" title="Plant">
            <i aria-hidden="true" className="fa fa-leaf" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TarotAttributeRail({
  attributes,
  side,
}: {
  attributes: Array<{
    attribute: TarotAttribute;
    kind: TarotAttributeKind;
  }>;
  side: "left" | "right";
}) {
  return (
    <div className={`tarot-card-attribute-rail rail-${side}`}>
      {attributes.map(({ attribute, kind }) => {
        const rating = Math.round((attribute.value ?? 0) * 100);
        const name =
          TAROT_ATTRIBUTE_NAMES[attribute._id] ??
          attribute.npc_name.replace(/^Art /, "");
        return (
          <span
            aria-label={`${name}, ${rating}%, ${kind}`}
            className={`tarot-card-attribute attribute-${kind}`}
            key={`${kind}:${attribute._id}`}
            title={`${attribute.npc_name} · ${rating}% · ${kind}`}
          >
            <i
              aria-hidden="true"
              className={`fa ${
                TAROT_ATTRIBUTE_ICONS[attribute._id] ??
                "fa-star-and-crescent"
              }`}
            />
            <small>{name}</small>
            <strong>{rating}%</strong>
          </span>
        );
      })}
    </div>
  );
}

function getArcanaTheme(item: ItemCardRendererProps["item"]) {
  const mask =
    (item.unlocked ? 1 : 0) |
    (item.foil ? 2 : 0) |
    (item.seasonal ? 4 : 0) |
    (item.mint ? 8 : 0);
  return ARCANA_THEMES[mask as keyof typeof ARCANA_THEMES];
}

"use client";

import { useId, type CSSProperties } from "react";

import { ArtworkImage } from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function CommemorativeCard({
  item,
}: ItemCardRendererProps) {
  const pathKey = useId().replace(/:/g, "");
  const identityPathId = `commemorative-identity-${pathKey}`;
  const statusPathId = `commemorative-status-${pathKey}`;
  const valuePathId = `commemorative-value-${pathKey}`;
  const innerTopPathId = `commemorative-inner-top-${pathKey}`;
  const conditionPercent = Math.round(item.condition * 100);
  const attributes = [
    ...item.attributes.unlocked.map((attribute) => ({
      ...attribute,
      engravingType: "unlocked",
    })),
    ...item.attributes.locked.map((attribute) => ({
      ...attribute,
      engravingType: "locked",
    })),
    ...item.attributes.special.map((attribute) => ({
      ...attribute,
      engravingType: "special",
    })),
  ];
  const lotteryStars = Array.from(
    { length: Math.max(0, item.lottery) },
    (_, index) => index,
  );

  return (
    <div className="render-card commemorative-card">
      <div className="commemorative-card-face">
        <span
          aria-hidden="true"
          className="commemorative-card-guilloche"
        />
        <svg
          aria-label={`${item.artwork.title}, ${item.artwork.date}, level ${item.level}`}
          className="commemorative-card-inscription"
          viewBox="0 0 320 320"
        >
          <defs>
            <path
              d={coinArcPath(140, -90, 90)}
              id={identityPathId}
            />
            <path
              d={coinArcPath(128, 225, 135, 0)}
              id={statusPathId}
            />
            <path
              d={coinArcPath(150, 270, 90, 0)}
              id={valuePathId}
            />
            <path
              d={coinArcPath(125, -90, 90)}
              id={innerTopPathId}
            />
          </defs>
          <text className="commemorative-card-identity">
            <textPath
              href={`#${identityPathId}`}
              lengthAdjust="spacingAndGlyphs"
              startOffset="50%"
              textAnchor="middle"
              textLength="300"
            >
              <tspan>{item.artwork.title} / </tspan>
              <tspan className="commemorative-card-identity-artist render-card-artist">
                {item.artwork.artist}
              </tspan>
            </textPath>
          </text>
          <text className="commemorative-card-rarity card-rarity-label">
            <textPath
              href={`#${innerTopPathId}`}
              lengthAdjust="spacingAndGlyphs"
              startOffset="50%"
              textAnchor="middle"
              textLength="82"
            >
              {item.artwork.rarity}
            </textPath>
          </text>
          <text className="commemorative-card-status">
            <textPath
              href={`#${statusPathId}`}
              lengthAdjust="spacingAndGlyphs"
              startOffset="50%"
              textAnchor="middle"
              textLength="150"
            >
            </textPath>
          </text>
          <text className="commemorative-card-value">
            <textPath
              href={`#${valuePathId}`}
              startOffset="50%"
              textAnchor="middle"
            >
              {item.artwork.date} |{" "}
              {item.mint ? (
                <tspan
                  aria-label="Mint condition"
                  className="fa commemorative-card-value-mint-icon"
                >
                  {"\uf06c"}
                </tspan>
              ) : (
                `MS-${conditionPercent}`
              )}{" "}
              |{" "}
              {item.values.actual.toLocaleString()} DOLLARS
            </textPath>
          </text>
        </svg>

        <div className="commemorative-card-artwork-frame">
          <ArtworkImage
            className="commemorative-card-artwork"
            item={item}
          />
          <span
            aria-hidden="true"
            className="commemorative-card-artwork-relief"
          />
        </div>

        <div className="commemorative-card-marks">
          {item.unlocked ? (
            <>
              <i
                aria-hidden="true"
                className="fa fa-unlock-alt commemorative-card-state commemorative-card-unlocked-mark mark-west"
              />
              <i
                aria-label="Unlocked"
                className="fa fa-unlock-alt commemorative-card-state commemorative-card-unlocked-mark mark-east"
                role="img"
              />
            </>
          ) : null}
        </div>

        {attributes.map((attribute, index) => {
          const angle =
            attributes.length === 1
              ? 180
              : 145 + (70 / (attributes.length - 1)) * index;
          return (
            <span
              aria-label={`${attribute.npc_name || attribute.title}, ${Math.round((attribute.value ?? 0) * 100)}%, ${attribute.engravingType}`}
              className={`commemorative-card-attribute attribute-${attribute.engravingType}`}
              key={`${attribute.engravingType}-${attribute._id}-${index}`}
              role="img"
              style={
                {
                  "--commemorative-attribute-angle": `${angle}deg`,
                  "--commemorative-attribute-rotation": `${
                    (angle - 180) * 0.34
                  }deg`,
                } as CSSProperties
              }
            >
              <i
                aria-hidden="true"
                className={`fa ${attribute.icon || "fa-circle"}`}
              />
            </span>
          );
        })}
        {lotteryStars.length > 0 ? (
          <span
            aria-label={`Lottery level ${item.lottery}`}
            className="commemorative-card-lottery"
            role="img"
          >
            {lotteryStars.map((star) => {
              const spread = Math.min(
                140,
                68 + Math.max(0, lotteryStars.length - 2) * 16,
              );
              const angle =
                lotteryStars.length === 1
                  ? 0
                  : -spread / 2 +
                    (spread / (lotteryStars.length - 1)) * star;
              return (
                <i
                  aria-hidden="true"
                  className="fa fa-star"
                  key={star}
                  style={
                    {
                      "--commemorative-lottery-angle": `${angle}deg`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="commemorative-card-proof-shine"
        />
        <span
          aria-hidden="true"
          className="commemorative-card-sparkles"
        />
      </div>
    </div>
  );
}

const COIN_CENTER = 160;

function coinArcPath(
  radius: number,
  startAngle: number,
  endAngle: number,
  sweep: 0 | 1 = 1,
): string {
  const start = coinPoint(radius, startAngle);
  const end = coinPoint(radius, endAngle);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${sweep} ${end.x} ${end.y}`;
}

function coinPoint(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: roundCoordinate(COIN_CENTER + radius * Math.sin(radians)),
    y: roundCoordinate(COIN_CENTER - radius * Math.cos(radians)),
  };
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

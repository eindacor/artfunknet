"use client";

import { FormEvent, type ReactNode, useState } from "react";

import {
  CARD_COSMETICS,
  DROPPABLE_CARD_RENDERER_IDS,
  type DroppableCardRendererId,
} from "@/components/item-cards/catalog";
import type {
  GameplayConfig,
  GameplayConfigName,
  GameplaySettings,
} from "@/server/game-settings";

const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;
const CARD_STYLE_NAMES = new Map(
  CARD_COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic.name]),
);

export default function GameplaySettingsForm({
  initialSettings,
}: {
  initialSettings: GameplaySettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [selectedConfig, setSelectedConfig] =
    useState<GameplayConfigName>("actual");
  const [savedActual, setSavedActual] = useState(
    JSON.stringify(initialSettings.actual),
  );
  const [rarityJson, setRarityJson] = useState({
    actual: JSON.stringify(initialSettings.actual.rarityWeights, null, 2),
    debug: JSON.stringify(initialSettings.debug.rarityWeights, null, 2),
  });
  const [cardStyleJson, setCardStyleJson] = useState({
    actual: JSON.stringify(initialSettings.actual.cardStyleWeights, null, 2),
    debug: JSON.stringify(initialSettings.debug.cardStyleWeights, null, 2),
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeEditor = settings[selectedConfig];
  const rarityResult = parseRarityWeights(rarityJson[selectedConfig]);
  const cardStyleResult = parseCardStyleWeights(
    cardStyleJson[selectedConfig],
  );

  function updateConfig(
    name: GameplayConfigName,
    update: (config: GameplayConfig) => GameplayConfig,
  ) {
    setSettings((current) => ({ ...current, [name]: update(current[name]) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const actualRarity = parseRarityWeights(rarityJson.actual);
    const debugRarity = parseRarityWeights(rarityJson.debug);
    const actualCardStyles = parseCardStyleWeights(cardStyleJson.actual);
    const debugCardStyles = parseCardStyleWeights(cardStyleJson.debug);
    if (!actualRarity.ok) {
      setSelectedConfig("actual");
      setError(`Actual configuration: ${actualRarity.error}`);
      return;
    }
    if (!debugRarity.ok) {
      setSelectedConfig("debug");
      setError(`Debug configuration: ${debugRarity.error}`);
      return;
    }
    if (!actualCardStyles.ok) {
      setSelectedConfig("actual");
      setError(`Actual configuration: ${actualCardStyles.error}`);
      return;
    }
    if (!debugCardStyles.ok) {
      setSelectedConfig("debug");
      setError(`Debug configuration: ${debugCardStyles.error}`);
      return;
    }

    const nextActual = {
      ...settings.actual,
      rarityWeights: actualRarity.weights,
      cardStyleWeights: actualCardStyles.weights,
    };
    const nextDebug = {
      ...settings.debug,
      rarityWeights: debugRarity.weights,
      cardStyleWeights: debugCardStyles.weights,
    };
    if (
      JSON.stringify(nextActual) !== savedActual &&
      !window.confirm(
        "Are you sure you want to change the Actual gameplay configuration? These values control normal gameplay.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/gameplay-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          debugEnabled: settings.debugEnabled,
          actual: nextActual,
          debug: nextDebug,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        settings?: GameplaySettings;
      };
      if (!response.ok || !body.settings) {
        throw new Error(body.error ?? "Gameplay settings could not be saved.");
      }
      setSettings(body.settings);
      setSavedActual(JSON.stringify(body.settings.actual));
      setRarityJson({
        actual: JSON.stringify(body.settings.actual.rarityWeights, null, 2),
        debug: JSON.stringify(body.settings.debug.rarityWeights, null, 2),
      });
      setCardStyleJson({
        actual: JSON.stringify(
          body.settings.actual.cardStyleWeights,
          null,
          2,
        ),
        debug: JSON.stringify(
          body.settings.debug.cardStyleWeights,
          null,
          2,
        ),
      });
      setMessage(
        `Gameplay settings saved. ${body.settings.activeConfigName} configuration is active.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Gameplay settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-settings-form" onSubmit={submit}>
      <div className="admin-config-header">
        <div className="admin-config-tabs" role="tablist">
          {(["actual", "debug"] as const).map((name) => (
            <button
              aria-selected={selectedConfig === name}
              className={selectedConfig === name ? "current" : ""}
              key={name}
              onClick={() => setSelectedConfig(name)}
              role="tab"
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
        <label className="admin-debug-toggle">
          <input
            checked={settings.debugEnabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                debugEnabled: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>
            <strong>Enable debug configuration</strong>
            <small>
              All gameplay systems use the Debug tab after settings are saved.
            </small>
          </span>
        </label>
      </div>

      <p className="admin-config-status">
        Editing <strong>{selectedConfig}</strong>. Active after saving:{" "}
        <strong>{settings.debugEnabled ? "debug" : "actual"}</strong>.
      </p>

      <ConfigGroup title="Daily drops">
      <SettingField
        description="Minutes between uses of the daily drop button."
        label="Daily drop cooldown"
        max={10080}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            dailyDropCooldownMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.dailyDropCooldownMinutes}
      />
      <SettingField
        description="Number of unclaimed items generated by each daily drop."
        label="Daily drop item count"
        max={100}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            dailyDropCount: value,
          }))
        }
        suffix="items"
        value={activeEditor.dailyDropCount}
      />
      </ConfigGroup>

      <ConfigGroup title="Crate pricing">
      <SettingField
        description="Multiplies a crate's estimated total sell-all value to determine its purchase price."
        label="Crate value scalar"
        max={10000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            crateValueScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.crateValueScalar}
      />
      </ConfigGroup>

      <ConfigGroup title="Standard crate">
      <SettingField
        description="Additional price multiplier applied to the Standard crate after expected-value pricing."
        label="Cost scalar"
        max={1000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            standardCrateCostScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.standardCrateCostScalar}
      />
      </ConfigGroup>

      <ConfigGroup title="Foil crate">
      <SettingField
        description="Additional price multiplier applied to the Foil crate after expected-value pricing."
        label="Cost scalar"
        max={1000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            foilCrateCostScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.foilCrateCostScalar}
      />
      <SettingField
        description="Multiplies the normal foil chance for the Foil crate."
        label="Foil chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            foilCrateChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.foilCrateChanceScalar}
      />
      </ConfigGroup>

      <ConfigGroup title="Unlocked crate">
      <SettingField
        description="Additional price multiplier applied to the Unlocked crate after expected-value pricing."
        label="Cost scalar"
        max={1000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            unlockedCrateCostScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.unlockedCrateCostScalar}
      />
      <SettingField
        description="Multiplies the normal unlocked chance for the Unlocked crate."
        label="Unlocked chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            unlockedCrateChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.unlockedCrateChanceScalar}
      />
      </ConfigGroup>

      <ConfigGroup title="Designer crate">
      <SettingField
        description="Additional price multiplier applied to the Designer crate after expected-value pricing."
        label="Cost scalar"
        max={1000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            designerCrateCostScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.designerCrateCostScalar}
      />
      <SettingField
        description="Multiplies the normal alternate card style chance for the Designer crate."
        label="Art style chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            artStyleCrateChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.artStyleCrateChanceScalar}
      />
      </ConfigGroup>

      <ConfigGroup title="Ultimate crate">
      <SettingField
        description="Additional price multiplier applied to the Ultimate crate after expected-value pricing."
        label="Cost scalar"
        max={1000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            ultimateCrateCostScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.ultimateCrateCostScalar}
      />
      <SettingField
        description="Multiplies the normal foil chance for the Ultimate crate."
        label="Foil chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            ultimateFoilChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.ultimateFoilChanceScalar}
      />
      <SettingField
        description="Multiplies the normal unlocked chance for the Ultimate crate."
        label="Unlocked chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            ultimateUnlockedChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.ultimateUnlockedChanceScalar}
      />
      <SettingField
        description="Multiplies the normal Mint chance for the Ultimate crate."
        label="Mint chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            ultimateMintChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.ultimateMintChanceScalar}
      />
      <SettingField
        description="Weights seasonal artworks more heavily when the Ultimate crate selects artwork within a rarity."
        label="Seasonal chance scalar"
        max={1000}
        min={0.01}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            ultimateSeasonalChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.ultimateSeasonalChanceScalar}
      />
      <SettingField
        description="Multiplies the normal alternate card style chance for the Ultimate crate."
        label="Art style chance scalar"
        max={1000}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            ultimateArtStyleChanceScalar: value,
          }))
        }
        step={0.01}
        suffix="×"
        value={activeEditor.ultimateArtStyleChanceScalar}
      />
      </ConfigGroup>

      <ConfigGroup title="Generated item properties">
      <SettingField
        description="Chance that a generated item starts with a randomly selected active card style."
        label="Card style probability"
        max={100}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            cardRendererProbability: value / 100,
          }))
        }
        step={0.01}
        suffix="%"
        value={activeEditor.cardRendererProbability * 100}
      />
      <SettingField
        description="Chance that each generated item is foil. The original game used 0.5%."
        label="Foil probability"
        max={100}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            foilProbability: value / 100,
          }))
        }
        step={0.01}
        suffix="%"
        value={activeEditor.foilProbability * 100}
      />
      <SettingField
        description="Chance that a non-common generated item has unlocked attributes. The original game used 5%."
        label="Unlocked probability"
        max={100}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            unlockedProbability: value / 100,
          }))
        }
        step={0.01}
        suffix="%"
        value={activeEditor.unlockedProbability * 100}
      />
      <SettingField
        description="Chance that a generated item starts Mint at perfect condition. Mint is permanently consumed the first time the item is displayed."
        label="Mint probability"
        max={100}
        min={0}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            mintProbability: value / 100,
          }))
        }
        step={0.01}
        suffix="%"
        value={activeEditor.mintProbability * 100}
      />
      <SettingField
        description="Value multiplier captured by newly generated Mint items until they are first displayed."
        label="Mint value multiplier"
        max={1000}
        min={1}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            mintValueMultiplier: value,
          }))
        }
        step={0.1}
        suffix="×"
        value={activeEditor.mintValueMultiplier}
      />
      </ConfigGroup>

      <ConfigGroup title="Auctions">
      <SettingField
        description="Minimum remaining auction time after a bid is placed to prevent last-minute bid sniping."
        label="Anti-snipe extension time"
        max={1440}
        min={1}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            auctionAntiSnipeExtensionMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.auctionAntiSnipeExtensionMinutes}
      />
      </ConfigGroup>

      <ConfigGroup title="Gallery and item condition">
      <SettingField
        description="How often displayed artwork settles prorated money and XP."
        label="Gallery money/XP payout interval"
        max={1440}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            galleryPayoutIntervalMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.galleryPayoutIntervalMinutes}
      />
      <SettingField
        description="Time a displayed work must remain up to gain one display level."
        label="Display level interval"
        max={10080}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            displayLevelIntervalMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.displayLevelIntervalMinutes}
      />
      <SettingField
        description="Maximum display-level earnings multiplier progression."
        label="Display level cap"
        max={1000}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            displayLevelCap: value,
          }))
        }
        suffix="levels"
        value={activeEditor.displayLevelCap}
      />
      <SettingField
        description="Equivalent interval for each 20% displayed-art condition decay roll."
        label="Condition decay interval"
        max={10080}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            conditionDecayIntervalMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.conditionDecayIntervalMinutes}
      />
      <SettingField
        description="How long an item must remain in repair status before each condition increase."
        label="Item repair interval"
        max={10080}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            repairIntervalMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.repairIntervalMinutes}
      />
      <SettingField
        description="Condition restored after each completed repair interval."
        label="Item repair amount"
        max={100}
        min={1}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            repairAmount: value / 100,
          }))
        }
        step={0.1}
        suffix="%"
        value={activeEditor.repairAmount * 100}
      />
      </ConfigGroup>

      <ConfigGroup title="Gallery visitors">
      <SettingField
        description="Length of each NPC generation cycle and visitor lifetime."
        label="NPC spawn interval"
        max={10080}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            npcSpawnIntervalMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.npcSpawnIntervalMinutes}
      />
      <SettingField
        description="How long visitor meeting counts remain available before resetting."
        label="Visitor meeting reset interval"
        max={10080}
        onChange={(value) =>
          updateConfig(selectedConfig, (config) => ({
            ...config,
            npcMeetingResetIntervalMinutes: value,
          }))
        }
        suffix="minutes"
        value={activeEditor.npcMeetingResetIntervalMinutes}
      />
      {(["bronze", "silver", "gold", "platinum"] as const).map((quality) => (
        <SettingField
          description={`Maximum ${quality} visitors a player can meet per reset window.`}
          key={quality}
          label={`${quality[0].toUpperCase()}${quality.slice(1)} visitor limit`}
          max={10000}
          onChange={(value) =>
            updateConfig(selectedConfig, (config) => ({
              ...config,
              npcMeetingLimits: {
                ...config.npcMeetingLimits,
                [quality]: value,
              },
            }))
          }
          suffix="meetings"
          value={activeEditor.npcMeetingLimits[quality]}
        />
      ))}
      </ConfigGroup>

      <ConfigGroup title="Drop distributions">
      <section className="admin-rarity-settings">
        <label
          className="admin-rarity-editor"
          title="This is the maximum-level base map. Player-level unlocks and scaling produce the final drop rates. Weights do not need to total 100."
        >
          <strong>
            Rarity weights (JSON) <span className="admin-config-help">?</span>
          </strong>
          <textarea
            aria-invalid={!rarityResult.ok}
            onChange={(event) =>
              setRarityJson((current) => ({
                ...current,
                [selectedConfig]: event.target.value,
              }))
            }
            rows={9}
            spellCheck={false}
            value={rarityJson[selectedConfig]}
          />
        </label>
        {rarityResult.ok ? (
          <div className="admin-rarity-preview">
            {RARITIES.map((rarity) => (
              <span key={rarity}>
                <strong className={`rarity-text ${rarity}`}>
                  {rarity}
                </strong>{" "}
                {formatPercentage(
                  rarityResult.weights[rarity] / rarityResult.total,
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="admin-error">{rarityResult.error}</p>
        )}
      </section>

      <section className="admin-rarity-settings">
        <label
          className="admin-rarity-editor"
          title="When the card style probability succeeds, these weights choose the style found on the item. Inactive styles are ignored. Weights do not need to total 100."
        >
          <strong>
            Art style weights (JSON){" "}
            <span className="admin-config-help">?</span>
          </strong>
          <textarea
            aria-invalid={!cardStyleResult.ok}
            onChange={(event) =>
              setCardStyleJson((current) => ({
                ...current,
                [selectedConfig]: event.target.value,
              }))
            }
            rows={20}
            spellCheck={false}
            value={cardStyleJson[selectedConfig]}
          />
        </label>
        {cardStyleResult.ok ? (
          <div className="admin-rarity-preview">
            {DROPPABLE_CARD_RENDERER_IDS.map((rendererId) => (
              <span key={rendererId}>
                <strong>{CARD_STYLE_NAMES.get(rendererId) ?? rendererId}</strong>{" "}
                {formatPercentage(
                  cardStyleResult.weights[rendererId] /
                    cardStyleResult.total,
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="admin-error">{cardStyleResult.error}</p>
        )}
      </section>
      </ConfigGroup>

      <button disabled={busy} type="submit">
        {busy ? "saving..." : "save both configurations"}
      </button>
      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </form>
  );
}

function parseRarityWeights(
  json: string,
):
  | {
      ok: true;
      weights: GameplayConfig["rarityWeights"];
      total: number;
    }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Rarity weights must be valid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Rarity weights must be a JSON object." };
  }

  const record = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !RARITIES.includes(key as (typeof RARITIES)[number]),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown rarity keys: ${unknownKeys.join(", ")}.`,
    };
  }

  const weights = {} as GameplayConfig["rarityWeights"];
  let total = 0;
  for (const rarity of RARITIES) {
    if (typeof record[rarity] !== "number") {
      return { ok: false, error: `The ${rarity} weight must be a number.` };
    }
    const weight = record[rarity];
    if (!Number.isFinite(weight) || weight < 0 || weight > 1_000_000_000) {
      return {
        ok: false,
        error: `The ${rarity} weight must be from 0 to 1,000,000,000.`,
      };
    }
    weights[rarity] = weight;
    total += weight;
  }

  if (total <= 0) {
    return {
      ok: false,
      error: "At least one rarity weight must be greater than zero.",
    };
  }

  return { ok: true, weights, total };
}

function parseCardStyleWeights(
  json: string,
):
  | {
      ok: true;
      weights: GameplayConfig["cardStyleWeights"];
      total: number;
    }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Art style weights must be valid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Art style weights must be a JSON object." };
  }

  const record = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) =>
      !DROPPABLE_CARD_RENDERER_IDS.includes(
        key as DroppableCardRendererId,
      ),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown art style keys: ${unknownKeys.join(", ")}.`,
    };
  }

  const weights = {} as GameplayConfig["cardStyleWeights"];
  let total = 0;
  for (const rendererId of DROPPABLE_CARD_RENDERER_IDS) {
    const weight = record[rendererId];
    if (
      typeof weight !== "number" ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 1_000_000_000
    ) {
      return {
        ok: false,
        error: `The ${rendererId} weight must be from 0 to 1,000,000,000.`,
      };
    }
    weights[rendererId] = weight;
    total += weight;
  }

  if (total <= 0) {
    return {
      ok: false,
      error: "At least one art style weight must be greater than zero.",
    };
  }

  return { ok: true, weights, total };
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: value > 0 && value < 0.001 ? 3 : 1,
    maximumFractionDigits: value > 0 && value < 0.001 ? 4 : 1,
  }).format(value);
}

function SettingField({
  label,
  description,
  value,
  max,
  min = 1,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  max: number;
  min?: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="admin-setting" title={description}>
      <span className="admin-setting-label">
        <strong>{label}</strong>
        <span aria-hidden="true" className="admin-config-help">
          ?
        </span>
      </span>
      <span className="admin-setting-input">
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          required
          step={step}
          type="number"
          value={value}
        />
        {suffix}
      </span>
    </label>
  );
}

function ConfigGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-config-group">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

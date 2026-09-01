"use client";

import { FormEvent, useState } from "react";

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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeEditor = settings[selectedConfig];
  const rarityResult = parseRarityWeights(rarityJson[selectedConfig]);

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

    const nextActual = {
      ...settings.actual,
      rarityWeights: actualRarity.weights,
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
          debug: { ...settings.debug, rarityWeights: debugRarity.weights },
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

      <section className="admin-rarity-settings">
        <label className="admin-rarity-editor">
          <strong>Rarity weights (JSON)</strong>
          <small>
            This is the maximum-level base map. Player-level unlocks and
            scaling produce the final drop rates. Weights do not need to total
            100.
          </small>
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
                <strong>{rarity}</strong>{" "}
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
    <label className="admin-setting">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
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

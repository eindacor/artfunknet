"use client";

import { FormEvent, useState } from "react";

import type {
  GameplayConfigName,
  XpRewardScalars,
} from "@/server/game-settings";
import { XP_REWARD_DEFINITIONS } from "@/server/game-settings";

const XP_REWARDS = Object.entries(XP_REWARD_DEFINITIONS).map(
  ([key, definition]) => ({
    key: key as keyof XpRewardScalars,
    ...definition,
  }),
);

export default function XpBalanceForm({
  activeConfigName,
  initialActual,
  initialDebug,
}: {
  activeConfigName: GameplayConfigName;
  initialActual: XpRewardScalars;
  initialDebug: XpRewardScalars;
}) {
  const [selectedConfig, setSelectedConfig] =
    useState<GameplayConfigName>("actual");
  const [values, setValues] = useState({
    actual: initialActual,
    debug: initialDebug,
  });
  const [savedActual, setSavedActual] = useState(
    JSON.stringify(initialActual),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeValues = values[selectedConfig];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (
      JSON.stringify(values.actual) !== savedActual &&
      !window.confirm(
        "Are you sure you want to change the Actual XP balance? These values affect normal gameplay.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/xp-balance", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as {
        error?: string;
        actual?: XpRewardScalars;
        debug?: XpRewardScalars;
      };
      if (!response.ok || !body.actual || !body.debug) {
        throw new Error(body.error ?? "XP balance could not be saved.");
      }
      setValues({ actual: body.actual, debug: body.debug });
      setSavedActual(JSON.stringify(body.actual));
      setMessage("XP balance saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "XP balance could not be saved.",
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
        <p className="admin-config-status">
          Active configuration: <strong>{activeConfigName}</strong>
        </p>
      </div>

      <section className="admin-config-group">
        <h2>XP reward scalars</h2>
        <div>
          {XP_REWARDS.map((reward) => (
            <label
              className="admin-setting"
              key={reward.key}
              title={reward.description}
            >
              <span className="admin-setting-label">
                <strong>{reward.label}</strong>
                <span aria-hidden="true" className="admin-config-help">
                  ?
                </span>
              </span>
              <span className="admin-setting-input">
                <input
                  max={100}
                  min={0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setValues((current) => ({
                      ...current,
                      [selectedConfig]: {
                        ...current[selectedConfig],
                        [reward.key]: value,
                      },
                    }));
                  }}
                  required
                  step={0.01}
                  type="number"
                  value={activeValues[reward.key]}
                />
                ×
              </span>
            </label>
          ))}
        </div>
      </section>

      <button className="admin-save-button" disabled={busy} type="submit">
        {busy ? "Saving..." : "Save XP balance"}
      </button>
      {message ? <p className="admin-form-message">{message}</p> : null}
      {error ? <p className="admin-form-error">{error}</p> : null}
    </form>
  );
}

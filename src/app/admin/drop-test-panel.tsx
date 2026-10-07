"use client";

import { useState } from "react";

import type {
  DropTestResult,
  DropTestSource,
} from "@/server/drop-test";
import type { NpcQuality } from "@/server/npc-gameplay";

const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;
const VISITOR_SOURCES = ["donor", "dealer", "auctioneer"] as const;
const VISITOR_QUALITIES = [
  "bronze",
  "silver",
  "gold",
  "platinum",
] as const;
const SOURCE_LABELS: Record<DropTestSource, string> = {
  standard: "Standard crate",
  donor: "Donor",
  dealer: "Dealer",
  auctioneer: "Auctioneer",
};

export default function DropTestPanel() {
  const [playerLevel, setPlayerLevel] = useState(50);
  const [qualities, setQualities] = useState<
    Record<(typeof VISITOR_SOURCES)[number], NpcQuality>
  >({
    donor: "bronze",
    dealer: "bronze",
    auctioneer: "bronze",
  });
  const [busySource, setBusySource] = useState<DropTestSource | null>(null);
  const [result, setResult] = useState<DropTestResult | null>(null);
  const [error, setError] = useState("");

  async function runDropTest(source: DropTestSource) {
    setBusySource(source);
    setError("");
    try {
      const response = await fetch("/api/admin/drop-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerLevel,
          source,
          quality: source === "standard" ? undefined : qualities[source],
        }),
      });
      const body = (await response.json()) as DropTestResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The drop test could not be completed.");
      }
      setResult(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The drop test could not be completed.",
      );
    } finally {
      setBusySource(null);
    }
  }

  return (
    <div className="admin-drop-test">
      <p>
        Runs 100,000 rarity selections against the saved active gameplay
        configuration. No items are created and no metrics are recorded.
      </p>
      <label className="admin-drop-test-level">
        <strong>Player level</strong>
        <input
          max={50}
          min={0}
          onChange={(event) => setPlayerLevel(Number(event.target.value))}
          step={1}
          type="number"
          value={playerLevel}
        />
      </label>
      <div className="admin-drop-test-sources">
        <div className="admin-drop-test-source">
          <button
            disabled={busySource !== null}
            onClick={() => runDropTest("standard")}
            type="button"
          >
            {busySource === "standard" ? "Running..." : "Standard crate"}
          </button>
        </div>
        {VISITOR_SOURCES.map((source) => (
          <div className="admin-drop-test-source" key={source}>
            <button
              disabled={busySource !== null}
              onClick={() => runDropTest(source)}
              type="button"
            >
              {busySource === source
                ? "Running..."
                : SOURCE_LABELS[source]}
            </button>
            <label>
              <span className="sr-only">
                {SOURCE_LABELS[source]} quality
              </span>
              <select
                disabled={busySource !== null}
                onChange={(event) =>
                  setQualities((current) => ({
                    ...current,
                    [source]: event.target.value as NpcQuality,
                  }))
                }
                value={qualities[source]}
              >
                {VISITOR_QUALITIES.map((quality) => (
                  <option key={quality} value={quality}>
                    {quality}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {result ? (
        <section className="admin-drop-test-results">
          <h3>
            {SOURCE_LABELS[result.source]}
            {result.quality ? ` (${result.quality})` : ""} at level{" "}
            {result.playerLevel}
          </h3>
          <div className="admin-drop-test-result-grid">
            {RARITIES.map((rarity) => (
              <div key={rarity}>
                <strong className={`rarity-text ${rarity}`}>
                  {rarity}
                </strong>
                <span>{result.counts[rarity].toLocaleString()}</span>
                <small>
                  {formatPercentage(result.counts[rarity] / result.rolls)}
                </small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

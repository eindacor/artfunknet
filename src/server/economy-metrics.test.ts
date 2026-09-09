import assert from "node:assert/strict";
import test from "node:test";

import {
  getEconomyMetricRows,
  recordEconomyMetrics,
} from "./economy-metrics.ts";

test("economy metrics aggregate events into lifetime and hourly documents", async () => {
  const writes: unknown[] = [];
  const database = {
    collection() {
      return {
        async bulkWrite(operations: unknown[]) {
          writes.push(...operations);
        },
      };
    },
  };

  await recordEconomyMetrics(
    database as never,
    [
      {
        amount: 100,
        currency: "money",
        direction: "earned",
        source: "item-sale",
      },
      {
        amount: 50,
        currency: "money",
        direction: "earned",
        source: "item-sale",
      },
      {
        amount: 25,
        currency: "xp",
        direction: "earned",
        source: "quest",
      },
      {
        amount: 240,
        count: 6,
        currency: "items",
        direction: "acquired",
        source: "item-claim",
      },
    ],
    new Date("2026-09-09T14:32:00.000Z"),
  );

  assert.equal(writes.length, 2);
  const totals = writes[0] as {
    updateOne: { update: { $inc: Record<string, number> } };
  };
  assert.equal(
    totals.updateOne.update.$inc[
      "metrics.money.earned.item-sale.amount"
    ],
    150,
  );
  assert.equal(
    totals.updateOne.update.$inc[
      "metrics.money.earned.item-sale.count"
    ],
    2,
  );
  assert.equal(
    totals.updateOne.update.$inc[
      "metrics.items.acquired.item-claim.count"
    ],
    6,
  );
});

test("economy metrics derive average item value and recent hourly rate", async () => {
  const totals = {
    _id: "economy-metrics:totals",
    kind: "economy_metrics_totals",
    updated_at: "2026-09-09T15:00:00.000Z",
    metrics: {
      items: {
        acquired: {
          "item-claim": { amount: 240, count: 6 },
        },
      },
    },
  };
  const hourly = {
    _id: "economy-metrics:hour:2026-09-09T14:00:00.000Z",
    kind: "economy_metrics_hour",
    hour_start: "2026-09-09T14:00:00.000Z",
    updated_at: "2026-09-09T15:00:00.000Z",
    metrics: totals.metrics,
  };
  const database = {
    collection() {
      return {
        async findOne() {
          return totals;
        },
        find() {
          return {
            async toArray() {
              return [hourly];
            },
          };
        },
      };
    },
  };

  const rows = await getEconomyMetricRows(
    database as never,
    new Date("2026-09-09T15:00:00.000Z"),
  );

  assert.equal(rows[0]?.averageAmount, 40);
  assert.equal(rows[0]?.recentCount, 6);
  assert.equal(rows[0]?.transactionsPerHour, 0.25);
});

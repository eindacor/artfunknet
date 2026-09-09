import type { Db } from "mongodb";

export type EconomyMetricCurrency = "items" | "money" | "xp";
export type EconomyMetricDirection = "acquired" | "earned" | "spent";

export type EconomyMetricEvent = {
  amount: number;
  count?: number;
  currency: EconomyMetricCurrency;
  direction: EconomyMetricDirection;
  source: string;
};

type MetricCounter = {
  amount: number;
  count: number;
};

type EconomyMetricsDocument = {
  _id: string;
  kind: "economy_metrics_totals" | "economy_metrics_hour";
  first_recorded_at?: string;
  hour_start?: string;
  updated_at: string;
  metrics?: Partial<
    Record<
      EconomyMetricCurrency,
      Partial<
        Record<
          EconomyMetricDirection,
          Record<string, MetricCounter>
        >
      >
    >
  >;
};

export type EconomyMetricRow = EconomyMetricEvent & {
  averageAmount: number;
  count: number;
  recentAmount: number;
  recentCount: number;
  transactionsPerHour: number;
};

const TOTALS_DOCUMENT_ID = "economy-metrics:totals";
const SOURCE_PATTERN = /^[a-z0-9_-]+$/;

export async function recordEconomyMetrics(
  database: Db,
  events: EconomyMetricEvent | EconomyMetricEvent[],
  now = new Date(),
): Promise<void> {
  const aggregated = aggregateEvents(Array.isArray(events) ? events : [events]);
  if (aggregated.length === 0) return;

  const timestamp = now.toISOString();
  const hourStart = `${timestamp.slice(0, 13)}:00:00.000Z`;
  const increments = Object.fromEntries(
    aggregated.flatMap((event) => {
      const path = `metrics.${event.currency}.${event.direction}.${event.source}`;
      return [
        [`${path}.amount`, event.amount],
        [`${path}.count`, event.count],
      ];
    }),
  );
  const metadata = database.collection<EconomyMetricsDocument>("metadata");
  await metadata.bulkWrite([
    {
      updateOne: {
        filter: { _id: TOTALS_DOCUMENT_ID },
        update: {
          $setOnInsert: {
            kind: "economy_metrics_totals",
            first_recorded_at: timestamp,
          },
          $set: { updated_at: timestamp },
          $inc: increments,
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: `economy-metrics:hour:${hourStart}` },
        update: {
          $setOnInsert: {
            kind: "economy_metrics_hour",
            hour_start: hourStart,
          },
          $set: { updated_at: timestamp },
          $inc: increments,
        },
        upsert: true,
      },
    },
  ]);
}

export async function recordEconomyMetricsSafely(
  database: Db,
  events: EconomyMetricEvent | EconomyMetricEvent[],
  now = new Date(),
): Promise<void> {
  try {
    await recordEconomyMetrics(database, events, now);
  } catch (error) {
    console.error("Unable to record economy metrics", error);
  }
}

export async function getEconomyMetricRows(
  database: Db,
  now = new Date(),
  recentHours = 24,
): Promise<EconomyMetricRow[]> {
  const currentHourStart = new Date(
    `${now.toISOString().slice(0, 13)}:00:00.000Z`,
  );
  const cutoff = new Date(
    currentHourStart.getTime() -
      (Math.max(1, recentHours) - 1) * 60 * 60 * 1000,
  ).toISOString();
  const metadata = database.collection<EconomyMetricsDocument>("metadata");
  const [totals, recent] = await Promise.all([
    metadata.findOne({ _id: TOTALS_DOCUMENT_ID }),
    metadata
      .find({
        kind: "economy_metrics_hour",
        hour_start: { $gte: cutoff },
      })
      .toArray(),
  ]);
  const recentCounters = mergeMetricDocuments(recent);

  return flattenMetrics(totals?.metrics).map((metric) => {
    const key = getMetricKey(metric);
    const recentMetric = recentCounters.get(key);
    return {
      ...metric,
      averageAmount:
        metric.count > 0 ? metric.amount / metric.count : 0,
      recentAmount: recentMetric?.amount ?? 0,
      recentCount: recentMetric?.count ?? 0,
      transactionsPerHour:
        (recentMetric?.count ?? 0) / Math.max(1, recentHours),
    };
  });
}

function aggregateEvents(events: EconomyMetricEvent[]) {
  const counters = new Map<
    string,
    EconomyMetricEvent & { count: number }
  >();
  for (const event of events) {
    if (
      !Number.isFinite(event.amount) ||
      event.amount <= 0 ||
      !SOURCE_PATTERN.test(event.source)
    ) {
      continue;
    }
    const amount = event.amount;
    if (amount <= 0) continue;
    const count = Math.max(1, Math.floor(event.count ?? 1));
    const key = getMetricKey(event);
    const current = counters.get(key);
    if (current) {
      current.amount += amount;
      current.count += count;
    } else {
      counters.set(key, { ...event, amount, count });
    }
  }
  return [...counters.values()];
}

function flattenMetrics(
  metrics: EconomyMetricsDocument["metrics"],
): Array<EconomyMetricEvent & { count: number }> {
  const rows: Array<EconomyMetricEvent & { count: number }> = [];
  for (const currency of ["items", "money", "xp"] as const) {
    for (const direction of ["acquired", "earned", "spent"] as const) {
      const sources = metrics?.[currency]?.[direction] ?? {};
      for (const [source, counter] of Object.entries(sources)) {
        rows.push({
          amount: counter.amount,
          count: counter.count,
          currency,
          direction,
          source,
        });
      }
    }
  }
  return rows.sort(
    (left, right) =>
      left.currency.localeCompare(right.currency) ||
      left.direction.localeCompare(right.direction) ||
      right.amount - left.amount,
  );
}

function mergeMetricDocuments(
  documents: EconomyMetricsDocument[],
): Map<string, MetricCounter> {
  const merged = new Map<string, MetricCounter>();
  for (const metric of documents.flatMap((document) =>
    flattenMetrics(document.metrics),
  )) {
    const key = getMetricKey(metric);
    const current = merged.get(key) ?? { amount: 0, count: 0 };
    current.amount += metric.amount;
    current.count += metric.count;
    merged.set(key, current);
  }
  return merged;
}

function getMetricKey(
  metric: Pick<EconomyMetricEvent, "currency" | "direction" | "source">,
): string {
  return `${metric.currency}:${metric.direction}:${metric.source}`;
}

import { getEconomyMetricRows } from "@/server/economy-metrics";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  "archive-purchase": "Archive purchase",
  "art-collector": "Art Collector",
  "art-collector-xp-conversion": "Collector XP conversion",
  "art-expert-xp": "Art Expert XP",
  "art-expert-xp-conversion": "Art Expert XP conversion",
  "auction-bid": "Auction bid",
  "auction-refund": "Auction refund",
  "auction-sale": "Auction sale",
  "auction-xp": "Auction XP",
  authentication: "Authentication",
  "benefactor-reward": "Benefactor reward",
  "bulk-item-sale": "Sell All",
  "crate-purchase": "Crate purchase",
  "dealer-purchase": "Art Dealer purchase",
  "enthusiast-reward": "Art Enthusiast reward",
  "forgery-liability": "Forgery liability",
  "forgery-display": "Undetected forgery display",
  "forgery-offload": "Forgery offload",
  "forgery-reward": "Forgery reward",
  "forgery-report": "Forgery report",
  forge: "Forgery creation",
  "gallery-payout": "Gallery payout",
  "item-sale": "Item sale",
  "item-claim": "Item claim",
  "item-archive-purchase": "Item purchased for archive",
  "item-purchase": "Item purchase",
  "auction-win": "Auction win",
  "quest-reward": "Quest reward",
  reroll: "Item reroll",
};

export default async function EconomyMetricsPage() {
  const rows = await getEconomyMetricRows(await getDatabase());

  return (
    <main className="admin-tools">
      <h1>Economy metrics</h1>
      <section>
        <h2>Money, XP, and item acquisition</h2>
        <p>
          Lifetime totals are aggregated by source. Recent rates use the last
          24 hourly metric buckets. XP is measured in level-normalized XP
          chunks. For items, totals and averages are based on actual item value.
        </p>
        {rows.length === 0 ? (
          <p>No economy activity has been recorded yet.</p>
        ) : (
          <div className="admin-metrics-table-wrap">
            <table className="admin-metrics-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Direction</th>
                  <th>Source</th>
                  <th>Count</th>
                  <th>Total</th>
                  <th>Average</th>
                  <th>Transactions/hour</th>
                  <th>Last 24h</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.currency}:${row.direction}:${row.source}`}
                  >
                    <td>{row.currency.toUpperCase()}</td>
                    <td>{row.direction}</td>
                    <td>{SOURCE_LABELS[row.source] ?? row.source}</td>
                    <td>{row.count.toLocaleString()}</td>
                    <td>{formatMetricAmount(row.currency, row.amount)}</td>
                    <td>
                      {formatMetricAmount(row.currency, row.averageAmount)}
                    </td>
                    <td>{row.transactionsPerHour.toFixed(2)}</td>
                    <td>
                      {formatMetricAmount(row.currency, row.recentAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function formatMetricAmount(currency: string, amount: number): string {
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: currency === "xp" ? 3 : 0,
  });
}

const oddsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const percentageFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

export function formatItemDropChance(
  coefficient: number | undefined,
  odds?: string,
): string {
  if (odds === "forged" || odds === "unknown") return odds;
  if (coefficient === undefined) return "Not recorded";
  if (coefficient > 0) {
    return Math.round(1 / coefficient) === 1
      ? percentageFormatter.format(coefficient)
      : `1 in ${oddsFormatter.format(1 / coefficient)}`;
  }
  return "Not currently droppable";
}

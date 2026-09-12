export const PUBLIC_AUCTION_TARGET = 20;
export const PUBLIC_AUCTION_DURATION_MINUTES = 240;

export function getPublicAuctionReplenishmentCount(
  activeAuctionCount: number,
  target = PUBLIC_AUCTION_TARGET,
): number {
  return Math.max(0, target - Math.max(0, activeAuctionCount));
}

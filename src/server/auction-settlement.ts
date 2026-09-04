export type AuctionSettlementDisposition =
  | "player-sale"
  | "unsold"
  | "unresolved-bid";

export function getAuctionSettlementDisposition({
  currentWinnerId,
  currentWinnerName,
  currentBid,
  hasBid,
  startingBid,
}: {
  currentWinnerId: string | null;
  currentWinnerName: string | null;
  currentBid: number;
  hasBid: boolean | undefined;
  startingBid: number;
}): AuctionSettlementDisposition {
  if (currentWinnerId) return "player-sale";
  return hasBid || currentWinnerName || currentBid > startingBid
    ? "unresolved-bid"
    : "unsold";
}

import type { Auction } from "./auction-gameplay.ts";

export function getAuctionBidRestriction(
  auction: Pick<Auction, "seller_id" | "commission">,
  playerId: string,
): string | null {
  if (auction.seller_id === playerId) return "You are the seller.";
  if (auction.commission?.player_id === playerId) {
    return "You cannot bid on an auction that pays you a commission.";
  }
  return null;
}

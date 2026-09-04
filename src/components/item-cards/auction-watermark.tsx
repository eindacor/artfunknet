import type { GameItem } from "@/server/gameplay";

export default function AuctionWatermark({
  status,
}: {
  status: GameItem["status"];
}) {
  if (status !== "auctioned") return null;

  return (
    <span aria-label="Currently up for auction" className="auction-watermark">
      <i aria-hidden="true" className="fa fa-gavel" />
    </span>
  );
}

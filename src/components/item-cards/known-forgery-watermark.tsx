import type { GameItem } from "@/server/gameplay";
import type { CardRendererId } from "./types";

export default function KnownForgeryWatermark({
  authenticity,
  rendererId,
}: {
  authenticity: GameItem["authenticity"];
  rendererId: CardRendererId;
}) {
  if (
    rendererId === "legacy" ||
    !authenticity.identified ||
    !authenticity.forgery
  ) {
    return null;
  }

  return (
    <span aria-label="Known forgery" className="known-forgery-watermark">
      <i aria-hidden="true" className="fa fa-user-secret" />
    </span>
  );
}

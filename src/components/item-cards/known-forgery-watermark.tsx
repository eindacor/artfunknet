import type { GameItem } from "@/server/gameplay";

export default function KnownForgeryWatermark({
  authenticity,
}: {
  authenticity: GameItem["authenticity"];
}) {
  if (!authenticity.identified || !authenticity.forgery) return null;

  return (
    <span aria-label="Known forgery" className="known-forgery-watermark">
      <i aria-hidden="true" className="fa fa-user-secret" />
    </span>
  );
}

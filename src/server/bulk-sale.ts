import type { ArtworkRarity } from "./gameplay.ts";
import type { ItemPermission } from "./item-permissions.ts";

export type BulkSaleProtections = {
  keepArtStyles: boolean;
  keepLegendaries: boolean;
  keepMasterpieces: boolean;
  keepUnfoundQuestTargets: boolean;
  keepUnarchived: boolean;
};

export function shouldPreserveBulkSaleItem(
  item: {
    archivePermission?: ItemPermission;
    artwork: { rarity: ArtworkRarity };
    card_renderer?: string;
    unfoundQuestTarget?: boolean;
  },
  protections: BulkSaleProtections,
): boolean {
  return (
    (protections.keepArtStyles &&
      Boolean(item.card_renderer) &&
      item.card_renderer !== "museum") ||
    (protections.keepLegendaries && item.artwork.rarity === "legendary") ||
    (protections.keepMasterpieces && item.artwork.rarity === "masterpiece") ||
    (protections.keepUnfoundQuestTargets &&
      item.unfoundQuestTarget === true) ||
    (protections.keepUnarchived && item.archivePermission?.allowed === true)
  );
}

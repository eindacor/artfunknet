import type { ArtworkRarity } from "./gameplay.ts";
import type { ItemPermission } from "./item-permissions.ts";

export type BulkSaleProtections = {
  keepLegendaries: boolean;
  keepMasterpieces: boolean;
  keepUnarchived: boolean;
};

export function shouldPreserveBulkSaleItem(
  item: {
    archivePermission?: ItemPermission;
    artwork: { rarity: ArtworkRarity };
  },
  protections: BulkSaleProtections,
): boolean {
  return (
    (protections.keepLegendaries && item.artwork.rarity === "legendary") ||
    (protections.keepMasterpieces && item.artwork.rarity === "masterpiece") ||
    (protections.keepUnarchived && item.archivePermission?.allowed === true)
  );
}

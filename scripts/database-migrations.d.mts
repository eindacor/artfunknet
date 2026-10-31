import type { Db } from "mongodb";

export function migrateItemDropChances(database: Db): Promise<{ updated: number }>;
export function migrateOriginalItemDropChances(database: Db): Promise<{ updated: number }>;
export function migrateItemSerialNumbers(database: Db): Promise<{
  artworksInitialized: number;
  itemsUpdated: number;
  originalsDemoted: number;
}>;

export function migrateArtworkEffects(database: Db): Promise<void>;
export function migrateHallOfFameAndPlaythroughStorage(
  database: Db,
): Promise<void>;
export function migratePlayerTutorialFlag(database: Db): Promise<void>;

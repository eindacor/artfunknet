import type { Db } from "mongodb";

export function migrateArtworkEffects(database: Db): Promise<void>;
export function migrateHallOfFameAndPlaythroughStorage(
  database: Db,
): Promise<void>;

import { MongoClient, ServerApiVersion } from "mongodb";

import {
  migrateArtworkEffects,
  migrateD3CardRendererId,
  migrateDailyCrateClaims,
  migrateHallOfFameAndPlaythroughStorage,
  migrateItemDropChances,
  migrateOriginalItemDropChances,
  migrateWeightedOriginalItemDropChances,
  migrateItemSerialNumbers,
  migrateItemRevealStates,
  migrateMasterpieceFlavorTexts,
  migratePlayerOperationHistory,
} from "./database-migrations.mjs";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";

if (!uri) {
  throw new Error("MONGODB_URI is not configured.");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

try {
  console.log("[MONGO-CONNECT] migrate-production.mjs: connecting");
  await client.connect();
  await migrateD3CardRendererId(client.db(databaseName));
  await migratePlayerOperationHistory(client.db(databaseName));
  const dailyCrates = await migrateDailyCrateClaims(client.db(databaseName));
  console.log(`Migrated daily crate claim history for ${dailyCrates.playersUpdated} players and removed obsolete cooldown settings.`);
  await migrateHallOfFameAndPlaythroughStorage(client.db(databaseName));
  await migrateArtworkEffects(client.db(databaseName));
  const masterpieceFlavors = await migrateMasterpieceFlavorTexts(client.db(databaseName));
  console.log(`Added critic-style flavor text to ${masterpieceFlavors.updated} masterpiece effects.`);
  const dropChances = await migrateItemDropChances(client.db(databaseName));
  console.log(`Updated drop chances for ${dropChances.updated} items.`);
  const originalDropChances = await migrateOriginalItemDropChances(client.db(databaseName));
  console.log(`Initialized original drop chances for ${originalDropChances.updated} older items.`);
  const weightedOriginals = await migrateWeightedOriginalItemDropChances(client.db(databaseName));
  console.log(weightedOriginals.skipped
    ? "Skipped the completed weighted original drop chance migration."
    : `Rebased original drop chances for ${weightedOriginals.updated} items using weighted artwork odds (one-time migration).`);
  const serials = await migrateItemSerialNumbers(client.db(databaseName));
  console.log(`Initialized ${serials.artworksInitialized} artwork serial counters and serialized ${serials.itemsUpdated} items.`);
  console.log(`Demoted ${serials.originalsDemoted} duplicate Originals; the oldest Original per artwork retains serial zero.`);
  const reveals = await migrateItemRevealStates(client.db(databaseName));
  console.log(`Initialized reveal state for ${reveals.updated} older items.`);
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "production_migration.completed",
      database: databaseName,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "production_migration.failed",
      database: databaseName,
      error: serializeError(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await client.close().catch((error) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "production_migration.connection_close_failed",
        database: databaseName,
        error: serializeError(error),
      }),
    );
    process.exitCode = 1;
  });
}

function serializeError(error) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...(error.code !== undefined ? { code: String(error.code) } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause ? { cause: serializeError(error.cause) } : {}),
  };
}

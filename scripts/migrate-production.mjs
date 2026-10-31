import { MongoClient, ServerApiVersion } from "mongodb";

import {
  migrateArtworkEffects,
  migrateD3CardRendererId,
  migrateHallOfFameAndPlaythroughStorage,
  migrateItemDropChances,
  migrateOriginalItemDropChances,
  migrateItemSerialNumbers,
  migratePlayerOperationHistory,
  migratePlayerTutorialFlag,
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
  await migratePlayerTutorialFlag(client.db(databaseName));
  await migrateHallOfFameAndPlaythroughStorage(client.db(databaseName));
  await migrateArtworkEffects(client.db(databaseName));
  const dropChances = await migrateItemDropChances(client.db(databaseName));
  console.log(`Updated drop chances for ${dropChances.updated} items.`);
  const originalDropChances = await migrateOriginalItemDropChances(client.db(databaseName));
  console.log(`Initialized original drop chances for ${originalDropChances.updated} older items.`);
  const serials = await migrateItemSerialNumbers(client.db(databaseName));
  console.log(`Initialized ${serials.artworksInitialized} artwork serial counters and serialized ${serials.itemsUpdated} items.`);
  console.log(`Demoted ${serials.originalsDemoted} duplicate Originals; the oldest Original per artwork retains serial zero.`);
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

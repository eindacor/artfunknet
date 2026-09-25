import { MongoClient, ServerApiVersion } from "mongodb";

import { migrateHallOfFameAndPlaythroughStorage } from "./database-migrations.mjs";

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
  await migrateHallOfFameAndPlaythroughStorage(client.db(databaseName));
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

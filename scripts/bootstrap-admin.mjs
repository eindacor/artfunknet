import { randomBytes, scryptSync } from "node:crypto";

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!uri) {
  throw new Error("MONGODB_URI is not configured.");
}
if (!email) {
  throw new Error("ADMIN_EMAIL is not configured.");
}
if (!password || password.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
}

const client = new MongoClient(uri);

let connected = false;
try {
  console.log("[MONGO-CONNECT] bootstrap-admin.mjs: connecting");
  await client.connect();
  console.log("[MONGO-CONNECT] bootstrap-admin.mjs: connected");
  connected = true;
  const now = new Date();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");

  await client
    .db(databaseName)
    .collection("admin_users")
    .updateOne(
      { _id: email },
      {
        $set: {
          email,
          role: "admin",
          active: true,
          password_salt: salt,
          password_hash: passwordHash,
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
      },
      { upsert: true },
    );

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "admin_bootstrap.completed",
      database: databaseName,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "admin_bootstrap.failed",
      database: databaseName,
      error: serializeError(error),
    }),
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    await client.close().catch((error) => {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          event: "admin_bootstrap.connection_close_failed",
          database: databaseName,
          error: serializeError(error),
        }),
      );
      process.exitCode = 1;
    });
  }
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

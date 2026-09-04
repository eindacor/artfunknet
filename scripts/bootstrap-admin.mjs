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

try {
  await client.connect();
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

  console.log(`Administrator ${email} is ready in ${databaseName}.`);
} finally {
  await client.close();
}

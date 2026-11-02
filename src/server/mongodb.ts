import "server-only";

import { Db, MongoClient, ServerApiVersion } from "mongodb";
import { headers } from "next/headers";
import { after } from "next/server";

import { holdAccountDataAccess } from "./account-data-access.ts";

const uri = process.env.MONGODB_URI;

declare global {
  var artfunkelMongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): MongoClient {
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not configured. Copy .env.example to .env.local.",
    );
  }

  return new MongoClient(uri, {
    maxPoolSize: 10,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

function getClientPromise(): Promise<MongoClient> {
  const connection =
    global.artfunkelMongoClientPromise ?? createClient().connect();
  global.artfunkelMongoClientPromise = connection;
  void connection.catch(() => {
    if (global.artfunkelMongoClientPromise === connection) {
      global.artfunkelMongoClientPromise = undefined;
    }
  });
  return connection;
}

async function getRawDatabase(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB ?? "artfunkel");
}

export async function getDatabase(
  options: { accountErasure?: boolean } = {},
): Promise<Db> {
  const database = await getRawDatabase();
  if (!options.accountErasure) {
    await holdAccountDataAccess(database, await headers(), after);
  }
  return database;
}

export async function withDatabase<T>(operation: (database: Db) => Promise<T>): Promise<T> {
  const database = await getRawDatabase();
  let release!: () => Promise<void>;
  await holdAccountDataAccess(database, {}, (callback) => { release = callback; });
  try {
    return await operation(database);
  } finally {
    await release();
  }
}

import "server-only";

import { Db, MongoClient, ServerApiVersion } from "mongodb";

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
  if (process.env.NODE_ENV === "development") {
    global.artfunkelMongoClientPromise ??= createClient().connect();
    return global.artfunkelMongoClientPromise;
  }

  return createClient().connect();
}

export async function getDatabase(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB ?? "artfunkel");
}

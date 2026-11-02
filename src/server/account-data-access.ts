import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import type { Db } from "mongodb";

const GATE_ID = "account-erasure-gate";
const LEASE_MS = 120_000;
const requestLeases = new WeakMap<object, Promise<void>>();

type Lease = { token: string; expires_at: Date };
type Gate = {
  _id: string;
  readers: Lease[];
  writer?: Lease;
};

export class AccountDataBusyError extends Error {
  readonly status = 409;
}

async function ensureGate(database: Db) {
  try {
    await database.collection<Gate>("metadata").updateOne(
      { _id: GATE_ID },
      { $setOnInsert: { readers: [] } },
      { upsert: true },
    );
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) throw error;
  }
}

function renewLease(database: Db, token: string, writer: boolean) {
  const timer = setInterval(() => {
    const expiresAt = new Date(Date.now() + LEASE_MS);
    const gates = database.collection<Gate>("metadata");
    const update = writer
      ? gates.updateOne(
          { _id: GATE_ID, "writer.token": token },
          { $set: { "writer.expires_at": expiresAt } },
        )
      : gates.updateOne(
          { _id: GATE_ID, "readers.token": token },
          { $set: { "readers.$[reader].expires_at": expiresAt } },
          { arrayFilters: [{ "reader.token": token }] },
        );
    void update.catch(() => {
      console.error("Could not renew the account data access lease.");
    });
  }, LEASE_MS / 4);
  timer.unref();
  return () => clearInterval(timer);
}

export async function holdAccountDataAccess(
  database: Db,
  requestKey: object,
  onComplete: (callback: () => Promise<void>) => void,
): Promise<void> {
  const existing = requestLeases.get(requestKey);
  if (existing) return existing;

  const lease = (async () => {
    await ensureGate(database);
    const token = randomUUID();
    const gates = database.collection<Gate>("metadata");
    const deadline = Date.now() + LEASE_MS;
    for (;;) {
      const now = new Date();
      const acquired = await gates.updateOne(
        {
          _id: GATE_ID,
          $or: [
            { writer: { $exists: false } },
            { "writer.expires_at": { $lte: now } },
          ],
        },
        [{
          $set: {
            writer: "$$REMOVE",
            readers: {
              $concatArrays: [
                { $filter: {
                  input: "$readers",
                  as: "reader",
                  cond: { $gt: ["$$reader.expires_at", now] },
                } },
                [{ token, expires_at: new Date(now.getTime() + LEASE_MS) }],
              ],
            },
          },
        }],
      );
      if (acquired.matchedCount) break;
      if (Date.now() >= deadline) {
        throw new AccountDataBusyError("Account deletion is running. Please try again shortly.");
      }
      await sleep(100);
    }

    const stopRenewing = renewLease(database, token, false);
    const release = async () => {
      stopRenewing();
      await gates.updateOne(
        { _id: GATE_ID },
        { $pull: { readers: { token } } },
      );
    };
    try {
      onComplete(release);
    } catch (error) {
      await release();
      throw error;
    }
  })();
  requestLeases.set(requestKey, lease);
  try {
    await lease;
  } catch (error) {
    requestLeases.delete(requestKey);
    throw error;
  }
}

export async function withExclusiveAccountDataAccess<T>(
  database: Db,
  operation: () => Promise<T>,
): Promise<T> {
  await ensureGate(database);
  const token = randomUUID();
  const gates = database.collection<Gate>("metadata");
  const acquired = await gates.updateOne(
    {
      _id: GATE_ID,
      $or: [
        { writer: { $exists: false } },
        { "writer.expires_at": { $lte: new Date() } },
      ],
    },
    { $set: { writer: { token, expires_at: new Date(Date.now() + LEASE_MS) } } },
  );
  if (!acquired.matchedCount) {
    throw new AccountDataBusyError("Another account deletion is running. Please try again shortly.");
  }
  const stopRenewing = renewLease(database, token, true);
  try {
    const deadline = Date.now() + 10_000;
    while (await gates.findOne({
      _id: GATE_ID,
      readers: { $elemMatch: { expires_at: { $gt: new Date() } } },
    })) {
      if (Date.now() >= deadline) {
        throw new AccountDataBusyError("Other game actions are still finishing. Please try deleting again.");
      }
      await sleep(50);
    }
    return await operation();
  } finally {
    stopRenewing();
    await gates.updateOne(
      { _id: GATE_ID, "writer.token": token },
      { $unset: { writer: "" } },
    );
  }
}

import assert from "node:assert/strict";
import test from "node:test";

import type { Db } from "mongodb";

import {
  createPlayerNotification,
  PLAYER_NOTIFICATION_EMISSION_ENABLED,
} from "./player-notifications.ts";

test("notification emission stores important player events", async () => {
  assert.equal(PLAYER_NOTIFICATION_EMISSION_ENABLED, true);
  const inserted: unknown[] = [];
  const database = {
    collection() {
      return {
        findOne: async () => null,
        insertOne: async (notification: unknown) => {
          inserted.push(notification);
          return { acknowledged: true };
        },
      };
    },
  } as unknown as Db;

  const notification = await createPlayerNotification(database, "player-1", {
    kind: "success",
    message: "You won an auction.",
    action: {
      href: "/play?section=auctions&auction=auction-1",
      label: "View auction",
    },
  });

  assert.equal(notification?.user_id, "player-1");
  assert.equal(notification?.message, "You won an auction.");
  assert.deepEqual(notification?.action, {
    href: "/play?section=auctions&auction=auction-1",
    label: "View auction",
  });
  assert.equal(inserted.length, 1);
});

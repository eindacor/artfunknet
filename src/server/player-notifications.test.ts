import assert from "node:assert/strict";
import test from "node:test";

import type { Db } from "mongodb";

import {
  createPlayerNotification,
  PLAYER_NOTIFICATION_EMISSION_ENABLED,
} from "./player-notifications.ts";

test("notification emission is disabled without touching MongoDB", async () => {
  assert.equal(PLAYER_NOTIFICATION_EMISSION_ENABLED, false);

  const database = {
    collection() {
      throw new Error("Notification storage should not be accessed.");
    },
  } as unknown as Db;

  const notification = await createPlayerNotification(database, "player-1", {
    kind: "success",
    message: "This should not be stored.",
  });

  assert.equal(notification, null);
});

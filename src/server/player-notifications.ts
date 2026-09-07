import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

export const PLAYER_NOTIFICATION_KINDS = [
  "info",
  "success",
  "warning",
  "error",
] as const;

export type PlayerNotificationKind =
  (typeof PLAYER_NOTIFICATION_KINDS)[number];

export type PlayerNotification = {
  _id: string;
  user_id: string;
  kind: PlayerNotificationKind;
  message: string;
  action?: {
    href: string;
    label: string;
  };
  read: boolean;
  created_at: string;
};

export const PLAYER_NOTIFICATION_EMISSION_ENABLED = true;

export async function createPlayerNotification(
  database: Db,
  userId: string,
  {
    kind,
    message,
    action,
    dedupeUnread = true,
  }: {
    kind: PlayerNotificationKind;
    message: string;
    action?: PlayerNotification["action"];
    dedupeUnread?: boolean;
  },
): Promise<PlayerNotification | null> {
  if (!PLAYER_NOTIFICATION_EMISSION_ENABLED) {
    return null;
  }

  const notifications =
    database.collection<PlayerNotification>("player_notifications");

  if (dedupeUnread) {
    const existing = await notifications.findOne({
      user_id: userId,
      kind,
      message,
      ...(action ? { action } : {}),
      read: false,
    });
    if (existing) return existing;
  }

  const notification: PlayerNotification = {
    _id: randomUUID(),
    user_id: userId,
    kind,
    message,
    ...(action ? { action } : {}),
    read: false,
    created_at: new Date().toISOString(),
  };
  await notifications.insertOne(notification);
  return notification;
}

export async function getPlayerNotifications(
  database: Db,
  userId: string,
  limit = 50,
): Promise<PlayerNotification[]> {
  return database
    .collection<PlayerNotification>("player_notifications")
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
}

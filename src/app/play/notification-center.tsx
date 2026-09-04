"use client";

import { useState } from "react";

import type { PlayerNotification } from "@/server/player-notifications";

export default function NotificationCenter({
  notifications,
  onChange,
}: {
  notifications: PlayerNotification[];
  onChange: (notifications: PlayerNotification[]) => void;
}) {
  const [error, setError] = useState("");
  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  async function request(
    url: string,
    options: RequestInit,
    failureMessage: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        setError(failureMessage);
        return false;
      }
      setError("");
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : failureMessage,
      );
      return false;
    }
  }

  async function updateRead(notification: PlayerNotification) {
    const succeeded = await request(
      `/api/play/notifications/${notification._id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read: !notification.read }),
      },
      "The notification read state could not be updated.",
    );
    if (!succeeded) return;
    onChange(
      notifications.map((candidate) =>
        candidate._id === notification._id
          ? { ...candidate, read: !candidate.read }
          : candidate,
      ),
    );
  }

  async function deleteNotification(id: string) {
    const succeeded = await request(
      `/api/play/notifications/${id}`,
      { method: "DELETE" },
      "The notification could not be deleted.",
    );
    if (!succeeded) return;
    onChange(notifications.filter((notification) => notification._id !== id));
  }

  async function markAllRead() {
    const succeeded = await request(
      "/api/play/notifications",
      { method: "PATCH" },
      "Notifications could not be marked as read.",
    );
    if (!succeeded) return;
    onChange(
      notifications.map((notification) => ({ ...notification, read: true })),
    );
  }

  async function clearAll() {
    const succeeded = await request(
      "/api/play/notifications",
      { method: "DELETE" },
      "Notifications could not be cleared.",
    );
    if (!succeeded) return;
    onChange([]);
  }

  return (
    <aside
      aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      className="profile-notification-panel"
    >
      <header>
        <div>
          <span>
            <i aria-hidden="true" className="fa fa-bell" />
            Notifications
          </span>
          <small>
            {unreadCount > 0
              ? `${unreadCount} unread`
              : ""}
          </small>
        </div>
        {unreadCount > 0 ? (
          <strong className="notification-count">{unreadCount}</strong>
        ) : null}
      </header>
      <div className="notification-panel">
        <div className="notification-panel-tools">
          <button
            disabled={unreadCount === 0}
            onClick={markAllRead}
            type="button"
          >
            mark all read
          </button>
          <button
            disabled={notifications.length === 0}
            onClick={clearAll}
            type="button"
          >
            clear all
          </button>
        </div>
        {notifications.length === 0 ? (
          <div className="notification-empty">
            <i aria-hidden="true" className="fa fa-bell" />
          </div>
        ) : (
          <ol className="notification-list">
            {notifications.map((notification) => (
              <li
                className={`${notification.kind} ${
                  notification.read ? "read" : "unread"
                }`}
                key={notification._id}
              >
                <div>
                  <p>{notification.message}</p>
                  <time dateTime={notification.created_at}>
                    {new Date(notification.created_at).toLocaleString()}
                  </time>
                </div>
                <div className="notification-actions">
                  <button
                    aria-label={`Mark notification as ${
                      notification.read ? "unread" : "read"
                    }`}
                    onClick={() => updateRead(notification)}
                    title={`mark as ${notification.read ? "unread" : "read"}`}
                    type="button"
                  >
                    <i
                      aria-hidden="true"
                      className={`fa ${
                        notification.read ? "fa-envelope" : "fa-check"
                      }`}
                    />
                  </button>
                  <button
                    aria-label="Delete notification"
                    onClick={() => deleteNotification(notification._id)}
                    title="delete"
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-trash" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p aria-live="polite" className="notification-panel-error">
          {error}
        </p>
      </div>
    </aside>
  );
}

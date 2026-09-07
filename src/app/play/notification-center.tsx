"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FloatingPopover } from "@/components/floating-popover";
import type { PlayerNotification } from "@/server/player-notifications";

export default function NotificationCenter({
  initialNotifications = [],
}: {
  initialNotifications?: PlayerNotification[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refreshInFlight = useRef(false);
  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  const refreshNotifications = useCallback(
    async (quiet = false) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      try {
        const response = await fetch("/api/play/notifications", {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          error?: string;
          notifications?: PlayerNotification[];
        };
        if (!response.ok || !body.notifications) {
          throw new Error(
            body.error ?? "Notifications could not be refreshed.",
          );
        }
        setNotifications(body.notifications);
        if (!quiet) setError("");
      } catch (refreshError) {
        const message =
          refreshError instanceof Error
            ? refreshError.message
            : "Notifications could not be refreshed.";
        if (quiet) {
          console.error("Unable to refresh notifications", refreshError);
        } else {
          setError(message);
        }
      } finally {
        refreshInFlight.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(
      () => void refreshNotifications(true),
      0,
    );
    const timer = window.setInterval(
      () => void refreshNotifications(true),
      15_000,
    );
    function refreshWhenActive() {
      if (document.visibilityState === "visible") {
        void refreshNotifications(true);
      }
    }
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refreshNotifications]);

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
    setNotifications(
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
    setNotifications(
      notifications.filter((notification) => notification._id !== id),
    );
  }

  async function markAllRead() {
    const succeeded = await request(
      "/api/play/notifications",
      { method: "PATCH" },
      "Notifications could not be marked as read.",
    );
    if (!succeeded) return;
    setNotifications(
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
    setNotifications([]);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className="header-notification-button"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        <i aria-hidden="true" className="fa fa-bell" />
        {unreadCount > 0 ? (
          <span className="notification-count">{unreadCount}</span>
        ) : null}
      </button>
      <FloatingPopover
        anchorRef={buttonRef}
        ariaLabel="Notifications"
        className="header-notification-popover"
        onDismiss={() => setOpen(false)}
        open={open}
        role="dialog"
      >
        <header>
          <strong>Notifications</strong>
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
        </header>
        <div className="notification-panel">
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
      </FloatingPopover>
    </>
  );
}

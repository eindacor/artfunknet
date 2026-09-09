"use client";

import { useEffect, useState, type CSSProperties } from "react";

type ExpiringItem = {
  date_received?: string;
  expires_at?: string;
};

export function ItemExpirationBadge({ item }: { item: ExpiringItem }) {
  const expiration = useItemExpiration(item);
  if (!expiration) return null;

  return (
    <time
      className="item-expiration-badge"
      dateTime={expiration.iso}
      title={`Expires ${expiration.absolute}`}
    >
      <i aria-hidden="true" className="fa fa-clock-o" />
      {expiration.remainingLabel}
    </time>
  );
}

export function ItemExpirationTime({ item }: { item: ExpiringItem }) {
  const expiration = useItemExpiration(item);
  if (!expiration) return null;

  return (
    <time dateTime={expiration.iso} title={expiration.remainingLabel}>
      {expiration.absolute} ({expiration.remainingLabel})
    </time>
  );
}

export function ItemExpirationTint({ item }: { item: ExpiringItem }) {
  const expiration = useItemExpiration(item);
  if (!expiration) return null;

  return (
    <span
      aria-hidden="true"
      className="thumbnail-expiration-tint"
      style={
        {
          "--expiration-progress": expiration.progress,
        } as CSSProperties
      }
    />
  );
}

function useItemExpiration(item: ExpiringItem) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null || !item.expires_at) return null;
  const expiresAt = new Date(item.expires_at);
  const expiresAtMs = expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs)) return null;

  const receivedAtMs = item.date_received
    ? new Date(item.date_received).getTime()
    : now;
  const lifetimeMs =
    Number.isFinite(receivedAtMs) && expiresAtMs > receivedAtMs
      ? expiresAtMs - receivedAtMs
      : Math.max(expiresAtMs - now, 1);
  const remainingMs = Math.max(0, expiresAtMs - now);
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / lifetimeMs));

  return {
    absolute: expiresAt.toLocaleString(),
    iso: expiresAt.toISOString(),
    progress,
    remainingLabel:
      remainingMs > 0 ? `Expires in ${formatRemaining(remainingMs)}` : "Expired",
  };
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

"use client";

import { useEffect, useState } from "react";

import type { DailyEventAttentionView } from "@/server/daily-event-attention";

export function useDailyEventAttention(playerId: string, now: number) {
  const [view, setView] = useState<(DailyEventAttentionView & { playerId: string }) | null>(null);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let boundary: number | undefined;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/play/daily-events/attention", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const body = await response.json() as DailyEventAttentionView;
        if (disposed || request.signal.aborted) return;
        setView({ ...body, playerId });
        window.clearTimeout(boundary);
        boundary = window.setTimeout(
          () => void refresh(),
          Math.max(100, new Date(body.nextRefreshAt).getTime() - Date.now() + 100),
        );
      } catch {
        // Keep current reminders through transient failures; timed ones still expire.
      }
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("artfunkel:daily-events-change", refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearTimeout(initial);
      window.clearTimeout(boundary);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("artfunkel:daily-events-change", refresh);
    };
  }, [playerId]);

  const current = view?.playerId === playerId ? view : null;
  return {
    currentDay: current?.currentDay,
    callsToAction: (current?.callsToAction ?? []).filter(
      (action) => !action.expiresAt || new Date(action.expiresAt).getTime() > now,
    ),
  };
}

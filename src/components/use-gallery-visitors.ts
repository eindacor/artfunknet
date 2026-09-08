"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GalleryNpc } from "@/server/npc-gameplay";

const MINIMUM_REFRESH_INTERVAL_MS = 1_000;
const SPAWN_REFRESH_DELAY_MS = 1_500;
const SCHEDULER_HEARTBEAT_MS = 30_000;

export type GalleryVisitorView = Omit<
  GalleryNpc,
  "expiration" | "players_met" | "spawned_at"
> & {
  alreadyMet: boolean;
  expiration: string;
  spawned_at: string;
};

function filterUnexpired(list: GalleryVisitorView[]): GalleryVisitorView[] {
  const now = Date.now();
  return list.filter((visitor) => {
    if (!visitor.expiration) return true;
    const exp = new Date(visitor.expiration).getTime();
    return Number.isNaN(exp) || exp > now;
  });
}

export function useGalleryVisitors({
  enabled = true,
  initialVisitors,
  ownerId,
  spawnIntervalMinutes,
}: {
  enabled?: boolean;
  initialVisitors: GalleryVisitorView[];
  ownerId: string;
  spawnIntervalMinutes: number;
}) {
  const [visitors, setVisitors] = useState(() => filterUnexpired(initialVisitors));
  const lastRefreshCycle = useRef(-1);
  const requestInProgress = useRef(false);
  const refreshIntervalMs = useMemo(
    () =>
      Math.max(
        MINIMUM_REFRESH_INTERVAL_MS,
        Math.floor(spawnIntervalMinutes * 60 * 1000),
      ),
    [spawnIntervalMinutes],
  );

  const refreshVisitors = useCallback(async () => {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    try {
      const response = await fetch(
        `/api/play/galleries/${encodeURIComponent(ownerId)}/visitors`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        visitors?: GalleryVisitorView[];
      };
      if (body.visitors) setVisitors(filterUnexpired(body.visitors));
      lastRefreshCycle.current = Math.floor(Date.now() / refreshIntervalMs);
    } catch (error) {
      console.warn("Unable to refresh gallery visitors", error);
    } finally {
      requestInProgress.current = false;
    }
  }, [ownerId, refreshIntervalMs]);

  useEffect(() => {
    if (!enabled) return;

    let boundaryTimer: number;
    const refreshIfCycleAdvanced = () => {
      setVisitors((current) => {
        const filtered = filterUnexpired(current);
        return filtered.length === current.length ? current : filtered;
      });
      if (document.visibilityState !== "visible") return;
      const currentCycle = Math.floor(Date.now() / refreshIntervalMs);
      if (currentCycle > lastRefreshCycle.current) {
        void refreshVisitors();
      }
    };
    const scheduleNextRefresh = () => {
      const now = Date.now();
      const nextCycle =
        (Math.floor(now / refreshIntervalMs) + 1) * refreshIntervalMs;
      boundaryTimer = window.setTimeout(() => {
        refreshIfCycleAdvanced();
        scheduleNextRefresh();
      }, nextCycle - now + SPAWN_REFRESH_DELAY_MS);
    };

    lastRefreshCycle.current = -1;
    refreshIfCycleAdvanced();
    scheduleNextRefresh();
    const heartbeatTimer = window.setInterval(
      refreshIfCycleAdvanced,
      Math.min(SCHEDULER_HEARTBEAT_MS, refreshIntervalMs),
    );
    document.addEventListener("visibilitychange", refreshIfCycleAdvanced);
    window.addEventListener("focus", refreshIfCycleAdvanced);
    window.addEventListener("pageshow", refreshIfCycleAdvanced);
    return () => {
      window.clearTimeout(boundaryTimer);
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", refreshIfCycleAdvanced);
      window.removeEventListener("focus", refreshIfCycleAdvanced);
      window.removeEventListener("pageshow", refreshIfCycleAdvanced);
    };
  }, [enabled, refreshIntervalMs, refreshVisitors]);

  const markVisitorMet = useCallback((visitorId: string) => {
    setVisitors((current) =>
      current.map((visitor) =>
        visitor._id === visitorId
          ? { ...visitor, alreadyMet: true }
          : visitor,
      ),
    );
  }, []);

  const removeVisitor = useCallback((visitorId: string) => {
    setVisitors((current) => current.filter((visitor) => visitor._id !== visitorId));
  }, []);

  const replaceVisitors = useCallback((nextVisitors: GalleryVisitorView[]) => {
    setVisitors(filterUnexpired(nextVisitors));
    lastRefreshCycle.current = Math.floor(Date.now() / refreshIntervalMs);
  }, [refreshIntervalMs]);

  const activeVisitors = useMemo(() => filterUnexpired(visitors), [visitors]);

  return { markVisitorMet, removeVisitor, refreshVisitors, replaceVisitors, visitors: activeVisitors };
}

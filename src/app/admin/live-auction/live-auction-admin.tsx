"use client";

import { useCallback, useEffect, useState } from "react";

import ItemCard from "@/components/item-cards/item-card";
import type {
  LiveAuctionAdminView,
} from "@/server/live-auction-event";

export default function LiveAuctionAdmin({
  initialView,
}: {
  initialView: LiveAuctionAdminView;
}) {
  const [view, setView] = useState(initialView);
  const [streamUrl, setStreamUrl] = useState(initialView.state.stream_url);
  const [increment, setIncrement] = useState(
    String(initialView.state.configured_increment),
  );
  const [pending, setPending] = useState("");
  const [status, setStatus] = useState("");

  const refreshView = useCallback(async () => {
    const response = await fetch("/api/admin/daily-events/live-auction", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("The live auction could not be refreshed.");
    }
    const nextView = (await response.json()) as LiveAuctionAdminView;
    setView(nextView);
    return nextView;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshView().catch(() => {
        // The next poll will retry without interrupting auction controls.
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [refreshView]);

  async function send(
    method: "DELETE" | "PATCH" | "POST",
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    setPending(action);
    setStatus("");
    try {
      const response = await fetch(
        "/api/admin/daily-events/live-auction",
        {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        view?: LiveAuctionAdminView;
      };
      if (!response.ok || !body.view) {
        throw new Error(body.error ?? "The live auction could not be updated.");
      }
      setView(body.view);
      setStreamUrl(body.view.state.stream_url);
      if (action === "increment") {
        setIncrement(String(body.view.state.configured_increment));
      }
      if (action === "accept") {
        await refreshView().catch(() => undefined);
      }
      setStatus("Live-auction state updated.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The live auction could not be updated.",
      );
    } finally {
      setPending("");
    }
  }

  const { state, currentItem, bufferItems } = view;
  const busy = pending !== "";

  return (
    <section className="daily-event-admin">
      <article className="admin-item-section">
        <h2>Broadcast controls</h2>
        <label>
          Twitch stream URL
          <input
            disabled={busy}
            onChange={(event) => setStreamUrl(event.target.value)}
            placeholder="https://www.twitch.tv/channel"
            type="url"
            value={streamUrl}
          />
        </label>
        <p>
          Paste a Twitch channel URL or a player.twitch.tv embed URL. The
          required embed domain is added automatically for players.
        </p>
        <button
          disabled={busy}
          onClick={() => send("PATCH", "stream", { streamUrl })}
          type="button"
        >
          {pending === "stream" ? "Saving…" : "Save stream URL"}
        </button>
        <label>
          Minimum bid increment
          <input
            disabled={busy}
            min="1"
            onChange={(event) => setIncrement(event.target.value)}
            step="1"
            type="number"
            value={increment}
          />
        </label>
        <button
          disabled={
            busy ||
            !Number.isSafeInteger(Number(increment)) ||
            Number(increment) < 1
          }
          onClick={() =>
            send("PATCH", "increment", { increment: Number(increment) })
          }
          type="button"
        >
          {pending === "increment" ? "Saving…" : "Save minimum increment"}
        </button>
        <p>
          Status: <strong>{state.live ? "Live" : "Stopped"}</strong>
          {state.live && currentItem
            ? ` · ${state.hidden ? "Hidden" : "Visible"}`
            : ""}
        </p>
        <div className="daily-event-admin-actions">
          <button
            disabled={busy || state.live || bufferItems.length === 0}
            onClick={() => send("POST", "start")}
            type="button"
          >
            {pending === "start" ? "Starting…" : "Start live auction"}
          </button>
          <button
            disabled={busy || !state.live || !currentItem}
            onClick={() =>
              send("PATCH", state.hidden ? "show" : "hide")
            }
            type="button"
          >
            {pending === "show" || pending === "hide"
              ? "Updating…"
              : state.hidden
                ? "Show item"
                : "Hide item"}
          </button>
          <button
            disabled={busy || !state.live || !state.winner_id}
            onClick={() => send("POST", "accept")}
            type="button"
          >
            {pending === "accept" ? "Accepting…" : "Accept bid"}
          </button>
          <button
            disabled={busy || !state.live}
            onClick={() => send("POST", "stop")}
            type="button"
          >
            {pending === "stop" ? "Stopping…" : "Stop live auction"}
          </button>
        </div>
        {status ? <p aria-live="polite">{status}</p> : null}
      </article>

      <article className="admin-item-section">
        <h2>Current item</h2>
        {currentItem ? (
          <div className="daily-event-admin-current">
            <ItemCard
              item={currentItem}
              legendaryAttributes={[]}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
            />
            <dl>
              <dt>Current bid</dt>
              <dd>${state.current_bid.toLocaleString()}</dd>
              <dt>Next minimum</dt>
              <dd>${state.minimum_bid.toLocaleString()}</dd>
              <dt>Increment</dt>
              <dd>${state.increment.toLocaleString()}</dd>
              <dt>Winning bidder</dt>
              <dd>{state.winner_name ?? "No bids yet"}</dd>
            </dl>
          </div>
        ) : state.live ? (
          <p>The buffer is empty. Players are seeing the thank-you state.</p>
        ) : (
          <p>No item is currently live.</p>
        )}
      </article>

      <article className="admin-item-section">
        <h2>Buffer ({bufferItems.length})</h2>
        {bufferItems.length ? (
          <div className="daily-event-admin-buffer">
            {bufferItems.map((item, index) => (
              <article key={item._id}>
                <h3>
                  {index + 1}. {item.artwork.title}
                </h3>
                <ItemCard
                  interactive={false}
                  item={item}
                  legendaryAttributes={[]}
                  permissions={{
                    canManageItem: false,
                    canCustomizeCosmetic: false,
                  }}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    send("DELETE", `remove:${item._id}`, {
                      itemId: item._id,
                    })
                  }
                  type="button"
                >
                  {pending === `remove:${item._id}`
                    ? "Removing…"
                    : "Remove from buffer"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>No buffered items.</p>
        )}
      </article>
    </section>
  );
}

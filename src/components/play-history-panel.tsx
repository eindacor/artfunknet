"use client";

import { useState } from "react";

import ItemThumbnail from "@/components/item-thumbnail";
import type { PlaythroughSnapshot } from "@/server/playthrough-snapshots";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function PlayHistoryPanel({
  snapshots,
}: {
  snapshots: PlaythroughSnapshot[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (snapshots.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--accent)]">📜 Play History</h2>
          <p className="text-xs text-[var(--muted)]">
            A record of all your previous era playthroughs, snapshotted galleries, and selected vintage items.
          </p>
        </div>
        <span className="text-xs font-bold bg-white/10 px-2.5 py-1 rounded-full text-white">
          {snapshots.length} Era{snapshots.length === 1 ? "" : "s"} Completed
        </span>
      </div>

      <div className="grid gap-4">
        {snapshots.map((snap) => {
          const isExpanded = expandedId === snap._id;
          const vintageItem = snap.selected_vintage_item;

          return (
            <div
              key={snap._id}
              className="rounded-lg border border-white/10 bg-black/40 p-4 space-y-3 transition-colors"
            >
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Era #{snap.playthrough_number}
                  </span>
                  <p className="text-xs text-[var(--muted)]">
                    Ended on {new Date(snap.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-[var(--muted)] block">Visitors Met</span>
                    <span className="font-semibold text-white">{snap.stats?.visitors_met?.toLocaleString() || 0}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] block">Items Collected</span>
                    <span className="font-semibold text-white">{snap.stats?.items_collected?.toLocaleString() || 0}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] block">Money Spent</span>
                    <span className="font-semibold text-emerald-400">${snap.stats?.money_spent?.toLocaleString() || 0}</span>
                  </div>
                </div>

                <button
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                  onClick={() => setExpandedId(isExpanded ? null : snap._id)}
                  type="button"
                >
                  {isExpanded ? "Hide Snapshotted Gallery" : `View Gallery (${snap.gallery_snapshot?.length || 0})`}
                </button>
              </div>

              {vintageItem && (
                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded p-2.5 text-xs">
                  <span className="text-lg">🏆</span>
                  <div>
                    <span className="text-[var(--muted)] block text-[10px]">Selected Vintage Artwork</span>
                    <span className="font-bold text-amber-300">
                      {vintageItem.artwork_title || "Vintage Artwork"} by {vintageItem.artist_name || "Unknown Artist"}
                    </span>
                  </div>
                </div>
              )}

              {isExpanded && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <h4 className="text-xs font-bold text-neutral-300">Snapshotted Gallery Wall ({snap.gallery_snapshot?.length || 0} items)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {snap.gallery_snapshot?.map((item) => (
                      <div key={item._id} className="rounded border border-white/10 bg-black/60 p-2 text-center text-xs space-y-1">
                        <p className="font-bold truncate text-white">{item.artwork_title || "Artwork"}</p>
                        <p className="text-[10px] text-[var(--muted)] truncate">{item.artist_name || "Artist"}</p>
                        <p className="text-[10px] text-emerald-400 font-mono">${item.values?.actual?.toLocaleString() || 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

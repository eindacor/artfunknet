"use client";

import { useState } from "react";

import ItemCard from "@/components/item-cards/item-card";
import type { PlaythroughSnapshot } from "@/server/playthrough-snapshots";

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
    <section className="profile-record-panel">
      <header>
        <div>
          <span>Play history</span>
          <small>
            Previous eras, submitted gallery walls, and selected vintage works
          </small>
        </div>
        <strong>
          {snapshots.length} Era{snapshots.length === 1 ? "" : "s"} Completed
        </strong>
      </header>

      <div className="play-history-list">
        {snapshots.map((snap) => {
          const isExpanded = expandedId === snap._id;
          const vintageItem = snap.selected_vintage_item;

          return (
            <div
              key={snap._id}
              className="play-history-entry"
            >
              <div className="play-history-summary">
                <div>
                  <span className="play-history-era">
                    Era #{snap.playthrough_number}
                  </span>
                  <p>
                    Ended on {new Date(snap.created_at).toLocaleDateString()}
                  </p>
                </div>

                <dl className="play-history-stats">
                  <div>
                    <dt>Visitors met</dt>
                    <dd>{snap.stats?.visitors_met?.toLocaleString() || 0}</dd>
                  </div>
                  <div>
                    <dt>Items collected</dt>
                    <dd>{snap.stats?.items_collected?.toLocaleString() || 0}</dd>
                  </div>
                  <div>
                    <dt>Money spent</dt>
                    <dd>${snap.stats?.money_spent?.toLocaleString() || 0}</dd>
                  </div>
                </dl>

                <button
                  onClick={() => setExpandedId(isExpanded ? null : snap._id)}
                  type="button"
                >
                  {isExpanded ? "Hide Snapshotted Gallery" : `View Gallery (${snap.gallery_snapshot?.length || 0})`}
                </button>
              </div>

              {vintageItem && (
                <div className="play-history-vintage">
                  <ItemCard
                    interactive
                    item={vintageItem}
                    legendaryAttributes={[]}
                  />
                  <div className="play-history-vintage-copy">
                    <small>Selected vintage artwork</small>
                    <strong>{vintageItem.artwork.title}</strong>
                    <span>by {vintageItem.artwork.artist}</span>
                  </div>
                </div>
              )}

              {isExpanded && (
                <div className="play-history-gallery">
                  <h4>
                    Submitted gallery wall ({snap.gallery_snapshot?.length || 0} items)
                  </h4>
                  {snap.gallery_snapshot.length === 0 ? (
                    <p>No items were on display when this era ended.</p>
                  ) : (
                    <div className="play-history-gallery-items">
                      {snap.gallery_snapshot.map((item) => (
                        <ItemCard
                          interactive
                          item={item}
                          key={item._id}
                          legendaryAttributes={[]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

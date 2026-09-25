"use client";

import ItemCard from "@/components/item-cards/item-card";
import type { HallOfFameDisplayRecord } from "@/server/hall-of-fame";

export default function HallOfFamePanel({
  records,
}: {
  records: HallOfFameDisplayRecord[];
}) {
  return (
    <section className="profile-record-panel" id="hall-of-fame">
      <header>
        <div>
          <span>Hall of fame</span>
          <small>
            Historic artworks and first-of-their-kind achievements
          </small>
        </div>
        <strong>{records.length.toLocaleString()} inducted</strong>
      </header>

      {records.length === 0 ? (
        <p className="profile-record-empty">
          No artworks have been inducted yet.
        </p>
      ) : (
        <div className="hall-of-fame-list">
          {records.map((record) => (
            <article className="hall-of-fame-entry" key={record._id}>
              <div className="hall-of-fame-card">
                <ItemCard
                  interactive
                  item={record.item}
                  legendaryAttributes={[]}
                />
              </div>
              <div className="hall-of-fame-copy">
                <p className="hall-of-fame-kicker">
                  {record.item_is_live ? "Current item" : "Preserved snapshot"}
                </p>
                <h3>{record.title}</h3>
                <p>{record.description}</p>
                <dl>
                  <div>
                    <dt>Inducted</dt>
                    <dd>{new Date(record.created_at).toLocaleDateString()}</dd>
                  </div>
                  <div>
                    <dt>Player</dt>
                    <dd>{record.player_screen_name || "System"}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

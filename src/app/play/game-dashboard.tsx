"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { GalleryRates } from "@/server/collection-gameplay";
import type { GameItem } from "@/server/gameplay";

type PlayerView = {
  screenName: string;
  bankBalance: number;
  level: number;
  xp: number;
  lotteryTickets: number;
  inventoryCap: number;
  displayCap: number;
  lastDrop: string;
  xpGoal: number;
};

export default function GameDashboard({
  player,
  items,
  galleryRates,
  payout,
  dailyDropCooldownMinutes,
}: {
  player: PlayerView;
  items: GameItem[];
  galleryRates: GalleryRates;
  payout: { money: number; xp: number; intervals: number };
  dailyDropCooldownMinutes: number;
}) {
  const router = useRouter();
  const [section, setSection] = useState<
    "profile" | "inventory" | "loot" | "gallery"
  >(
    items.some((item) => item.status === "unclaimed") ? "loot" : "profile",
  );
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const unclaimed = useMemo(
    () => items.filter((item) => item.status === "unclaimed"),
    [items],
  );
  const inventory = useMemo(
    () => items.filter((item) => item.status === "claimed"),
    [items],
  );
  const displayed = useMemo(
    () => items.filter((item) => item.status === "displayed"),
    [items],
  );
  const ownedCount = inventory.length + displayed.length;
  const nextDrop =
    new Date(player.lastDrop).getTime() +
    dailyDropCooldownMinutes * 60 * 1000;
  const dropReady = now >= nextDrop;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function act(url: string) {
    setError("");
    startTransition(async () => {
      const response = await fetch(url, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "The action could not be completed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <main className="legacy-game">
      <div className="legacy-container">
        <h1 className="gamertag">{player.screenName}</h1>
        <nav className="dashboard-tabs" aria-label="Player dashboard">
          {(["profile", "inventory", "loot", "gallery"] as const).map((tab) => (
            <button
              className={section === tab ? "current" : ""}
              key={tab}
              onClick={() => setSection(tab)}
              type="button"
            >
              {tab}
              {tab === "loot" && unclaimed.length > 0 ? ` (${unclaimed.length})` : ""}
            </button>
          ))}
        </nav>

        {error ? <p className="game-error">{error}</p> : null}
        {payout.intervals > 0 && (payout.money > 0 || payout.xp > 0) ? (
          <p className="game-payout">
            gallery earnings: +${payout.money.toLocaleString()} and +
            {payout.xp.toLocaleString()}xp
          </p>
        ) : null}

        {section === "profile" ? (
          <section className="player-profile">
            <div className="xp-bar">
              <div
                className="xp-level"
                style={{
                  width: `${Math.min(
                    (player.xp / Math.max(player.xpGoal, 1)) * 100,
                    100,
                  )}%`,
                }}
              />
              <span>level {player.level}</span>
              <strong>
                {player.xp.toLocaleString()} / {player.xpGoal.toLocaleString()}
              </strong>
            </div>
            <table>
              <tbody>
                <ProfileRow
                  label="bank balance:"
                  value={`$${player.bankBalance.toLocaleString()}`}
                />
                <ProfileRow
                  label="lottery tickets:"
                  value={player.lotteryTickets.toLocaleString()}
                />
                <ProfileRow
                  label="paintings owned:"
                  value={ownedCount.toLocaleString()}
                />
                <ProfileRow
                  label="inventory space available:"
                  value={Math.max(player.inventoryCap - ownedCount, 0)}
                />
                <ProfileRow
                  label="items exhibited:"
                  value={`${displayed.length} (${player.displayCap} max)`}
                />
                <ProfileRow
                  label="current exhibition value:"
                  value={`$${galleryRates.value.toLocaleString()}`}
                />
                <ProfileRow
                  label="display earnings per hour:"
                  value={`$${galleryRates.moneyPerHour.toLocaleString()}`}
                />
                <ProfileRow
                  label="xp per hour:"
                  value={galleryRates.xpPerHour.toLocaleString()}
                />
              </tbody>
            </table>
          </section>
        ) : null}

        {section === "loot" ? (
          <section className="random-drop">
            <button
              className={dropReady ? "enabled" : "disabled"}
              disabled={!dropReady || pending}
              onClick={() => act("/api/play/drop")}
              type="button"
            >
              {now === 0
                ? "checking daily drop..."
                : dropReady
                  ? "get daily drop!"
                  : countdown(nextDrop - now)}
            </button>
            {unclaimed.length === 0 ? (
              <p className="empty-state">You have no unclaimed artwork.</p>
            ) : (
              <div className="item-grid">
                {unclaimed.map((item) => (
                  <ArtworkCard
                    actions={
                      <>
                        <button
                          disabled={pending}
                          onClick={() =>
                            act(`/api/play/items/${item._id}/claim`)
                          }
                          title="add to inventory"
                          type="button"
                        >
                          + claim
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => act(`/api/play/items/${item._id}/sell`)}
                          title="sell immediately"
                          type="button"
                        >
                          sell ${item.values.sell.toLocaleString()}
                        </button>
                        <button
                          disabled={pending}
                          onClick={() =>
                            act(`/api/play/items/${item._id}/decline`)
                          }
                          title="remove from game"
                          type="button"
                        >
                          × decline
                        </button>
                      </>
                    }
                    item={item}
                    key={item._id}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {section === "inventory" ? (
          <section className="inventory">
            <InventorySection
              emptyText="Your inventory is empty."
              items={inventory}
              title="inventory"
              actions={(item) => (
                <>
                  <button
                    disabled={pending}
                    onClick={() => act(`/api/play/items/${item._id}/display`)}
                    type="button"
                  >
                    display
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => act(`/api/play/items/${item._id}/sell`)}
                    type="button"
                  >
                    sell ${item.values.sell.toLocaleString()}
                  </button>
                </>
              )}
            />
            <InventorySection
              emptyText="No works are currently on display."
              items={displayed}
              title={`on display (${displayed.length}/${player.displayCap})`}
              actions={(item) => (
                <button
                  disabled={pending}
                  onClick={() =>
                    act(`/api/play/items/${item._id}/undisplay`)
                  }
                  type="button"
                >
                  take down
                </button>
              )}
            />
          </section>
        ) : null}

        {section === "gallery" ? (
          <section className="player-gallery">
            <div className="gallery-summary">
              <span>exhibition value: ${galleryRates.value.toLocaleString()}</span>
              <span>
                ${galleryRates.moneyPerHour.toLocaleString()}/hr.
              </span>
              <span>{galleryRates.xpPerHour.toLocaleString()}xp/hr.</span>
            </div>
            <div className="gallery-window">
              <div className="gallery-wall">
                {displayed.length === 0 ? (
                  <p className="empty-gallery">Your gallery walls are empty.</p>
                ) : (
                  displayed.map((item) => (
                    <div className="painting-container" key={item._id}>
                      <button
                        className="framed-painting"
                        disabled={pending}
                        onClick={() =>
                          act(`/api/play/items/${item._id}/undisplay`)
                        }
                        style={{
                          aspectRatio: `${item.artwork_data.width} / ${item.artwork_data.height}`,
                          backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
                        }}
                        title="remove from gallery"
                        type="button"
                      />
                      <div className="placard">
                        <p>{item.artwork_data.title}</p>
                        <p>
                          {item.artwork_data.artist}, {item.artwork_data.date}
                        </p>
                        <p className={item.artwork_data.rarity}>
                          {item.artwork_data.rarity}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="gallery-floor" />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function InventorySection({
  title,
  emptyText,
  items,
  actions,
}: {
  title: string;
  emptyText: string;
  items: GameItem[];
  actions: (item: GameItem) => React.ReactNode;
}) {
  return (
    <section className="inventory-section">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="empty-state">{emptyText}</p>
      ) : (
        <div className="item-grid">
          {items.map((item) => (
            <ArtworkCard
              actions={actions(item)}
              item={item}
              key={item._id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td className="af-color highlight">{value}</td>
    </tr>
  );
}

function ArtworkCard({
  item,
  actions,
}: {
  item: GameItem;
  actions?: React.ReactNode;
}) {
  const cardTypes = [
    item.unlocked ? "unlocked" : "",
    item.foil ? "foil" : "",
    item.seasonal ? "seasonal" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className="item-info">
      <div
        className={`card-container ${item.artwork_data.rarity}-item`}
        style={{
          backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
        }}
      >
        <div className={`card-header ${cardTypes}`}>
          <p className="item-title">{item.artwork_data.title}</p>
          <p>{item.artwork_data.artist}</p>
          <div className="header-details">
            <p>{item.artwork_data.date}</p>
            <p>{item.artwork_data.medium}</p>
            <p>
              {item.artwork_data.height} × {item.artwork_data.width} cm
            </p>
            <p>drop chance: {item.odds}</p>
            <p>
              condition:{" "}
              <span style={{ color: ratingColor(item.condition) }}>
                {Math.round(item.condition * 100)}%
              </span>
            </p>
            <p>estimated value: ${item.values.actual.toLocaleString()}</p>
            <p className="verified-text">✓ verified</p>
          </div>
        </div>
        <div className={`card-footer ${cardTypes}`}>
          <div className="attribute-area">
            <AttributeGroup attributes={item.attributes.unlocked} type="unlocked" />
            <AttributeGroup attributes={item.attributes.locked} type="locked" />
            <AttributeGroup attributes={item.attributes.special} type="special" />
          </div>
          <strong>lvl {item.level}</strong>
        </div>
      </div>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </article>
  );
}

function AttributeGroup({
  attributes,
  type,
}: {
  attributes: GameItem["attributes"]["unlocked"];
  type: "unlocked" | "locked" | "special";
}) {
  if (attributes.length === 0) return null;

  return (
    <span className="attribute-group">
      {attributes.map((attribute) => {
        const rating = Math.round((attribute.value ?? 0) * 100);
        return (
          <span className="attribute-tooltip" key={attribute._id}>
            <i
              aria-label={`${attribute.npc_name}, ${rating}% attraction, ${type}`}
              className={`fa ${attribute.icon} attribute ${type}`}
              style={{ color: ratingColor(attribute.value ?? 0) }}
            />
            <span className="attribute-tooltip-text">
              <strong>{attribute.npc_name}</strong>
              <span>{rating}% attraction</span>
              <span>{type}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function countdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function ratingColor(value: number): string {
  const red = Math.round(255 * (1 - value));
  const green = Math.round(204 * value);
  return `rgb(${red}, ${green}, 30)`;
}

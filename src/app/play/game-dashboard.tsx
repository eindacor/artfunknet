"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import type { GalleryRates } from "@/server/collection-gameplay";
import type { GameItem } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";
import { getDisplayPermission } from "@/server/item-permissions";
import { getRerollMinimum } from "@/server/item-reroll";
import {
  NPC_QUALITIES,
  type GalleryNpc,
  type NpcQuality,
} from "@/server/npc-gameplay";
import type {
  PlayerNotification,
  PlayerNotificationKind,
} from "@/server/player-notifications";

import NotificationCenter from "./notification-center";

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
  npcsMet: Partial<Record<NpcQuality, number>>;
};

type NpcView = Omit<GalleryNpc, "spawned_at" | "expiration"> & {
  spawned_at: string;
  expiration: string;
  alreadyMet: boolean;
};

type NpcSpawnOption = {
  id: string;
  icon: string;
  name: string;
};

const ATTRIBUTE_TYPE_ICONS = {
  special: { icon: "fa-star", label: "Special attribute" },
  locked: { icon: "fa-lock", label: "Locked attribute" },
  unlocked: null,
} as const;

export default function GameDashboard({
  player,
  items,
  galleryRates,
  initialNotifications,
  impersonating,
  npcSpawnOptions,
  dailyDropCooldownMinutes,
  debugEnabled,
  npcs,
}: {
  player: PlayerView;
  items: HydratedGameItem[];
  galleryRates: GalleryRates;
  initialNotifications: PlayerNotification[];
  impersonating: boolean;
  npcSpawnOptions: NpcSpawnOption[];
  dailyDropCooldownMinutes: number;
  debugEnabled: boolean;
  npcs: NpcView[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<
    "profile" | "inventory" | "loot" | "gallery"
  >(
    items.some((item) => item.status === "unclaimed") ? "loot" : "profile",
  );
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [npcSpawnQuality, setNpcSpawnQuality] =
    useState<NpcQuality>("bronze");
  const [spawningNpc, setSpawningNpc] = useState<string | null>(null);
  const [rerollSession, setRerollSession] = useState<{
    item: HydratedGameItem;
    bankBalance: number;
  } | null>(null);
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

  async function addNotification(
    message: string,
    kind: PlayerNotificationKind,
  ) {
    try {
      const response = await fetch("/api/play/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, kind }),
      });
      const body = (await response.json()) as {
        error?: string;
        notification?: PlayerNotification;
      };
      if (!response.ok || !body.notification) {
        setError(body.error ?? "The notification could not be saved.");
        return;
      }
      const savedNotification = body.notification;
      setNotifications((current) => [
        savedNotification,
        ...current.filter(
          (notification) => notification._id !== savedNotification._id,
        ),
      ]);
    } catch (notificationError) {
      setError(
        notificationError instanceof Error
          ? notificationError.message
          : "The notification could not be saved.",
      );
    }
  }

  function act(url: string) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch(url, { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        const message = body.error ?? "The action could not be completed.";
        setError(message);
        await addNotification(message, "error");
        return;
      }

      if (body.message) {
        setNotice(body.message);
        await addNotification(body.message, "success");
      }
      router.refresh();
    });
  }

  async function spawnTestNpc(option: NpcSpawnOption) {
    setSpawningNpc(option.id);
    try {
      const response = await fetch(
        "/api/admin/test-accounts/spawn-npc",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            attributeId: option.id,
            quality: npcSpawnQuality,
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The NPC could not be spawned.");
      }
      const message =
        body.message ??
        `Spawned a ${npcSpawnQuality} ${option.name} visitor.`;
      await addNotification(message, "success");
      router.refresh();
    } catch (spawnError) {
      const message =
        spawnError instanceof Error
          ? spawnError.message
          : "The NPC could not be spawned.";
      await addNotification(message, "error");
    } finally {
      setSpawningNpc(null);
    }
  }

  return (
    <main className="legacy-game">
      <div className="legacy-container">
        <div className="game-heading">
          <h1 className="gamertag">{player.screenName}</h1>
          <NotificationCenter
            notifications={notifications}
            onChange={setNotifications}
          />
        </div>
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

        <p
          aria-live={error ? "assertive" : "polite"}
          className="dashboard-live-region"
        >
          {error || notice}
        </p>

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
                <ProfileRow
                  label="visitors met:"
                  value={Object.values(player.npcsMet).reduce(
                    (sum, count) => sum + (count ?? 0),
                    0,
                  )}
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
            {debugEnabled ? (
              <button
                className="debug-raw-drop"
                disabled={pending}
                onClick={() => act("/api/play/drop/debug-raw")}
                type="button"
              >
                generate raw-map debug drop
              </button>
            ) : null}
            {unclaimed.length === 0 ? (
              <p className="empty-state">You have no unclaimed artwork.</p>
            ) : (
              <div className="item-grid">
                {unclaimed.map((item) => (
                  <ArtworkCard
                    actions={
                      <>
                        <ItemActionButton
                          icon="fa-plus"
                          label="Add to inventory"
                          disabled={pending}
                          onClick={() =>
                            act(`/api/play/items/${item._id}/claim`)
                          }
                        />
                        <ItemActionButton
                          icon="fa-usd"
                          label={`Sell immediately for $${item.values.sell.toLocaleString()}`}
                          disabled={pending}
                          onClick={() => act(`/api/play/items/${item._id}/sell`)}
                        />
                        <ItemActionButton
                          icon="fa-times"
                          label="Decline and remove from game"
                          disabled={pending}
                          onClick={() =>
                            act(`/api/play/items/${item._id}/decline`)
                          }
                        />
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
              emptyText="No works are currently on display."
              items={displayed}
              title={`on display (${displayed.length}/${player.displayCap})`}
              actions={(item) => (
                <ItemActionButton
                  icon="fa-arrow-down"
                  label="Take down from gallery"
                  disabled={pending}
                  onClick={() =>
                    act(`/api/play/items/${item._id}/undisplay`)
                  }
                />
              )}
            />
            <InventorySection
              emptyText="Your inventory is empty."
              items={inventory}
              title="inventory"
              actions={(item) => {
                const displayPermission = getDisplayPermission(
                  item,
                  items,
                  player.displayCap,
                );
                return (
                  <>
                    <ItemActionButton
                      icon="fa-picture-o"
                      label="Display in gallery"
                      disabled={pending || !displayPermission.allowed}
                      disabledReason={
                        displayPermission.allowed
                          ? undefined
                          : displayPermission.reason
                      }
                      onDisabledClick={
                        displayPermission.allowed
                          ? undefined
                          : () =>
                              addNotification(
                                displayPermission.reason,
                                "warning",
                              )
                      }
                      onClick={() =>
                        act(`/api/play/items/${item._id}/display`)
                      }
                    />
                    <ItemActionButton
                      icon="fa-magic"
                      label="Modify attributes"
                      disabled={pending}
                      onClick={() =>
                        setRerollSession({
                          item,
                          bankBalance: player.bankBalance,
                        })
                      }
                    />
                    <ItemActionButton
                      icon="fa-usd"
                      label={`Sell for $${item.values.sell.toLocaleString()}`}
                      disabled={pending}
                      onClick={() => act(`/api/play/items/${item._id}/sell`)}
                    />
                  </>
                );
              }}
            />
          </section>
        ) : null}

        {section === "gallery" ? (
          <section className="player-gallery">
            {impersonating ? (
              <div className="admin-gallery-controls">
                <strong>admin test controls</strong>
                <fieldset>
                  <legend>visitor quality</legend>
                  {NPC_QUALITIES.map((quality) => (
                    <label key={quality}>
                      <input
                        checked={npcSpawnQuality === quality}
                        disabled={spawningNpc !== null}
                        name="npc-quality"
                        onChange={() => setNpcSpawnQuality(quality)}
                        type="radio"
                        value={quality}
                      />
                      <span>{quality}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="admin-npc-spawn-options">
                  <span>spawn visitor type</span>
                  <div>
                    {npcSpawnOptions.length === 0 ? (
                      <span>No active NPC types are available.</span>
                    ) : (
                      npcSpawnOptions.map((option) => (
                        <button
                          disabled={spawningNpc !== null}
                          key={option.id}
                          onClick={() => spawnTestNpc(option)}
                          type="button"
                        >
                          <i
                            aria-hidden="true"
                            className={`fa ${option.icon}`}
                          />
                          {spawningNpc === option.id
                            ? "spawning..."
                            : option.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="gallery-summary">
              <span>exhibition value: ${galleryRates.value.toLocaleString()}</span>
              <span>
                ${galleryRates.moneyPerHour.toLocaleString()}/hr.
              </span>
              <span>{galleryRates.xpPerHour.toLocaleString()}xp/hr.</span>
            </div>
            <div className="npc-area">
              {npcs.length === 0 ? (
                <p className="empty-state">
                  No visitors are currently in the gallery.
                </p>
              ) : (
                npcs.map((npc) => (
                  <button
                    className={`gallery-npc ${npc.quality} ${
                      npc.alreadyMet ? "disabled" : "enabled"
                    }`}
                    disabled={pending || npc.alreadyMet}
                    key={npc._id}
                    onClick={() =>
                      act(`/api/play/npcs/${npc._id}/meet`)
                    }
                    title={
                      npc.alreadyMet
                        ? `${npc.npc_name} already met`
                        : `meet ${npc.npc_name}`
                    }
                    type="button"
                  >
                    <i className={`fa ${npc.icon}`} />
                    <span>{npc.npc_name}</span>
                  </button>
                ))
              )}
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
                          aspectRatio: `${item.artwork.width} / ${item.artwork.height}`,
                          backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
                        }}
                        title="remove from gallery"
                        type="button"
                      />
                      <div className="placard">
                        <p>{item.artwork.title}</p>
                        <p>
                          {item.artwork.artist}, {item.artwork.date}
                        </p>
                        <p className={item.artwork.rarity}>
                          {item.artwork.rarity}
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

        {rerollSession ? (
          <RerollDialog
            bankBalance={rerollSession.bankBalance}
            item={rerollSession.item}
            onClose={() => setRerollSession(null)}
            onNotify={addNotification}
            onRerolled={(item, nextBankBalance) => {
              setRerollSession({
                item,
                bankBalance: nextBankBalance,
              });
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function RerollDialog({
  item,
  bankBalance,
  onClose,
  onNotify,
  onRerolled,
}: {
  item: HydratedGameItem;
  bankBalance: number;
  onClose: () => void;
  onNotify: (
    message: string,
    kind: PlayerNotificationKind,
  ) => Promise<void>;
  onRerolled: (item: HydratedGameItem, bankBalance: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canAfford = bankBalance >= item.reroll_cost;

  useEffect(() => {
    const dialog = dialogRef.current;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    returnFocusRef.current?.focus();
    onClose();
  }

  async function reroll(
    mode: "value" | "attribute",
    attributeId: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/play/items/${item._id}/reroll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, attributeId }),
      });
      const body = (await response.json()) as {
        error?: string;
        cost?: number;
        bankBalance?: number;
        item?: GameItem;
      };
      if (
        !response.ok ||
        body.cost === undefined ||
        body.bankBalance === undefined ||
        !body.item
      ) {
        throw new Error(body.error ?? "The reroll could not be completed.");
      }

      const nextItem: HydratedGameItem = {
        ...item,
        ...body.item,
        artwork: item.artwork,
      };
      onRerolled(nextItem, body.bankBalance);
      const message = `${mode === "value" ? "Value rerolled" : "Attribute replaced"} for $${body.cost.toLocaleString()}.`;
      setNotice(message);
      await onNotify(message, "success");
    } catch (rerollError) {
      const message =
        rerollError instanceof Error
          ? rerollError.message
          : "The reroll could not be completed.";
      setError(message);
      await onNotify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  const attributeGroups = [
    ["special", item.attributes.special],
    ["locked", item.attributes.locked],
    ["unlocked", item.attributes.unlocked],
  ] as const;

  return (
    <dialog
      aria-describedby="reroll-description"
      aria-labelledby="reroll-title"
      className="reroll-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const inside =
          event.clientX >= bounds.left &&
          event.clientX <= bounds.right &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom;
        if (!inside) closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="reroll-dialog-content">
        <header className="reroll-dialog-header">
          <div className="reroll-artwork-summary">
            <ArtworkThumbnail
              alt={`${item.artwork.title} by ${item.artwork.artist}`}
              artworkId={item.artwork_id}
              className="reroll-artwork-thumbnail"
            />
            <div>
              <p className="reroll-dialog-kicker">modify artwork</p>
              <h2 id="reroll-title">
                <span>{item.artwork.title}</span> by{" "}
                <span>{item.artwork.artist}</span>
              </h2>
            </div>
          </div>
          <button
            aria-label="Close reroll dialog"
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>

        <p id="reroll-description" className="reroll-dialog-description">
          Reroll an attraction value, or replace an unlocked attribute. Every
          modification increases the cost of the next roll.
        </p>

        <dl className="reroll-summary">
          <div>
            <dt>bank balance</dt>
            <dd>${bankBalance.toLocaleString()}</dd>
          </div>
          <div>
            <dt>reroll cost</dt>
            <dd>${item.reroll_cost.toLocaleString()}</dd>
          </div>
          <div>
            <dt>reroll count</dt>
            <dd>{item.roll_count}</dd>
          </div>
          <div>
            <dt>current value</dt>
            <dd>${item.values.actual.toLocaleString()}</dd>
          </div>
          <div>
            <dt>spent rerolling</dt>
            <dd>${(item.reroll_spent ?? 0).toLocaleString()}</dd>
          </div>
        </dl>

        <div className="reroll-attributes">
          {attributeGroups.map(([type, attributes]) =>
            attributes.map((attribute) => {
              const typeIcon = ATTRIBUTE_TYPE_ICONS[type];
              const disabledReason = busy
                ? "A reroll is already in progress."
                : !canAfford
                  ? "You do not have enough money for this reroll."
                  : undefined;

              return (
                <div
                  className="reroll-attribute-row"
                  key={`${type}-${attribute._id}`}
                >
                  <div className="reroll-attribute-icons">
                    <i
                      aria-hidden="true"
                      className={`fa ${attribute.icon} reroll-attribute-icon ${
                        type === "special" ? "special" : ""
                      }`}
                      style={{ color: ratingColor(attribute.value ?? 0) }}
                    />
                    {typeIcon ? (
                      <i
                        aria-label={typeIcon.label}
                        className={`fa ${typeIcon.icon} reroll-attribute-type ${type}`}
                        role="img"
                        title={typeIcon.label}
                      />
                    ) : null}
                  </div>
                  <div className="reroll-attribute-info">
                    <strong>{attribute.npc_name}</strong>
                  </div>
                  <div className="reroll-attribute-rating">
                    <strong>{Math.floor((attribute.value ?? 0) * 100)}%</strong>
                    <span>
                      {Math.floor(getRerollMinimum(item, type) * 100)}% minimum
                    </span>
                  </div>
                  <div className="reroll-attribute-actions">
                    <ItemActionButton
                      disabled={Boolean(disabledReason)}
                      disabledReason={disabledReason}
                      icon="fa-refresh"
                      label={`Reroll ${attribute.npc_name} value`}
                      onClick={() => reroll("value", attribute._id)}
                    />
                    {type === "unlocked" ? (
                      <ItemActionButton
                        disabled={Boolean(disabledReason)}
                        disabledReason={disabledReason}
                        icon="fa-exchange"
                        label={`Replace ${attribute.npc_name} attribute`}
                        onClick={() => reroll("attribute", attribute._id)}
                      />
                    ) : null}
                  </div>
                </div>
              );
            }),
          )}
        </div>

        {!canAfford ? (
          <p className="reroll-dialog-error">
            You do not have enough money for the next reroll.
          </p>
        ) : null}
        {error ? (
          <p className="reroll-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <p aria-live="polite" className="reroll-dialog-notice">
          {notice}
        </p>
      </div>
    </dialog>
  );
}

function ItemActionButton({
  icon,
  label,
  disabled,
  disabledReason,
  onDisabledClick,
  onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  disabledReason?: string;
  onDisabledClick?: () => void | Promise<void>;
  onClick: () => void;
}) {
  const reason =
    disabledReason ?? (disabled ? "Another action is being processed." : "");
  const accessibleLabel = reason ? `${label}. Unavailable: ${reason}` : label;

  return (
    <button
      aria-disabled={disabled}
      aria-label={accessibleLabel}
      className="item-action-button"
      data-tooltip={reason || label}
      onClick={() => {
        if (disabled) {
          void onDisabledClick?.();
          return;
        }
        onClick();
      }}
      type="button"
    >
      <i aria-hidden="true" className={`fa ${icon}`} />
    </button>
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
  items: HydratedGameItem[];
  actions: (item: HydratedGameItem) => React.ReactNode;
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
  item: HydratedGameItem;
  actions?: React.ReactNode;
}) {
  const cardTypes = [
    item.unlocked ? "card-effect-unlocked" : "",
    item.foil ? "card-effect-foil" : "",
    item.seasonal ? "card-effect-seasonal" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className="item-info">
      <div
        className={`card-container ${item.artwork.rarity}-item`}
        style={{
          backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
        }}
      >
        <div className={`card-header ${cardTypes}`}>
          <p className="item-title">{item.artwork.title}</p>
          <p>{item.artwork.artist}</p>
          <div className="header-details">
            <p>{item.artwork.date}</p>
            <CardSignature item={item} />
            <p>{item.artwork.medium}</p>
            <p>
              {item.artwork.height} × {item.artwork.width} cm
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

function CardSignature({ item }: { item: HydratedGameItem }) {
  return (
    <p className="card-signature" aria-label="Card signature">
      <strong className={`signature-${item.artwork.rarity}`}>
        {item.artwork.rarity}
      </strong>
      {item.foil ? <span className="signature-foil"> foil</span> : null}
      {item.seasonal ? (
        <span className="signature-seasonal"> seasonal</span>
      ) : null}
      {item.lottery ? (
        <span className="signature-lottery"> lottery {item.lottery}</span>
      ) : null}
      {item.original ? (
        <span className="signature-original"> original</span>
      ) : null}
      {item.vintage ? (
        <span className="signature-vintage"> vintage</span>
      ) : null}
      {item.unlocked ? (
        <span className="signature-unlocked"> unlocked</span>
      ) : null}
      {item.patreon ? (
        <span className="signature-patreon"> patreon</span>
      ) : null}
    </p>
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
  return `rgb(${red}, 0, 0)`;
}

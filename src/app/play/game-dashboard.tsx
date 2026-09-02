"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import ItemCard from "@/components/item-cards/item-card";
import MintLossConfirmationDialog from "@/components/item-cards/mint-loss-confirmation-dialog";
import { resolveCardRendererId } from "@/components/item-cards/selection";
import { ratingColor } from "@/components/item-cards/shared";
import StandardItemDialog from "@/components/item-cards/standard-item-dialog";
import type {
  CardLegendaryAttribute,
  ItemCardProps,
} from "@/components/item-cards/types";
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
import type { NpcRewardInteraction } from "@/server/standard-npc-rewards";

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
  cardRenderer?: string;
  ownedCardRenderers: string[];
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

type LegendaryAttributeView = CardLegendaryAttribute;

type ArtworkOfferItem = HydratedGameItem & {
  alreadyOwned: boolean;
  price?: number;
};

type CollectorResult = {
  type: "art-collector-result";
  npcName: string;
  quality: NpcQuality;
  item: HydratedGameItem;
  forgeryCaught: boolean;
  keptItem: boolean;
  rewardType: "money" | "xp" | null;
  rewardAmount: number;
  bonusOffers: number;
};

type ArtExpertResult = {
  type: "art-expert-knowledge";
  npcName: string;
  quality: NpcQuality;
  item: HydratedGameItem;
  knowledge: Record<
    | "historical_data"
    | "contextual_understanding"
    | "technical_comprehension"
    | "artistic_vision",
    number
  >;
  xpBonus: number;
  bonusMoney: number;
};

const ATTRIBUTE_TYPE_ICONS = {
  special: { icon: "fa-star", label: "Special attribute" },
  locked: { icon: "fa-lock", label: "Locked attribute" },
  unlocked: null,
} as const;

export default function GameDashboard({
  activeRendererIds,
  rendererPrices,
  player,
  items,
  galleryRates,
  initialNotifications,
  impersonating,
  canRerollDisplayed,
  legendaryAttributes,
  npcSpawnOptions,
  dailyDropCooldownMinutes,
  dealerPriceMultiplier,
  debugEnabled,
  npcs,
}: {
  activeRendererIds: string[];
  rendererPrices: ItemCardProps["rendererPrices"];
  player: PlayerView;
  items: HydratedGameItem[];
  galleryRates: GalleryRates;
  initialNotifications: PlayerNotification[];
  impersonating: boolean;
  canRerollDisplayed: boolean;
  legendaryAttributes: LegendaryAttributeView[];
  npcSpawnOptions: NpcSpawnOption[];
  dailyDropCooldownMinutes: number;
  dealerPriceMultiplier: number;
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
  const [meetingNpc, setMeetingNpc] = useState<string | null>(null);
  const [artworkOfferSession, setArtworkOfferSession] = useState<{
    type: "art-donor-offer" | "art-dealer-offer";
    npcName: string;
    quality: NpcQuality;
    items: ArtworkOfferItem[];
  } | null>(null);
  const [collectorResult, setCollectorResult] =
    useState<CollectorResult | null>(null);
  const [artExpertResult, setArtExpertResult] =
    useState<ArtExpertResult | null>(null);
  const [npcRewardEffects, setNpcRewardEffects] = useState<
    Record<string, NpcRewardInteraction & { animationId: number }>
  >({});
  const [rerollSession, setRerollSession] = useState<{
    item: HydratedGameItem;
    bankBalance: number;
  } | null>(null);
  const [galleryItemDetails, setGalleryItemDetails] =
    useState<HydratedGameItem | null>(null);
  const [mintConfirmation, setMintConfirmation] = useState<{
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const unclaimed = useMemo(
    () =>
      items.filter(
        (item) =>
          item.status === "unclaimed" || item.status === "for_sale",
      ),
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
  const ownedArtworkIds = useMemo(
    () =>
      new Set(
        items
          .filter(
            (item) =>
              item.status === "claimed" || item.status === "displayed",
          )
          .map((item) => item.artwork_id),
      ),
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

  function requestMintMutation(
    item: HydratedGameItem,
    actionLabel: string,
    onConfirm: () => void,
  ) {
    if (!item.mint) {
      onConfirm();
      return;
    }
    setMintConfirmation({ actionLabel, onConfirm });
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

  async function meetNpc(npc: NpcView) {
    setMeetingNpc(npc._id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/play/npcs/${npc._id}/meet`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        interaction?: {
          type: "art-donor-offer" | "art-dealer-offer";
          npcName: string;
          quality: NpcQuality;
          items: ArtworkOfferItem[];
        } | CollectorResult | ArtExpertResult | NpcRewardInteraction;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The visitor interaction failed.");
      }
      if (
        body.interaction?.type === "art-donor-offer" ||
        body.interaction?.type === "art-dealer-offer"
      ) {
        setArtworkOfferSession({
          type: body.interaction.type,
          npcName: body.interaction.npcName,
          quality: body.interaction.quality,
          items: body.interaction.items,
        });
      } else if (body.interaction?.type === "art-collector-result") {
        setCollectorResult(body.interaction);
      } else if (body.interaction?.type === "art-expert-knowledge") {
        setArtExpertResult(body.interaction);
      } else if (
        body.interaction?.type === "npc-reward" &&
        body.interaction.presentation === "popout"
      ) {
        showNpcRewardEffect(body.interaction);
      }
      if (body.message) {
        setNotice(body.message);
        await addNotification(body.message, "success");
      }

      function showNpcRewardEffect(interaction: NpcRewardInteraction) {
        const animationId = Date.now();
        setNpcRewardEffects((current) => ({
          ...current,
          [interaction.npcId]: { ...interaction, animationId },
        }));
        window.setTimeout(() => {
          setNpcRewardEffects((current) => {
            if (current[interaction.npcId]?.animationId !== animationId) {
              return current;
            }
            const next = { ...current };
            delete next[interaction.npcId];
            return next;
          });
        }, 1_000);
      }
      router.refresh();
    } catch (meetError) {
      const message =
        meetError instanceof Error
          ? meetError.message
          : "The visitor interaction failed.";
      setError(message);
      await addNotification(message, "error");
    } finally {
      setMeetingNpc(null);
    }
  }

  function displayedItemActions(item: HydratedGameItem) {
    return (
      <>
        <ItemActionButton
          icon="fa-picture-o"
          label="Remove from gallery"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/undisplay`)}
          variant="gallery"
        />
        {canRerollDisplayed ? (
          <ItemActionButton
            icon="fa-magic"
            label="Modify displayed artwork"
            disabled={pending}
            onClick={() =>
              setRerollSession({
                item,
                bankBalance: player.bankBalance,
              })
            }
          />
        ) : null}
      </>
    );
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
                  <ItemCard
                    activeRendererIds={activeRendererIds}
                    alreadyOwned={ownedArtworkIds.has(item.artwork_id)}
                    legendaryAttributes={legendaryAttributes}
                    ownedRendererIds={player.ownedCardRenderers}
                    rendererPrices={rendererPrices}
                    permissions={{
                      canManageItem: true,
                      canCustomizeCosmetic: false,
                    }}
                    rendererId={player.cardRenderer}
                    actions={
                      item.status === "for_sale" ? (
                        <>
                          <ItemActionButton
                            icon="fa-shopping-cart"
                            label={`Purchase for $${Math.floor(
                              item.values.dealer * dealerPriceMultiplier,
                            ).toLocaleString()}`}
                            disabled={pending}
                            onClick={() =>
                              act(`/api/play/items/${item._id}/purchase`)
                            }
                          />
                          <ItemActionButton
                            icon="fa-times"
                            label="Decline dealer offer"
                            disabled={pending}
                            onClick={() =>
                              act(`/api/play/items/${item._id}/decline`)
                            }
                          />
                        </>
                      ) : (
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
                            onClick={() =>
                              act(`/api/play/items/${item._id}/sell`)
                            }
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
                      )
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
              activeRendererIds={activeRendererIds}
              emptyText="No works are currently on display."
              items={displayed}
              legendaryAttributes={legendaryAttributes}
              canCustomize
              ownedRendererIds={player.ownedCardRenderers}
              rendererPrices={rendererPrices}
              rendererId={player.cardRenderer}
              title={`on display (${displayed.length}/${player.displayCap})`}
              actions={displayedItemActions}
            />
            <InventorySection
              activeRendererIds={activeRendererIds}
              emptyText="Your inventory is empty."
              items={inventory}
              legendaryAttributes={legendaryAttributes}
              canCustomize
              ownedRendererIds={player.ownedCardRenderers}
              rendererPrices={rendererPrices}
              rendererId={player.cardRenderer}
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
                        requestMintMutation(
                          item,
                          "Displaying this artwork",
                          () => act(`/api/play/items/${item._id}/display`),
                        )
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
                      icon="fa-binoculars"
                      label={
                        item.tags.includes("for sale")
                          ? "Stop offering to Art Collectors"
                          : "Offer to Art Collectors"
                      }
                      disabled={pending}
                      onClick={() =>
                        act(`/api/play/items/${item._id}/collector-sale`)
                      }
                      variant={
                        item.tags.includes("for sale") ? "collector" : "default"
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
                  <span className="gallery-npc-slot" key={npc._id}>
                    <button
                      className={`gallery-npc ${npc.quality} ${
                        npc.alreadyMet ? "disabled" : "enabled"
                      } ${npcRewardEffects[npc._id] ? "rewarding" : ""}`}
                      disabled={
                        pending ||
                        meetingNpc !== null ||
                        npc.alreadyMet ||
                        Boolean(npcRewardEffects[npc._id])
                      }
                      onClick={() => meetNpc(npc)}
                      title={
                        npc.alreadyMet
                          ? `${npc.npc_name} already met`
                          : `meet ${npc.npc_name}`
                      }
                      type="button"
                    >
                      <i aria-hidden="true" className={`fa ${npc.icon}`} />
                      <span>{npc.npc_name}</span>
                    </button>
                    {npcRewardEffects[npc._id] ? (
                      <span
                        aria-label={
                          npcRewardEffects[npc._id].rewardType === "money"
                            ? `Received $${npcRewardEffects[npc._id].rewardAmount.toLocaleString()}`
                            : `Received ${npcRewardEffects[npc._id].rewardAmount.toLocaleString()} experience points`
                        }
                        className={`npc-reward-popout ${
                          npcRewardEffects[npc._id].rewardType
                        }`}
                        key={npcRewardEffects[npc._id].animationId}
                        role="status"
                      >
                        <i
                          aria-hidden="true"
                          className={`fa ${
                            npcRewardEffects[npc._id].rewardType === "money"
                              ? "fa-usd"
                              : "fa-heart"
                          }`}
                        />
                      </span>
                    ) : null}
                  </span>
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
                        onClick={() => setGalleryItemDetails(item)}
                        style={{
                          aspectRatio: `${item.artwork.width} / ${item.artwork.height}`,
                          backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
                        }}
                        title={`View details for ${item.artwork.title}`}
                        type="button"
                      />
                      <div className="placard">
                        <p>{item.artwork.title}</p>
                        <p>
                          {item.artwork.artist}, {item.artwork.date}
                        </p>
                        <p
                          className={`rarity-text ${item.artwork.rarity}`}
                        >
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
            legendaryAttributes={legendaryAttributes}
            onClose={() => setRerollSession(null)}
            onNotify={addNotification}
            onRerolled={(item, nextBankBalance) => {
              setRerollSession({
                item,
                bankBalance: nextBankBalance,
              });
              router.refresh();
            }}
            onSelected={(item) => {
              setRerollSession((current) =>
                current ? { ...current, item } : current,
              );
              router.refresh();
            }}
          />
        ) : null}
        {mintConfirmation ? (
          <MintLossConfirmationDialog
            actionLabel={mintConfirmation.actionLabel}
            onCancel={() => setMintConfirmation(null)}
            onConfirm={mintConfirmation.onConfirm}
          />
        ) : null}
        {galleryItemDetails ? (
          <StandardItemDialog
            actions={displayedItemActions(galleryItemDetails)}
            activeRendererIds={activeRendererIds}
            currentRendererId={resolveCardRendererId({
              itemRendererId: galleryItemDetails.card_renderer,
              preferredRendererId: player.cardRenderer,
            })}
            item={galleryItemDetails}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setGalleryItemDetails(null)}
            onRendererSelected={(rendererId, nextItem) => {
              setGalleryItemDetails((current) =>
                current
                  ? {
                      ...current,
                      ...nextItem,
                      artwork: current.artwork,
                      card_renderer: rendererId,
                    }
                  : current,
              );
              router.refresh();
            }}
            ownedRendererIds={player.ownedCardRenderers}
            rendererPrices={rendererPrices}
            permissions={{
              canManageItem: true,
              canCustomizeCosmetic: true,
            }}
          />
        ) : null}
        {artworkOfferSession ? (
          <ArtworkOfferDialog
            interactionType={artworkOfferSession.type}
            items={artworkOfferSession.items}
            npcName={artworkOfferSession.npcName}
            onClose={() => setArtworkOfferSession(null)}
            onItemsChange={(items) =>
              setArtworkOfferSession((current) =>
                current ? { ...current, items } : current,
              )
            }
            onNotify={addNotification}
            quality={artworkOfferSession.quality}
          />
        ) : null}
        {collectorResult ? (
          <CollectorResultDialog
            result={collectorResult}
            onClose={() => setCollectorResult(null)}
          />
        ) : null}
        {artExpertResult ? (
          <ArtExpertResultDialog
            result={artExpertResult}
            onClose={() => setArtExpertResult(null)}
          />
        ) : null}
      </div>
    </main>
  );
}

const KNOWLEDGE_LABELS = {
  historical_data: "historical data",
  contextual_understanding: "contextual understanding",
  technical_comprehension: "technical comprehension",
  artistic_vision: "artistic vision",
} as const;

function ArtExpertResultDialog({
  result,
  onClose,
}: {
  result: ArtExpertResult;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }

  return (
    <dialog
      aria-labelledby="art-expert-result-title"
      className="art-expert-result-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="art-expert-result-content">
        <header>
          <div>
            <p className="reroll-dialog-kicker">{result.quality} visitor</p>
            <h2 id="art-expert-result-title">{result.npcName}</h2>
          </div>
          <button
            aria-label="Close Art Expert result"
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <div className="art-expert-result-artwork">
          <ArtworkThumbnail
            alt={`${result.item.artwork.title} by ${result.item.artwork.artist}`}
            artworkId={result.item.artwork_id}
            className="art-expert-result-thumbnail"
          />
          <p>
            The Art Expert shares their wisdom about{" "}
            <strong>{result.item.artwork.title}</strong> by{" "}
            <strong>{result.item.artwork.artist}</strong>.
          </p>
        </div>
        <section className="art-expert-knowledge">
          <h3>Knowledge gained</h3>
          {Object.entries(KNOWLEDGE_LABELS).map(
            ([type, label], index) => {
              const amount =
                result.knowledge[type as keyof ArtExpertResult["knowledge"]];
              return amount > 0 ? (
                <p
                  key={type}
                  style={{
                    color: `rgb(${Math.floor(150 * Math.pow(0.8, 3 - index))}, ${Math.floor(230 * Math.pow(0.8, 3 - index))}, 0)`,
                  }}
                >
                  <span>{label}</span>
                  <strong>+{amount.toLocaleString()}</strong>
                </p>
              ) : null;
            },
          )}
        </section>
        {result.xpBonus > 0 ? (
          <p>
            Your zero-count collection also earned{" "}
            <strong>{result.xpBonus.toLocaleString()} XP</strong>
            {result.bonusMoney > 0
              ? ` and $${result.bonusMoney.toLocaleString()}`
              : ""}
            .
          </p>
        ) : null}
        <div className="collector-result-actions">
          <ItemActionButton
            disabled={false}
            icon="fa-thumbs-up"
            label="Acknowledge Art Expert result"
            onClick={closeDialog}
          />
        </div>
      </div>
    </dialog>
  );
}

function CollectorResultDialog({
  result,
  onClose,
}: {
  result: CollectorResult;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

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

  const outcome = result.forgeryCaught
    ? `${result.npcName} identified this artwork as a forgery. You received no reward and kept the identified item.`
    : result.keptItem
      ? `${result.npcName} offered ${
          result.rewardType === "xp"
            ? `${result.rewardAmount.toLocaleString()} XP`
            : `$${result.rewardAmount.toLocaleString()}`
        } and allowed you to keep the artwork.`
      : `${result.npcName} collected this artwork for ${
          result.rewardType === "xp"
            ? `${result.rewardAmount.toLocaleString()} XP`
            : `$${result.rewardAmount.toLocaleString()}`
        }.`;

  return (
    <dialog
      aria-labelledby="collector-result-title"
      className="collector-result-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="collector-result-content">
        <header>
          <div>
            <p className="reroll-dialog-kicker">{result.quality} visitor</p>
            <h2 id="collector-result-title">{result.npcName}</h2>
          </div>
          <button
            aria-label="Close Collector result"
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <div className="collector-result-artwork">
          <ArtworkThumbnail
            alt={`${result.item.artwork.title} by ${result.item.artwork.artist}`}
            artworkId={result.item.artwork_id}
            className="collector-result-thumbnail"
          />
          <div>
            <strong>{result.item.artwork.title}</strong>
            <span>{result.item.artwork.artist}</span>
            <span>
              level {result.item.level} · condition{" "}
              {Math.round(result.item.condition * 100)}%
            </span>
            <span>
              estimated value ${result.item.values.actual.toLocaleString()}
            </span>
          </div>
        </div>
        <p className={result.forgeryCaught ? "collector-forgery-result" : ""}>
          {outcome}
        </p>
        {result.bonusOffers > 0 ? (
          <p>
            The Collector also left {result.bonusOffers} additional artwork
            {result.bonusOffers === 1 ? "" : "s"} for sale in your loot.
          </p>
        ) : null}
        <div className="collector-result-actions">
          <ItemActionButton
            disabled={false}
            icon="fa-thumbs-up"
            label="Acknowledge Collector result"
            onClick={closeDialog}
          />
        </div>
      </div>
    </dialog>
  );
}

function ArtworkOfferDialog({
  interactionType,
  npcName,
  quality,
  items,
  onClose,
  onItemsChange,
  onNotify,
}: {
  interactionType: "art-donor-offer" | "art-dealer-offer";
  npcName: string;
  quality: NpcQuality;
  items: ArtworkOfferItem[];
  onClose: () => void;
  onItemsChange: (items: ArtworkOfferItem[]) => void;
  onNotify: (
    message: string,
    kind: PlayerNotificationKind,
  ) => Promise<void>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState("");

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

  async function actOnOffer(
    item: ArtworkOfferItem,
    action: "claim" | "purchase" | "sell" | "decline",
  ) {
    setBusyItemId(item._id);
    setError("");
    try {
      const response = await fetch(
        `/api/play/items/${item._id}/${action}`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        error?: string;
        amount?: number;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The artwork action failed.");
      }
      const message =
        action === "claim"
          ? `${item.artwork.title} was added to your inventory.`
          : action === "purchase"
            ? `${item.artwork.title} was purchased for $${(body.amount ?? item.price ?? item.values.dealer).toLocaleString()}.`
          : action === "sell"
            ? `${item.artwork.title} was sold for $${(body.amount ?? item.values.sell).toLocaleString()}.`
            : `${item.artwork.title} was declined.`;
      const remainingItems = items
        .filter((offer) => offer._id !== item._id)
        .map((offer) =>
          (action === "claim" || action === "purchase") &&
            offer.artwork_id === item.artwork_id
            ? { ...offer, alreadyOwned: true }
            : offer,
        );
      onItemsChange(remainingItems);
      await onNotify(message, "success");
      router.refresh();
      if (remainingItems.length === 0) closeDialog();
    } catch (offerError) {
      const message =
        offerError instanceof Error
          ? offerError.message
          : "The artwork action failed.";
      setError(message);
      await onNotify(message, "error");
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <dialog
      aria-labelledby="artwork-offer-title"
      className="donor-offer-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="donor-offer-content">
        <header>
          <div>
            <p className="reroll-dialog-kicker">{quality} visitor</p>
            <h2 id="artwork-offer-title">{npcName}&apos;s offer</h2>
          </div>
          <button
            aria-label={`Close ${npcName} offer`}
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <p>Closing this dialog leaves unresolved offers in your loot tab.</p>
        {items.length === 0 ? (
          <p className="empty-state">Every offer has been resolved.</p>
        ) : (
          <div className="donor-offer-list">
            {items.map((item) => (
              <article className="donor-offer-item" key={item._id}>
                <ArtworkThumbnail
                  alt={`${item.artwork.title} by ${item.artwork.artist}`}
                  artworkId={item.artwork_id}
                  className="donor-offer-thumbnail"
                />
                <div className="donor-offer-details">
                  <div>
                    <span
                      className={`artwork-ownership-indicator ${
                        item.alreadyOwned ? "owned" : "new"
                      }`}
                    >
                      {item.alreadyOwned ? "owned" : "new artwork"}
                    </span>
                    <span
                      className={`donor-offer-rarity rarity-text ${item.artwork.rarity}`}
                    >
                      {item.artwork.rarity}
                    </span>
                  </div>
                  <strong>{item.artwork.title}</strong>
                  <span>{item.artwork.artist}</span>
                  <span>
                    level {item.level} · condition{" "}
                    {Math.round(item.condition * 100)}%
                  </span>
                  <span>
                    estimated value ${item.values.actual.toLocaleString()}
                  </span>
                  {interactionType === "art-dealer-offer" ? (
                    <strong className="dealer-offer-price">
                      price ${(item.price ?? item.values.dealer).toLocaleString()}
                    </strong>
                  ) : null}
                </div>
                <div className="donor-offer-actions">
                  {interactionType === "art-dealer-offer" ? (
                    <ItemActionButton
                      disabled={busyItemId !== null}
                      icon="fa-shopping-cart"
                      label={`Purchase ${item.artwork.title} for $${(
                        item.price ?? item.values.dealer
                      ).toLocaleString()}`}
                      onClick={() => actOnOffer(item, "purchase")}
                    />
                  ) : (
                    <>
                      <ItemActionButton
                        disabled={busyItemId !== null}
                        icon="fa-plus"
                        label={`Add ${item.artwork.title} to inventory`}
                        onClick={() => actOnOffer(item, "claim")}
                      />
                      <ItemActionButton
                        disabled={busyItemId !== null}
                        icon="fa-usd"
                        label={`Sell ${item.artwork.title} for $${item.values.sell.toLocaleString()}`}
                        onClick={() => actOnOffer(item, "sell")}
                      />
                    </>
                  )}
                  <ItemActionButton
                    disabled={busyItemId !== null}
                    icon="fa-times"
                    label={`Decline ${item.artwork.title}`}
                    onClick={() => actOnOffer(item, "decline")}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
        {error ? (
          <p className="reroll-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}

function RerollDialog({
  item,
  bankBalance,
  legendaryAttributes,
  onClose,
  onNotify,
  onRerolled,
  onSelected,
}: {
  item: HydratedGameItem;
  bankBalance: number;
  legendaryAttributes: LegendaryAttributeView[];
  onClose: () => void;
  onNotify: (
    message: string,
    kind: PlayerNotificationKind,
  ) => Promise<void>;
  onRerolled: (item: HydratedGameItem, bankBalance: number) => void;
  onSelected: (item: HydratedGameItem) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingMintMutation, setPendingMintMutation] = useState<{
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const canAfford = bankBalance >= item.reroll_cost;
  const eligibleLegendaryAttributes = legendaryAttributes.filter(
    (attribute) =>
      attribute.active &&
      item.artwork.unique_attributes?.includes(attribute.id),
  );

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

  function requestMintMutation(
    actionLabel: string,
    onConfirm: () => void,
  ) {
    if (!item.mint) {
      onConfirm();
      return;
    }
    setPendingMintMutation({ actionLabel, onConfirm });
  }

  function reroll(mode: "value" | "attribute", attributeId: string) {
    requestMintMutation(
      mode === "value"
        ? "Rerolling this attribute value"
        : "Replacing this attribute",
      () => void performReroll(mode, attributeId),
    );
  }

  async function performReroll(
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

  function selectLegendaryAttribute(attributeId: string) {
    if (attributeId === item.active_unique_attribute) return;
    requestMintMutation(
      "Changing this Legendary Attribute",
      () => void performLegendarySelection(attributeId),
    );
  }

  async function performLegendarySelection(attributeId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/play/items/${item._id}/legendary-attribute`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attributeId }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        item?: GameItem;
      };
      if (!response.ok || !body.item) {
        throw new Error(
          body.error ?? "The Legendary Attribute could not be selected.",
        );
      }
      const nextItem: HydratedGameItem = {
        ...item,
        ...body.item,
        artwork: item.artwork,
      };
      onSelected(nextItem);
      setNotice("Active Legendary Attribute changed.");
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "The Legendary Attribute could not be selected.",
      );
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
    <>
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

        {eligibleLegendaryAttributes.length > 0 ? (
          <fieldset className="legendary-selector">
            <legend>Legendary Attribute</legend>
            {eligibleLegendaryAttributes.map((attribute) => (
              <label key={attribute.id}>
                <input
                  checked={item.active_unique_attribute === attribute.id}
                  disabled={busy}
                  name="active-legendary-attribute"
                  onChange={() => selectLegendaryAttribute(attribute.id)}
                  type="radio"
                  value={attribute.id}
                />
                <span>
                  <strong>{attribute.title}</strong>
                  <span>{attribute.description}</span>
                  <em>&ldquo;{attribute.flavorText}&rdquo;</em>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

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
      {pendingMintMutation ? (
        <MintLossConfirmationDialog
          actionLabel={pendingMintMutation.actionLabel}
          onCancel={() => setPendingMintMutation(null)}
          onConfirm={pendingMintMutation.onConfirm}
        />
      ) : null}
    </>
  );
}

function ItemActionButton({
  icon,
  label,
  disabled,
  disabledReason,
  onDisabledClick,
  onClick,
  variant = "default",
}: {
  icon: string;
  label: string;
  disabled: boolean;
  disabledReason?: string;
  onDisabledClick?: () => void | Promise<void>;
  onClick: () => void;
  variant?: "default" | "collector" | "gallery";
}) {
  const reason =
    disabledReason ?? (disabled ? "Another action is being processed." : "");
  const accessibleLabel = reason ? `${label}. Unavailable: ${reason}` : label;

  return (
    <button
      aria-disabled={disabled}
      aria-label={accessibleLabel}
      className={`item-action-button item-action-${variant}`}
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
  activeRendererIds,
  rendererPrices,
  title,
  emptyText,
  items,
  legendaryAttributes,
  canCustomize,
  ownedRendererIds,
  rendererId,
  actions,
}: {
  activeRendererIds: string[];
  rendererPrices: ItemCardProps["rendererPrices"];
  title: string;
  emptyText: string;
  items: HydratedGameItem[];
  legendaryAttributes: LegendaryAttributeView[];
  canCustomize?: boolean;
  ownedRendererIds?: string[];
  rendererId?: string;
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
            <ItemCard
              activeRendererIds={activeRendererIds}
              actions={actions(item)}
              item={item}
              legendaryAttributes={legendaryAttributes}
              key={`${item._id}:${item.status}:${item.tags.join(",")}`}
              ownedRendererIds={ownedRendererIds}
              rendererPrices={rendererPrices}
              permissions={{
                canManageItem: true,
                canCustomizeCosmetic: Boolean(canCustomize),
              }}
              rendererId={rendererId}
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

function countdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

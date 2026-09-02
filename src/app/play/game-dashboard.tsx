"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ArchiveEntryDialog from "@/components/archive-entry-dialog";
import ArtworkThumbnail from "@/components/artwork-thumbnail";
import {
  getGalleryPaintingDimension,
  getGalleryPixelsPerCentimeter,
} from "@/components/gallery-layout";
import ArchiveConfirmationDialog from "@/components/item-cards/archive-confirmation-dialog";
import AuctionListingDialog from "@/components/item-cards/auction-listing-dialog";
import ArtStyleDialog from "@/components/item-cards/art-style-dialog";
import {
  getCardCosmetic,
  type CardStyleInventory,
} from "@/components/item-cards/catalog";
import ItemCard from "@/components/item-cards/item-card";
import MintLossConfirmationDialog from "@/components/item-cards/mint-loss-confirmation-dialog";
import { resolveCardRendererId } from "@/components/item-cards/selection";
import { ratingColor } from "@/components/item-cards/shared";
import StandardItemDialog from "@/components/item-cards/standard-item-dialog";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { GalleryRates } from "@/server/collection-gameplay";
import type { ArtHistorianQuestView } from "@/server/art-historian-gameplay";
import type { GameItem } from "@/server/gameplay";
import type {
  HydratedGameItem,
  HydratedPlayerArtworkArchive,
} from "@/server/item-artwork";
import {
  canAffordItemLevelUp,
  getItemLevelUpCost,
  ITEM_LEVEL_MAX,
} from "@/server/item-leveling";
import {
  getArchivePermission,
  getDisplayPermission,
} from "@/server/item-permissions";
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
  inventorySlotsUsed: number;
  displayCap: number;
  repairingCap: number;
  lastDrop: string;
  xpGoal: number;
  npcsMet: Partial<Record<NpcQuality, number>>;
  knowledge: Record<
    | "historical_data"
    | "contextual_understanding"
    | "technical_comprehension"
    | "artistic_vision",
    number
  >;
  cardStyleInventory: CardStyleInventory;
  completedQuests: number;
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
type KnowledgeBalance = PlayerView["knowledge"];

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

type ArtHistorianResult = {
  type: "art-historian-quest";
  npcName: string;
  quality: NpcQuality;
  quest: ArtHistorianQuestView;
};

const ATTRIBUTE_TYPE_ICONS = {
  special: { icon: "fa-star", label: "Special attribute" },
  locked: null,
  unlocked: { icon: "fa-unlock-alt", label: "Unlocked attribute" },
} as const;

export default function GameDashboard({
  player,
  items,
  archives,
  galleryRates,
  initialNotifications,
  impersonating,
  canRerollDisplayed,
  levelUpDiscountAvailable,
  levelUpConditionMinimum,
  legendaryAttributes,
  npcSpawnOptions,
  dailyDropCooldownMinutes,
  dealerPriceMultiplier,
  debugEnabled,
  npcs,
  quests,
}: {
  player: PlayerView;
  items: HydratedGameItem[];
  archives: HydratedPlayerArtworkArchive[];
  galleryRates: GalleryRates;
  initialNotifications: PlayerNotification[];
  impersonating: boolean;
  canRerollDisplayed: boolean;
  levelUpDiscountAvailable: boolean;
  levelUpConditionMinimum: number;
  legendaryAttributes: LegendaryAttributeView[];
  npcSpawnOptions: NpcSpawnOption[];
  dailyDropCooldownMinutes: number;
  dealerPriceMultiplier: number;
  debugEnabled: boolean;
  npcs: NpcView[];
  quests: ArtHistorianQuestView[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<
    "profile" | "inventory" | "loot" | "gallery" | "archive" | "quests"
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
  const [artHistorianResult, setArtHistorianResult] =
    useState<ArtHistorianResult | null>(null);
  const [npcRewardEffects, setNpcRewardEffects] = useState<
    Record<string, NpcRewardInteraction & { animationId: number }>
  >({});
  const [rerollSession, setRerollSession] = useState<{
    item: HydratedGameItem;
    bankBalance: number;
    knowledge: KnowledgeBalance;
  } | null>(null);
  const [galleryItemDetails, setGalleryItemDetails] =
    useState<HydratedGameItem | null>(null);
  const [galleryArtStyleItem, setGalleryArtStyleItem] =
    useState<HydratedGameItem | null>(null);
  const [mintConfirmation, setMintConfirmation] = useState<{
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [auctionListingItem, setAuctionListingItem] =
    useState<HydratedGameItem | null>(null);
  const [archiveConfirmationItem, setArchiveConfirmationItem] =
    useState<HydratedGameItem | null>(null);
  const [archiveEntryDetails, setArchiveEntryDetails] =
    useState<HydratedPlayerArtworkArchive | null>(null);
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
    () =>
      items.filter(
        (item) => item.status === "claimed" || item.status === "auctioned",
      ),
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
              item.status === "claimed" ||
              item.status === "displayed" ||
              item.status === "auctioned",
          )
          .map((item) => item.artwork_id),
      ),
    [items],
  );
  const researchArtworkIds = useMemo(
    () => new Set(quests.flatMap((quest) => quest.target)),
    [quests],
  );
  const ownedCount = inventory.length + displayed.length;
  const repairingCount = items.filter((item) => item.repairing).length;
  const galleryPixelsPerCentimeter =
    getGalleryPixelsPerCentimeter(
      displayed.map((item) => item.artwork.height),
    );
  const galleryPaintingMargin = Math.floor(
    80 * galleryPixelsPerCentimeter,
  );
  const galleryWallOffset = Math.floor(
    120 * galleryPixelsPerCentimeter,
  );
  const inventoryFull = player.inventorySlotsUsed >= player.inventoryCap;
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

  function archiveAction(item: HydratedGameItem) {
    if (!["claimed", "unclaimed", "for_sale"].includes(item.status)) {
      return null;
    }
    const purchaseAmount =
      item.status === "for_sale"
        ? Math.floor(item.values.dealer * dealerPriceMultiplier)
        : 0;
    const permission =
      item.archivePermission ??
      getArchivePermission(
        item,
        item.archivedCategories ?? [],
        item.archivedArtStyles ?? [],
      );
    const disabledReason = !permission.allowed
      ? permission.reason
      : purchaseAmount > player.bankBalance
          ? "You do not have enough money to archive this dealer offer."
          : undefined;

    return (
      <ItemActionButton
        icon="fa-archive"
        label={
          purchaseAmount > 0
            ? `Purchase and archive for $${purchaseAmount.toLocaleString()}`
            : "Archive permanently"
        }
        disabled={pending || Boolean(disabledReason)}
        disabledReason={disabledReason}
        onClick={() => setArchiveConfirmationItem(item)}
      />
    );
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
        } | CollectorResult | ArtExpertResult | ArtHistorianResult | NpcRewardInteraction;
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
      } else if (body.interaction?.type === "art-historian-quest") {
        setArtHistorianResult(body.interaction);
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
                knowledge: player.knowledge,
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
          {(
            [
              "profile",
              "inventory",
              "loot",
              "gallery",
              "archive",
              "quests",
            ] as const
          ).map((tab) => (
            <button
              className={section === tab ? "current" : ""}
              key={tab}
              onClick={() => setSection(tab)}
              type="button"
            >
              {tab}
              {tab === "loot" && unclaimed.length > 0 ? ` (${unclaimed.length})` : ""}
              {tab === "archive" && archives.length > 0
                ? ` (${archives.length})`
                : ""}
              {tab === "quests" && quests.length > 0
                ? ` (${quests.length})`
                : ""}
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
            <header className="museum-profile-heading">
              <div>
                <p>Artfunkel collection registry</p>
                <h2>{player.screenName}</h2>
                <span>Private collection and activity record</span>
              </div>
              <strong>AF · {player.level.toString().padStart(2, "0")}</strong>
            </header>

            <div className="museum-profile-progress">
              <div>
                <span>Collection experience</span>
                <strong>
                  {player.xp.toLocaleString()} /{" "}
                  {player.xpGoal.toLocaleString()}
                </strong>
              </div>
              <span className="museum-profile-progress-track">
                <i
                  style={{
                    width: `${Math.min(
                      (player.xp / Math.max(player.xpGoal, 1)) * 100,
                      100,
                    )}%`,
                  }}
                />
              </span>
            </div>

            <div className="museum-profile-ledger">
              <section>
                <header>
                  <span>Account</span>
                  <small>Financial and collection holdings</small>
                </header>
                <dl>
                  <ProfileFact
                    label="Bank balance"
                  value={`$${player.bankBalance.toLocaleString()}`}
                  />
                  <ProfileFact
                    label="Lottery tickets"
                  value={player.lotteryTickets.toLocaleString()}
                  />
                  <ProfileFact
                    label="Paintings owned"
                    value={ownedCount.toLocaleString()}
                  />
                  <ProfileFact
                    label="Archived artworks"
                    value={archives.length.toLocaleString()}
                  />
                  <ProfileFact
                    label="Inventory space available"
                  value={Math.max(
                    player.inventoryCap - player.inventorySlotsUsed,
                    0,
                  )}
                  />
                  <ProfileFact
                    label="Items being repaired"
                    value={`${repairingCount} (${player.repairingCap} max)`}
                  />
                </dl>
              </section>

              <section>
                <header>
                  <span>Current exhibition</span>
                  <small>Live gallery performance</small>
                </header>
                <dl>
                  <ProfileFact
                    label="Items exhibited"
                  value={`${displayed.length} (${player.displayCap} max)`}
                  />
                  <ProfileFact
                    label="Exhibition value"
                  value={`$${galleryRates.value.toLocaleString()}`}
                  />
                  <ProfileFact
                    label="Earnings per hour"
                  value={`$${galleryRates.moneyPerHour.toLocaleString()}`}
                  />
                  <ProfileFact
                    label="Experience per hour"
                  value={galleryRates.xpPerHour.toLocaleString()}
                  />
                </dl>
              </section>

              <section>
                <header>
                  <span>Institutional record</span>
                  <small>Lifetime participation</small>
                </header>
                <dl>
                  <ProfileFact
                    label="Visitors met"
                  value={Object.values(player.npcsMet).reduce(
                    (sum, count) => sum + (count ?? 0),
                    0,
                  )}
                  />
                  <ProfileFact
                    label="Quests completed"
                  value={player.completedQuests.toLocaleString()}
                  />
                </dl>
              </section>
            </div>

            <section className="museum-profile-knowledge">
              <header>
                <div>
                  <span>Knowledge collection</span>
                  <small>
                    Research currency recovered from donated artwork
                  </small>
                </div>
                <strong>4 classifications</strong>
              </header>
              <div>
                {Object.entries(KNOWLEDGE_LABELS).map(
                  ([type, label], index) => (
                    <article
                      className={`knowledge-classification knowledge-tier-${index}`}
                      key={type}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <small>{label}</small>
                        <strong>
                          {player.knowledge[
                            type as keyof typeof player.knowledge
                          ].toLocaleString()}
                        </strong>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </section>
          </section>
        ) : null}

        {section === "loot" ? (
          <section className="random-drop">
            <div className="loot-page-actions">
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
              <button
                className="sell-all-loot"
                disabled={
                  pending ||
                  !unclaimed.some((item) => item.status === "unclaimed")
                }
                onClick={() => act("/api/play/items/sell-all")}
                type="button"
              >
                <i aria-hidden="true" className="fa fa-usd" /> Sell all
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
            </div>
            {unclaimed.length === 0 ? (
              <p className="empty-state">You have no unclaimed artwork.</p>
            ) : (
              <div className="item-grid">
                {unclaimed.map((item) => (
                  <ItemCard
                    alreadyOwned={ownedArtworkIds.has(item.artwork_id)}
                    legendaryAttributes={legendaryAttributes}
                    permissions={{
                      canManageItem: true,
                      canCustomizeCosmetic: false,
                    }}
                    researchTarget={researchArtworkIds.has(item.artwork_id)}
                    styleInventory={player.cardStyleInventory}
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
                          {archiveAction(item)}
                        </>
                      ) : (
                        <>
                          <ItemActionButton
                            icon="fa-plus"
                            label="Add to inventory"
                            disabled={
                              pending ||
                              (inventoryFull && !item.original && !item.vintage)
                            }
                            disabledReason={
                              inventoryFull && !item.original && !item.vintage
                                ? "Your inventory is currently full."
                                : undefined
                            }
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
                            icon="fa-share-square"
                            label="Donate for knowledge"
                            disabled={pending || item.permanent || item.original}
                            onClick={() =>
                              act(`/api/play/items/${item._id}/donate`)
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
                          {archiveAction(item)}
                        </>
                      )
                    }
                    item={item}
                    key={getItemCardKey(item)}
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
              legendaryAttributes={legendaryAttributes}
              researchArtworkIds={researchArtworkIds}
              canCustomize
              styleInventory={player.cardStyleInventory}
              title={`on display (${displayed.length}/${player.displayCap})`}
              actions={displayedItemActions}
            />
            <InventorySection
              emptyText="Your inventory is empty."
              items={inventory}
              legendaryAttributes={legendaryAttributes}
              researchArtworkIds={researchArtworkIds}
              canCustomize
              styleInventory={player.cardStyleInventory}
              title="inventory"
              actions={(item) => {
                if (item.status === "auctioned") return null;

                const displayPermission = getDisplayPermission(
                  item,
                  items,
                  player.displayCap,
                );
                const repairLimitReached =
                  !item.repairing &&
                  repairingCount >= player.repairingCap;
                const repairDisabledReason = item.repairing
                  ? undefined
                  : item.condition >= 1
                    ? "This item is already at 100% condition."
                    : repairLimitReached
                      ? `Your ${player.repairingCap}-item repair limit has been reached.`
                      : undefined;
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
                      icon="fa-wrench"
                      label={
                        item.repairing
                          ? `Stop repairing at ${Math.floor(item.condition * 100)}% condition`
                          : "Repair item"
                      }
                      disabled={pending || Boolean(repairDisabledReason)}
                      disabledReason={repairDisabledReason}
                      onClick={() =>
                        act(`/api/play/items/${item._id}/repair`)
                      }
                      variant={item.repairing ? "enabled" : "default"}
                    />
                    <ItemActionButton
                      icon="fa-magic"
                      label="Modify attributes"
                      disabled={pending}
                      onClick={() =>
                        setRerollSession({
                          item,
                          bankBalance: player.bankBalance,
                          knowledge: player.knowledge,
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
                      icon="fa-gavel"
                      label="Put up for auction"
                      disabled={pending || item.permanent || item.repairing}
                      onClick={() => setAuctionListingItem(item)}
                    />
                    <ItemActionButton
                      icon="fa-usd"
                      label={`Sell for $${item.values.sell.toLocaleString()}`}
                      disabled={pending}
                      onClick={() => act(`/api/play/items/${item._id}/sell`)}
                    />
                    <ItemActionButton
                      icon="fa-share-square"
                      label="Donate for knowledge"
                      disabled={pending || item.permanent || item.original}
                      onClick={() =>
                        act(`/api/play/items/${item._id}/donate`)
                      }
                    />
                    {archiveAction(item)}
                  </>
                );
              }}
            />
          </section>
        ) : null}
        {auctionListingItem ? (
          <AuctionListingDialog
            item={auctionListingItem}
            onClose={() => setAuctionListingItem(null)}
            onListed={(message) => {
              setNotice(message);
              void addNotification(message, "success");
              router.refresh();
            }}
          />
        ) : null}

        {section === "archive" ? (
          <section className="archive">
            <h2>artwork archive</h2>
            {archives.length === 0 ? (
              <p className="empty-state">Your archive is empty.</p>
            ) : (
              <div className="archive-artwork-grid">
                {archives.map((archive) => (
                  <button
                    aria-label={`Open archive entry for ${archive.artwork.title} by ${archive.artwork.artist}`}
                    className="archive-artwork-thumbnail"
                    key={archive._id}
                    onClick={() => setArchiveEntryDetails(archive)}
                    type="button"
                  >
                    <ArtworkThumbnail
                      alt=""
                      artworkId={archive.artwork_id}
                      size={180}
                    />
                  </button>
                ))}
              </div>
            )}
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
              <div className="gallery-scene">
                <div
                  className="gallery-wall"
                  style={{
                    paddingBottom: galleryWallOffset,
                    paddingTop: galleryWallOffset,
                  }}
                >
                  {displayed.length === 0 ? (
                    <p className="empty-gallery">
                      Your gallery walls are empty.
                    </p>
                  ) : (
                    displayed.map((item) => (
                      <div
                        className="painting-container"
                        key={item._id}
                        style={{
                          marginLeft: galleryPaintingMargin,
                          marginRight: galleryPaintingMargin,
                        }}
                      >
                        <button
                          className="framed-painting"
                          disabled={pending}
                          onClick={() => setGalleryItemDetails(item)}
                          style={{
                            backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
                            height: getGalleryPaintingDimension(
                              item.artwork.height,
                              galleryPixelsPerCentimeter,
                            ),
                            width: getGalleryPaintingDimension(
                              item.artwork.width,
                              galleryPixelsPerCentimeter,
                            ),
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
            </div>
          </section>
        ) : null}

        {section === "quests" ? (
          <QuestSection
            onAction={act}
            pending={pending}
            quests={quests}
          />
        ) : null}

        {rerollSession ? (
          <RerollDialog
            bankBalance={rerollSession.bankBalance}
            item={rerollSession.item}
            knowledge={rerollSession.knowledge}
            levelUpDiscountAvailable={levelUpDiscountAvailable}
            levelUpConditionMinimum={levelUpConditionMinimum}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setRerollSession(null)}
            onNotify={addNotification}
            onRerolled={(item, nextBankBalance) => {
              setRerollSession({
                item,
                bankBalance: nextBankBalance,
                knowledge: rerollSession.knowledge,
              });
              router.refresh();
            }}
            onLeveled={(item, knowledge) => {
              setRerollSession((current) =>
                current ? { ...current, item, knowledge } : current,
              );
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
            currentRendererId={resolveCardRendererId({
              itemRendererId: galleryItemDetails.card_renderer,
            })}
            item={galleryItemDetails}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setGalleryItemDetails(null)}
            onOpenArtStyle={() =>
              setGalleryArtStyleItem(galleryItemDetails)
            }
            permissions={{
              canManageItem: true,
              canCustomizeCosmetic: true,
            }}
          />
        ) : null}
        {galleryArtStyleItem ? (
          <ArtStyleDialog
            currentRendererId={resolveCardRendererId({
              itemRendererId: galleryArtStyleItem.card_renderer,
            })}
            item={galleryArtStyleItem}
            legendaryAttributes={legendaryAttributes}
            onApplied={(rendererId, nextItem) => {
              setGalleryArtStyleItem((current) =>
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
            onClose={() => setGalleryArtStyleItem(null)}
            researchTarget={researchArtworkIds.has(
              galleryArtStyleItem.artwork_id,
            )}
            styleInventory={player.cardStyleInventory}
          />
        ) : null}
        {archiveConfirmationItem ? (
          <ArchiveConfirmationDialog
            item={archiveConfirmationItem}
            onCancel={() => setArchiveConfirmationItem(null)}
            onConfirm={() =>
              act(
                `/api/play/items/${archiveConfirmationItem._id}/archive`,
              )
            }
            purchaseAmount={
              archiveConfirmationItem.status === "for_sale"
                ? Math.floor(
                    archiveConfirmationItem.values.dealer *
                      dealerPriceMultiplier,
                  )
                : 0
            }
          />
        ) : null}
        {archiveEntryDetails ? (
          <ArchiveEntryDialog
            archive={archiveEntryDetails}
            onClose={() => setArchiveEntryDetails(null)}
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
        {artHistorianResult ? (
          <ArtHistorianDialog
            result={artHistorianResult}
            onClose={() => setArtHistorianResult(null)}
            onViewQuests={() => {
              setArtHistorianResult(null);
              setSection("quests");
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function QuestSection({
  onAction,
  pending,
  quests,
}: {
  onAction: (url: string) => void;
  pending: boolean;
  quests: ArtHistorianQuestView[];
}) {
  return (
    <section className="historian-quests">
      <header className="historian-quests-heading">
        <div>
          <p>Art Historian objectives</p>
          <h2>Research requests</h2>
        </div>
        <span>{quests.length} / 8 active</span>
      </header>
      {quests.length === 0 ? (
        <p className="empty-state">
          You have no active Art Historian objectives.
        </p>
      ) : (
        <div className="historian-quest-list">
          {quests.map((quest) => (
            <article
              className="historian-quest"
              data-rarity={quest.rarity}
              key={quest._id}
            >
              <header>
                <div>
                  <span>{quest.rarity} objective</span>
                  <h3>
                    Collect {quest.min_requirement} of {quest.target.length}{" "}
                    requested works
                  </h3>
                </div>
                <strong
                  className={
                    quest.progress.canClaim ? "complete" : undefined
                  }
                >
                  {quest.progress.owned}/{quest.progress.targetCount}
                </strong>
              </header>
              <QuestTargetGrid targets={quest.targets} />
              <footer>
                <div className="historian-quest-rewards">
                  <span>
                    <i aria-hidden="true" className="fa fa-usd" />{" "}
                    {quest.reward.money.toLocaleString()}
                  </span>
                  <span>
                    <i aria-hidden="true" className="fa fa-star" />{" "}
                    {quest.reward.xp.toLocaleString()} base XP
                  </span>
                  {quest.reward.item ? (
                    <span>
                      <i aria-hidden="true" className="fa fa-gift" />{" "}
                      {quest.reward.item.foil ? "Foil " : ""}
                      {quest.reward.item.rarity} artwork
                    </span>
                  ) : null}
                </div>
                <div className="historian-quest-actions">
                  <button
                    className="cancel"
                    disabled={pending}
                    onClick={() =>
                      onAction(`/api/play/quests/${quest._id}/cancel`)
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="claim"
                    disabled={pending || !quest.progress.canClaim}
                    onClick={() =>
                      onAction(`/api/play/quests/${quest._id}/claim`)
                    }
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-flag-checkered" />{" "}
                    Claim reward
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function QuestTargetGrid({
  targets,
}: {
  targets: ArtHistorianQuestView["targets"];
}) {
  return (
    <div className="historian-target-grid">
      {targets.map((target) => (
        <div
          className={`historian-target ${target.owned ? "owned" : "missing"}`}
          key={target.artwork._id}
        >
          <ArtworkThumbnail
            alt={`${target.artwork.title} by ${target.artwork.artist}`}
            artworkId={target.artwork._id}
            className="historian-target-image"
          />
          <div>
            <strong>{target.artwork.title}</strong>
            <span>{target.artwork.artist}</span>
            <small>{target.artwork.rarity}</small>
          </div>
          <i
            aria-label={target.owned ? "Collected" : "Not collected"}
            className={`fa ${
              target.owned ? "fa-check-circle" : "fa-circle-o"
            }`}
            role="img"
          />
          {target.special ? (
            <i
              aria-label="Special target bonus"
              className="fa fa-star historian-target-special"
              role="img"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ArtHistorianDialog({
  onClose,
  onViewQuests,
  result,
}: {
  onClose: () => void;
  onViewQuests: () => void;
  result: ArtHistorianResult;
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
      aria-labelledby="historian-dialog-title"
      className="reroll-dialog historian-dialog"
      data-rarity={result.quest.rarity}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="reroll-dialog-content">
        <header className="reroll-dialog-header">
          <div>
            <p className="reroll-dialog-kicker">
              {result.quality} Art Historian
            </p>
            <h2 id="historian-dialog-title">A research request</h2>
            <p className="reroll-artwork-artist">{result.npcName}</p>
          </div>
          <button
            aria-label="Close Art Historian dialog"
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <p className="reroll-dialog-description">
          Acquire at least {result.quest.min_requirement} of these requested
          works, then report your findings to claim the reward.
        </p>
        <QuestTargetGrid targets={result.quest.targets} />
        <div className="historian-dialog-reward">
          <span>Research grant</span>
          <strong>
            ${result.quest.reward.money.toLocaleString()} +{" "}
            {result.quest.reward.xp.toLocaleString()} base XP
          </strong>
        </div>
        <div className="historian-dialog-actions">
          <button onClick={closeDialog} type="button">
            Close
          </button>
          <button className="primary" onClick={onViewQuests} type="button">
            <i aria-hidden="true" className="fa fa-flag-checkered" /> View
            quests
          </button>
        </div>
      </div>
    </dialog>
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
  knowledge,
  levelUpDiscountAvailable,
  levelUpConditionMinimum,
  legendaryAttributes,
  onClose,
  onLeveled,
  onNotify,
  onRerolled,
  onSelected,
}: {
  item: HydratedGameItem;
  bankBalance: number;
  knowledge: KnowledgeBalance;
  levelUpDiscountAvailable: boolean;
  levelUpConditionMinimum: number;
  legendaryAttributes: LegendaryAttributeView[];
  onClose: () => void;
  onLeveled: (item: HydratedGameItem, knowledge: KnowledgeBalance) => void;
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
  const [recentSpend, setRecentSpend] = useState<{
    amount: number;
    animation: number;
  } | null>(null);
  const [pendingMintMutation, setPendingMintMutation] = useState<{
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const canAfford = bankBalance >= item.reroll_cost;
  const levelUpDiscounted =
    levelUpDiscountAvailable && item.condition > levelUpConditionMinimum;
  const levelUpCost = getItemLevelUpCost(
    item.artwork.rarity,
    item.level,
    levelUpDiscounted,
  );
  const canAffordLevelUp = canAffordItemLevelUp(knowledge, levelUpCost);
  const atMaximumLevel = item.level >= ITEM_LEVEL_MAX;
  const appliedStyle = getCardCosmetic(item.card_renderer ?? "");
  const recoverableStyle =
    appliedStyle?.id === "museum" ? undefined : appliedStyle;
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
      const cost = body.cost;
      onRerolled(nextItem, body.bankBalance);
      setRecentSpend((current) => ({
        amount: cost,
        animation: (current?.animation ?? 0) + 1,
      }));
      const message =
        mode === "value"
          ? "Attraction value updated."
          : "Unlocked attribute replaced.";
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

  async function levelUp() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/play/items/${item._id}/level`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        item?: GameItem;
        knowledge?: KnowledgeBalance;
        message?: string;
      };
      if (!response.ok || !body.item || !body.knowledge) {
        throw new Error(body.error ?? "The level up could not be completed.");
      }

      const nextItem: HydratedGameItem = {
        ...item,
        ...body.item,
        artwork: item.artwork,
      };
      onLeveled(nextItem, body.knowledge);
      const message =
        body.message ??
        `${item.artwork.title} reached level ${nextItem.level}.`;
      setNotice(message);
      await onNotify(message, "success");
    } catch (levelError) {
      const message =
        levelError instanceof Error
          ? levelError.message
          : "The level up could not be completed.";
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
      data-rarity={item.artwork.rarity}
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
              <p className="reroll-dialog-kicker">
                modify artwork · level {item.level}
              </p>
              <h2 id="reroll-title">{item.artwork.title}</h2>
              <p className="reroll-artwork-artist">{item.artwork.artist}</p>
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
            <dd className="reroll-bank-balance">
              ${bankBalance.toLocaleString()}
              {recentSpend ? (
                <span
                  aria-label={`${recentSpend.amount.toLocaleString()} spent`}
                  className="reroll-spend-indicator"
                  key={recentSpend.animation}
                >
                  -${recentSpend.amount.toLocaleString()}
                </span>
              ) : null}
            </dd>
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

        <section className="item-level-up">
          <header>
            <div>
              <p>Collection development</p>
              <h3>
                Level {item.level} <span>/ {ITEM_LEVEL_MAX}</span>
              </h3>
            </div>
            {!atMaximumLevel ? (
              <strong>Next: level {item.level + 1}</strong>
            ) : (
              <strong>Maximum level</strong>
            )}
          </header>
          <p className="item-level-up-description">
            Spend Knowledge to increase this item&apos;s value and improve the
            minimum attraction values available on future rerolls.
          </p>
          {!atMaximumLevel ? (
            <>
              {levelUpDiscounted ? (
                <p className="item-level-up-discount">
                  <i aria-hidden="true" className="fa fa-wrench" />
                  Preservationist benefit: Knowledge cost reduced by 20%.
                </p>
              ) : null}
              <div className="item-level-up-costs">
                {Object.entries(KNOWLEDGE_LABELS).map(
                  ([type, label], index) => {
                    const knowledgeType = type as keyof KnowledgeBalance;
                    const required = levelUpCost[knowledgeType];
                    const available = knowledge[knowledgeType];
                    const sufficient = available >= required;
                    return (
                      <div
                        className={sufficient ? "" : "insufficient"}
                        key={type}
                      >
                        <span className={`knowledge-tier-${index}`}>
                          {label}
                        </span>
                        <strong>
                          {required.toLocaleString()} /{" "}
                          {available.toLocaleString()}
                        </strong>
                        <small>required / available</small>
                      </div>
                    );
                  },
                )}
              </div>
              {recoverableStyle ? (
                <p className="item-level-up-style">
                  <i aria-hidden="true" className="fa fa-clone" />
                  The {recoverableStyle.name} style will be recovered as a
                  reusable consumable, and this item will return to Museum
                  Label.
                </p>
              ) : null}
              <button
                className="item-level-up-button"
                disabled={busy || !canAffordLevelUp}
                onClick={() =>
                  requestMintMutation(
                    "Leveling up this item",
                    () => void levelUp(),
                  )
                }
                type="button"
              >
                <i aria-hidden="true" className="fa fa-level-up" />
                {busy ? "Applying level..." : `Promote to level ${item.level + 1}`}
              </button>
              {!canAffordLevelUp ? (
                <p className="item-level-up-unavailable">
                  You need more Knowledge in every required classification.
                </p>
              ) : null}
            </>
          ) : (
            <p className="item-level-up-maximum">
              This artwork has reached the maximum development level.
            </p>
          )}
        </section>

        {eligibleLegendaryAttributes.length > 0 ? (
          <fieldset className="legendary-selector">
            <legend>Legendary Attribute</legend>
            {eligibleLegendaryAttributes.length === 1 ? (
              <div className="legendary-selector-single">
                <span>
                  <strong>{eligibleLegendaryAttributes[0].title}</strong>
                  <span>{eligibleLegendaryAttributes[0].description}</span>
                  <em>
                    &ldquo;{eligibleLegendaryAttributes[0].flavorText}&rdquo;
                  </em>
                </span>
              </div>
            ) : (
              eligibleLegendaryAttributes.map((attribute) => (
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
              ))
            )}
          </fieldset>
        ) : null}

        <div className="reroll-attributes">
          <h3>Attraction attributes</h3>
          {attributeGroups.map(([type, attributes]) =>
            attributes.map((attribute) => {
              const typeIcon = ATTRIBUTE_TYPE_ICONS[type];
              const rerollMinimum = getRerollMinimum(item, type);
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
                    {type === "special" || rerollMinimum > 0 ? (
                      <span>
                        (&gt;{Math.floor(rerollMinimum * 100)}%)
                      </span>
                    ) : null}
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
  variant?: "default" | "collector" | "enabled" | "gallery";
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
  title,
  emptyText,
  items,
  legendaryAttributes,
  researchArtworkIds,
  canCustomize,
  styleInventory,
  actions,
}: {
  title: string;
  emptyText: string;
  items: HydratedGameItem[];
  legendaryAttributes: LegendaryAttributeView[];
  researchArtworkIds: ReadonlySet<string>;
  canCustomize?: boolean;
  styleInventory: CardStyleInventory;
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
              actions={actions(item)}
              consigned={item.status === "auctioned"}
              item={item}
              legendaryAttributes={legendaryAttributes}
              key={getItemCardKey(item)}
              permissions={{
                canManageItem: true,
                canCustomizeCosmetic:
                  Boolean(canCustomize) && item.status !== "auctioned",
              }}
              researchTarget={researchArtworkIds.has(item.artwork_id)}
              styleInventory={styleInventory}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileFact({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getItemCardKey(item: HydratedGameItem): string {
  return `${item._id}:${JSON.stringify(item)}`;
}

function countdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

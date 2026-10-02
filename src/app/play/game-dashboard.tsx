"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";

import ArchiveEntryDialog from "@/components/archive-entry-dialog";
import CollectionBulkConfirmationDialog from "@/components/collection-bulk-confirmation-dialog";
import ForgeryDialog from "@/components/forgery-dialog";
import ArtworkThumbnail from "@/components/artwork-thumbnail";
import ItemThumbnail from "@/components/item-thumbnail";
import ItemTagsDialog from "@/components/item-tags-dialog";
import HallOfFamePanel from "@/components/hall-of-fame-panel";
import DailyEventsPanel from "@/components/daily-events-panel";
import {
  type RafflePrizeView,
} from "@/components/raffle-panel";
import EnterEraDialog from "@/components/enter-era-dialog";
import PlayHistoryPanel from "@/components/play-history-panel";
import type { PlaythroughSnapshot } from "@/server/playthrough-snapshots";
import type { HallOfFameDisplayRecord } from "@/server/hall-of-fame";
import {
  getGalleryPaintingDimension,
  getGalleryPixelsPerCentimeter,
} from "@/components/gallery-layout";
import ArchiveConfirmationDialog from "@/components/item-cards/archive-confirmation-dialog";
import AuctionListingDialog from "@/components/item-cards/auction-listing-dialog";
import ArtStyleDialog from "@/components/item-cards/art-style-dialog";
import {
  CARD_COSMETICS,
  type CardStyleInventory,
} from "@/components/item-cards/catalog";
import ItemCard from "@/components/item-cards/item-card";
import MintLossConfirmationDialog from "@/components/item-cards/mint-loss-confirmation-dialog";
import ValuableItemConfirmationDialog from "@/components/item-cards/valuable-item-confirmation-dialog";
import { resolveCardRendererId } from "@/components/item-cards/selection";
import { ratingColor } from "@/components/item-cards/shared";
import StandardItemDialog from "@/components/item-cards/standard-item-dialog";
import type {
  CardLegendaryAttribute,
  ItemDisplayOwner,
} from "@/components/item-cards/types";
import {
  type GalleryVisitorView,
  useGalleryVisitors,
} from "@/components/use-gallery-visitors";
import type { GalleryRates } from "@/server/collection-gameplay";
import {
  COLLECTION_FLAG_KEYS,
  COLLECTION_STATUSES,
  filterCollectionItems,
  getCollectionAttributeOptions,
  getCollectionTags,
  getDefaultCollectionFilters,
  getInventoryComparator,
  type CollectionAttributeOption,
  type CollectionFilters,
  type CollectionFlagKey,
  type CollectionFlagMode,
  type CollectionStatus,
} from "@/server/collection-inventory";
import type { CrateOfferView } from "@/server/crate-gameplay";
import {
  ARCHIVE_FILTER_CATEGORIES,
  filterAndSortArchiveEntries,
  getDefaultArchiveBrowseFilters,
  getArchivePropertyProgress,
  type ArchiveBrowseFilters,
  type ArchiveFilterCategory,
  type ArchiveFilterMode,
  type ArchiveSort,
} from "@/server/archive-gameplay";
import { planGallerySelection } from "@/server/gallery-selection";
import {
  isBulkLootCandidate,
  type BulkSaleProtections,
  shouldPreserveBulkSaleItem,
} from "@/server/bulk-sale";
import {
  getUnfulfilledHistorianTargetIds,
  type ArtHistorianQuestView,
} from "@/server/art-historian-gameplay";
import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type GameItem,
} from "@/server/gameplay";
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
  type NpcQuality,
} from "@/server/npc-gameplay";
import type { NpcRewardInteraction } from "@/server/standard-npc-rewards";
import type {
  InventorySort,
  PlayerViewSettings,
} from "@/server/player-view-settings";
import {
  getVisitorSocialBatteryCost,
  SOCIAL_BATTERY_MAX,
} from "@/server/social-battery";
import {
  getBulkAcquisitionRequirements,
  selectBulkPurchaseItems,
} from "@/server/bulk-acquisition";

import AuctionHouse, {
  AuctionBidDialog,
  WinningAuctionWatermark,
} from "./auctions/auction-house";
import type { AuctionView } from "@/server/auction-gameplay";
import GalleryExplorer, {
  type GalleryNpcView,
} from "./galleries/gallery-explorer";
import GalleryChat from "./galleries/gallery-chat";
import {
  buildGalleryMetadataSnapshot,
  type GalleryMetadataSnapshot,
} from "@/server/gallery-metadata-core";
import InfoPanel from "@/components/info-panel/info-panel";
import ProgressBar from "@/components/progress-bar/progress-bar";
import Attribute from "@/components/attribute/attribute";
import GalleryStats from "@/components/gallery-stats/gallery-stats";
import GalleryStat from "@/components/gallery-stat/gallery-stat";
import DisplayedSummary from "@/components/displayed-summary/displayed-summary";

type PlayerView = {
  screenName: string;
  bankBalance: number;
  level: number;
  isMaxLevel: boolean;
  xp: number;
  raffleTickets: number;
  inventoryCap: number;
  inventorySlotsUsed: number;
  displayCap: number;
  repairingCap: number;
  lastDrop: string;
  xpGoal: number;
  socialBattery: number;
  socialBatteryResetAt: string;
  karma: number;
  cardStyleInventory: CardStyleInventory;
  completedQuests: number;
  viewSettings: PlayerViewSettings;
};

type NpcView = GalleryVisitorView;

type NpcSpawnOption = {
  id: string;
  icon: string;
  name: string;
};

type LootCrateOffer = Omit<CrateOfferView, "id" | "quality"> & {
  id: string;
  quality: CrateOfferView["quality"] | "daily";
};

type LootEntry = {
  key: string;
  item: HydratedGameItem;
  auction: AuctionView | null;
};

type LootCategory = "unclaimed" | "for-sale" | "private-auctions";

type LegendaryAttributeView = CardLegendaryAttribute;

type LinkedItemView = {
  item: HydratedGameItem;
  displayOwner: ItemDisplayOwner | null;
};

type ArtworkOfferItem = HydratedGameItem & {
  alreadyOwned: boolean;
  price?: number;
};

type ActionDialogResult = {
  variant: "authenticated" | "destroyed" | "returned" | "mixed";
  title: string;
  message: string;
};

type CollectionBulkAction =
  | "display"
  | "take-down"
  | "set-gallery"
  | "tag"
  | "collector-sale"
  | "repair"
  | "sell"
  | "historian"
  | "archive"
  | "donate";

type CollectionDestructiveBulkAction = Extract<
  CollectionBulkAction,
  "sell" | "historian" | "archive" | "donate"
>;

type CollectionBulkAvailability = {
  allowed: boolean;
  reason?: string;
};

type LootBulkAction =
  | "archive"
  | "acquire"
  | "donate"
  | "remove"
  | "historian"
  | "purchase-donate"
  | "collector-sale";

type LootDestructiveBulkAction = Extract<
  LootBulkAction,
  "archive" | "donate" | "remove" | "historian" | "purchase-donate"
>;

type CollectorResult = {
  type: "art-collector-result";
  npcId: string;
  npcName: string;
  quality: NpcQuality;
  item: HydratedGameItem;
  forgeryCaught: boolean;
  itemDestroyed: boolean;
  keptItem: boolean;
  rewardType: "money" | "xp" | null;
  rewardAmount: number;
  bonusMoney?: number;
  bonusOffers: number;
};

type ArtExpertResult = {
  type: "art-expert-karma";
  npcId: string;
  npcName: string;
  quality: NpcQuality;
  item: HydratedGameItem;
  karma: number;
  xpBonus: number;
  bonusMoney: number;
};

type ArtHistorianResult = {
  type: "art-historian-quest";
  npcId: string;
  npcName: string;
  quality: NpcQuality;
  quest: ArtHistorianQuestView;
};

type ArtExpertRerollResult = {
  type: "art-expert-reroll";
  npcId: string;
  npcName: string;
  quality: NpcQuality;
  itemTitle: string;
  previousRollCount: number;
  rollCount: number;
  xpBonus: number;
  bonusMoney: number;
};

type PreservationistResult = {
  type: "preservationist-result";
  npcId: string;
  npcName: string;
  quality: NpcQuality;
  itemTitle: string;
  condition: number;
  previousCondition: number;
  repairedAmount: number;
};

type NpcEffectToken = {
  icon: string;
  text?: string;
  tone: "karma" | "money" | "negative" | "positive" | "repair" | "xp";
};

type NpcVisualEffect = {
  animationId: number;
  label: string;
  npcId: string;
  originX: number;
  originY: number;
  tokens: NpcEffectToken[];
};

const ATTRIBUTE_TYPE_ICONS = {
  special: { icon: "fa-star", label: "Special attribute" },
  locked: null,
  unlocked: { icon: "fa-unlock-alt", label: "Unlocked attribute" },
} as const;

export default function GameDashboard({
  player,
  items,
  archiveArtStyleIds,
  archives,
  galleryRates,
  galleryMetadata,
  impersonating,
  canMakePrivateAuctionsPublic,
  canRerollDisplayed,
  levelUpDiscountAvailable,
  levelUpConditionMinimum,
  legendaryAttributes,
  npcSpawnOptions,
  npcSpawnIntervalMinutes,
  crateOffers,
  raffle,
  dailyEventDay,
  dailyDropCooldownMinutes,
  dailyDropCount,
  dealerPriceMultiplier,
  debugEnabled,
  npcs,
  quests,
  playerId,
  marketExpertExpiration,
  linkedItem,
  forgePricing,
  activeAuctionCount = 0,
  privateAuctions = [],
  hallOfFameRecords = [],
  playthroughSnapshots = [],
  vintageConsiderationCount = 10,
}: {
  player: PlayerView;
  items: HydratedGameItem[];
  archiveArtStyleIds: string[];
  archives: HydratedPlayerArtworkArchive[];
  galleryRates: GalleryRates;
  galleryMetadata: GalleryMetadataSnapshot | null;
  impersonating: boolean;
  canMakePrivateAuctionsPublic: boolean;
  canRerollDisplayed: boolean;
  levelUpDiscountAvailable: boolean;
  levelUpConditionMinimum: number;
  legendaryAttributes: LegendaryAttributeView[];
  npcSpawnOptions: NpcSpawnOption[];
  npcSpawnIntervalMinutes: number;
  crateOffers: CrateOfferView[];
  raffle: {
    availableTickets: number;
    nextDrawAt: string;
    prizes: RafflePrizeView[];
    previousWinners: import("@/server/raffle-gameplay").RaffleWinner[];
  };
  dailyEventDay: number;
  dailyDropCooldownMinutes: number;
  dailyDropCount: number;
  dealerPriceMultiplier: number;
  debugEnabled: boolean;
  npcs: NpcView[];
  quests: ArtHistorianQuestView[];
  playerId: string;
  marketExpertExpiration: string | null;
  linkedItem: LinkedItemView | null;
  forgePricing: {
    lootData: import("@/server/gameplay").LootData;
    mintValueMultiplier: number;
    seasonalArtworkIds: string[];
  };
  activeAuctionCount?: number;
  privateAuctions?: AuctionView[];
  hallOfFameRecords?: HallOfFameDisplayRecord[];
  playthroughSnapshots?: PlaythroughSnapshot[];
  vintageConsiderationCount?: number;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const searchParams = useSearchParams();
  const initialGalleryId = searchParams.get("gallery");
  const initialSection = searchParams.get("section");
  const [section, setSection] = useState<
    | "profile"
    | "collection"
    | "inventory"
    | "loot"
    | "gallery"
    | "explore"
    | "archive"
    | "quests"
    | "auctions"
    | "daily"
    | "history"
  >(
    initialGalleryId
      ? "explore"
      : initialSection === "social" || initialSection === "profile"
        ? "profile"
        : initialSection === "history"
          ? "history"
          : initialSection === "daily" || initialSection === "raffle"
            ? "daily"
            : initialSection === "auctions"
              ? "auctions"
              : initialSection === "loot"
                ? "loot"
                : initialSection === "explore"
                  ? "explore"
                  : initialSection === "archive"
                    ? "archive"
                    : initialSection === "quests"
                      ? "quests"
                      : "collection",
  );
  const [exploreResetKey, setExploreResetKey] = useState(0);
  const [exploreGalleryId, setExploreGalleryId] = useState<string | null>(
    initialGalleryId,
  );
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionDialog, setActionDialog] =
    useState<ActionDialogResult | null>(null);
  const [crateOpening, setCrateOpening] = useState<{
    crateId: string;
    phase: "opening" | "opened" | "error";
  } | null>(null);
  const [cratePurchaseCount, setCratePurchaseCount] = useState(1);
  const [revealedLootIds, setRevealedLootIds] = useState<string[]>([]);
  const [sellAllEarnings, setSellAllEarnings] = useState<{
    amount: number;
    animationId: number;
  } | null>(null);
  const [donateAllEarnings, setDonateAllEarnings] = useState<{
    karma: number;
    animationId: number;
  } | null>(null);
  const [donationEffects, setDonationEffects] = useState<
    Record<string, { animationId: number; recoveredStyle: boolean }>
  >({});
  const [karmaBalance, setKarmaBalance] = useState(player.karma);
  const [socialBattery, setSocialBattery] = useState(player.socialBattery);
  const [meetingNpc, setMeetingNpc] = useState<string | null>(null);
  const [createdPrivateAuctions, setCreatedPrivateAuctions] =
    useState<AuctionView[]>([]);
  const [dismissedPrivateAuctionIds, setDismissedPrivateAuctionIds] =
    useState<string[]>([]);
  const [madePublicPrivateAuctionIds, setMadePublicPrivateAuctionIds] =
    useState<string[]>([]);
  const [selectedPrivateAuction, setSelectedPrivateAuction] =
    useState<AuctionView | null>(null);
  const [npcRewardEffects, setNpcRewardEffects] = useState<
    Record<string, NpcVisualEffect>
  >({});
  const npcEffectSequence = useRef(0);
  const [rerollSession, setRerollSession] = useState<{
    item: HydratedGameItem;
    bankBalance: number;
    karma: number;
  } | null>(null);
  const [galleryItemDetails, setGalleryItemDetails] =
    useState<HydratedGameItem | null>(null);
  const [selectedCollectionItemIds, setSelectedCollectionItemIds] = useState<
    string[] | null
  >(null);
  const collectionLongPressRef = useRef<{
    itemId: string;
    timer: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressedCollectionClickRef = useRef<string | null>(null);
  const [collectionBulkConfirmation, setCollectionBulkConfirmation] =
    useState<CollectionDestructiveBulkAction | null>(null);
  const [selectedLootEntryKeys, setSelectedLootEntryKeys] = useState<
    string[] | null
  >(null);
  const [lootCategory, setLootCategory] =
    useState<LootCategory>("unclaimed");
  const lootLongPressRef = useRef<{
    itemId: string;
    timer: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressedLootClickRef = useRef<string | null>(null);
  const [lootBulkConfirmation, setLootBulkConfirmation] =
    useState<LootDestructiveBulkAction | null>(null);
  const [archiveFilters, setArchiveFilters] = useState<ArchiveBrowseFilters>(
    getDefaultArchiveBrowseFilters,
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSocialBattery(player.socialBattery),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [player.socialBattery]);

  useEffect(() => {
    const resetAt = new Date(player.socialBatteryResetAt).getTime();
    if (!Number.isFinite(resetAt)) return;
    const delay = resetAt - Date.now() + 1_000;
    if (delay <= 0) {
      router.refresh();
      return;
    }
    const timer = window.setTimeout(
      () => router.refresh(),
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [player.socialBatteryResetAt, router]);
  const [bulkSaleProtections, setBulkSaleProtections] =
    useState<BulkSaleProtections>(player.viewSettings.bulkSaleProtections);
  const [inventorySort, setInventorySort] = useState<InventorySort>(
    player.viewSettings.inventorySort,
  );
  const [collectionFilters, setCollectionFilters] = useState<CollectionFilters>(
    getDefaultCollectionFilters,
  );
  const [tagEditorItems, setTagEditorItems] = useState<HydratedGameItem[]>([]);
  const [linkedItemDetails, setLinkedItemDetails] =
    useState<LinkedItemView | null>(linkedItem);
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
  const [valuableItemConfirmation, setValuableItemConfirmation] = useState<{
    action: "sell" | "donate";
    item: HydratedGameItem;
  } | null>(null);
  const [historianSubmissionItem, setHistorianSubmissionItem] =
    useState<HydratedGameItem | null>(null);
  const [archiveEntryDetails, setArchiveEntryDetails] =
    useState<HydratedPlayerArtworkArchive | null>(null);
  const [forgeryDialogInitialArchiveId, setForgeryDialogInitialArchiveId] =
    useState<string | null | undefined>(undefined);
  const [vintageDialogOpen, setVintageDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    markVisitorMet,
    removeVisitor,
    refreshVisitors,
    visitors: galleryVisitors,
  } = useGalleryVisitors({
    enabled: section === "gallery",
    initialVisitors: npcs,
    ownerId: playerId,
    spawnIntervalMinutes: npcSpawnIntervalMinutes,
  });

  useEffect(() => {
    function updateKarma(event: Event) {
      const karma = (event as CustomEvent<number>).detail;
      if (Number.isFinite(karma)) setKarmaBalance(karma);
    }
    window.addEventListener("artfunkel:karma-change", updateKarma);
    return () =>
      window.removeEventListener("artfunkel:karma-change", updateKarma);
  }, []);

  const unclaimed = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.status === "unclaimed" || item.status === "for_sale",
        )
        .sort(
          (left, right) =>
            right.values.actual - left.values.actual ||
            Date.parse(right.date_created) - Date.parse(left.date_created) ||
            left._id.localeCompare(right._id),
        ),
    [items],
  );
  const activePrivateAuctionLoot = useMemo(
    () => {
      const byId = new Map(
        [...createdPrivateAuctions, ...privateAuctions].map((auction) => [
          auction._id,
          auction,
        ]),
      );
      return [...byId.values()].filter(
        (auction) =>
          !dismissedPrivateAuctionIds.includes(auction._id) &&
          !madePublicPrivateAuctionIds.includes(auction._id) &&
          Date.parse(auction.expiration) > now,
      );
    },
    [
      createdPrivateAuctions,
      dismissedPrivateAuctionIds,
      madePublicPrivateAuctionIds,
      now,
      privateAuctions,
    ],
  );
  const unclaimedLootEntries = useMemo<LootEntry[]>(
    () =>
      unclaimed
        .filter((item) => item.status === "unclaimed")
        .map((item) => ({ key: item._id, item, auction: null })),
    [unclaimed],
  );
  const forSaleLootEntries = useMemo<LootEntry[]>(
    () =>
      unclaimed
        .filter((item) => item.status === "for_sale")
        .map((item) => ({ key: item._id, item, auction: null })),
    [unclaimed],
  );
  const privateAuctionLootEntries = useMemo<LootEntry[]>(
    () =>
      activePrivateAuctionLoot
        .map((auction) => ({
          key: `auction:${auction._id}`,
          item: auction.item,
          auction,
        }))
        .sort(
          (left, right) =>
            right.item.values.actual - left.item.values.actual ||
            Date.parse(right.item.date_created) -
              Date.parse(left.item.date_created) ||
            left.key.localeCompare(right.key),
        ),
    [activePrivateAuctionLoot],
  );
  const lootEntries = useMemo(
    () =>
      [
        ...unclaimedLootEntries,
        ...forSaleLootEntries,
        ...privateAuctionLootEntries,
      ].sort(
        (left, right) =>
          right.item.values.actual - left.item.values.actual ||
          Date.parse(right.item.date_created) -
            Date.parse(left.item.date_created) ||
          left.key.localeCompare(right.key),
      ),
    [forSaleLootEntries, privateAuctionLootEntries, unclaimedLootEntries],
  );
  const availableLootCategories = (
    [
      {
        id: "unclaimed",
        label: "Unclaimed",
        entries: unclaimedLootEntries,
      },
      {
        id: "for-sale",
        label: "For Sale by Owner",
        entries: forSaleLootEntries,
      },
      {
        id: "private-auctions",
        label: "Private Auctions",
        entries: privateAuctionLootEntries,
      },
    ] satisfies Array<{
      id: LootCategory;
      label: string;
      entries: LootEntry[];
    }>
  ).filter((category) => category.entries.length > 0);
  const activeLootCategory =
    availableLootCategories.find((category) => category.id === lootCategory) ??
    availableLootCategories[0] ??
    null;
  const activeLootEntries = activeLootCategory?.entries ?? [];
  const defaultLootEntryKey = activeLootEntries[0]?.key ?? null;
  const effectiveSelectedLootEntryKeys =
    selectedLootEntryKeys ??
    (defaultLootEntryKey ? [defaultLootEntryKey] : []);
  let selectedLootEntries = effectiveSelectedLootEntryKeys
    .map((entryKey) =>
      activeLootEntries.find((entry) => entry.key === entryKey),
    )
    .filter((entry): entry is LootEntry => Boolean(entry));
  if (
    selectedLootEntryKeys &&
    selectedLootEntryKeys.length > 0 &&
    selectedLootEntries.length === 0 &&
    activeLootEntries[0]
  ) {
    selectedLootEntries = [activeLootEntries[0]];
  }
  const selectedLootEntryKeysSet = new Set(
    selectedLootEntries.map((entry) => entry.key),
  );
  const selectedLootEntry =
    selectedLootEntries.length === 1 ? selectedLootEntries[0] : null;
  const selectedLootItem = selectedLootEntry?.item ?? null;
  const selectedLootAuction = selectedLootEntry?.auction ?? null;
  const unfoundQuestTargetArtworkIds = useMemo(
    () =>
      new Set(
        quests.flatMap((quest) =>
          quest.targets
            .filter((target) => !target.fulfilled)
            .map((target) => target.artwork._id),
        ),
      ),
    [quests],
  );
  const bulkSellableLoot = useMemo(
    () =>
      unclaimed.filter(
        (item) =>
          item.status === "unclaimed" &&
          !item.permanent &&
          !shouldPreserveBulkSaleItem(
            {
              ...item,
              unfoundQuestTarget: unfoundQuestTargetArtworkIds.has(
                item.artwork_id,
              ),
            },
            bulkSaleProtections,
          ),
      ),
    [bulkSaleProtections, unfoundQuestTargetArtworkIds, unclaimed],
  );
  const bulkDeclinableLoot = useMemo(
    () =>
      unclaimed.filter(
        (item) =>
          item.status === "for_sale" &&
          !item.permanent &&
          !shouldPreserveBulkSaleItem(
            {
              ...item,
              unfoundQuestTarget: unfoundQuestTargetArtworkIds.has(
                item.artwork_id,
              ),
            },
            bulkSaleProtections,
          ),
      ),
    [bulkSaleProtections, unfoundQuestTargetArtworkIds, unclaimed],
  );
  const bulkDismissiblePrivateAuctions = useMemo(
    () =>
      activePrivateAuctionLoot.filter(
        (auction) =>
          isBulkLootCandidate(auction.item) &&
          !shouldPreserveBulkSaleItem(
            {
              ...auction.item,
              unfoundQuestTarget: unfoundQuestTargetArtworkIds.has(
                auction.item.artwork_id,
              ),
            },
            bulkSaleProtections,
          ),
      ),
    [
      bulkSaleProtections,
      activePrivateAuctionLoot,
      unfoundQuestTargetArtworkIds,
    ],
  );
  const availableInventorySlots = Math.max(
    0,
    player.inventoryCap - player.inventorySlotsUsed,
  );
  const purchaseDonateAllSelection = useMemo(
    () =>
      selectBulkPurchaseItems(
        bulkDeclinableLoot,
        availableInventorySlots > 0 ? bulkDeclinableLoot.length : 0,
        player.bankBalance,
        (item) => Math.floor(item.values.dealer * dealerPriceMultiplier),
      ),
    [
      availableInventorySlots,
      bulkDeclinableLoot,
      dealerPriceMultiplier,
      player.bankBalance,
    ],
  );
  const inventory = useMemo(
    () =>
      items.filter(
        (item) => item.status === "claimed" || item.status === "auctioned",
      ),
    [items],
  );
  const sortedInventory = useMemo(
    () => [...inventory].sort(getInventoryComparator(inventorySort)),
    [inventory, inventorySort],
  );
  const displayed = useMemo(
    () => items.filter((item) => item.status === "displayed"),
    [items],
  );
  const collectionItems = useMemo(
    () => [...displayed, ...inventory],
    [displayed, inventory],
  );
  const collectionTags = useMemo(
    () => getCollectionTags(collectionItems),
    [collectionItems],
  );
  const collectionArtStyleOptions = useMemo(() => {
    const styleIds = new Set(
      collectionItems.map((item) => item.card_renderer ?? "museum"),
    );
    return CARD_COSMETICS.filter((style) => styleIds.has(style.id)).map(
      (style) => ({
        id: style.id,
        label: style.id === "museum" ? "Default" : style.name,
      }),
    );
  }, [collectionItems]);
  const collectionAttributeOptions = useMemo(
    () => getCollectionAttributeOptions(collectionItems),
    [collectionItems],
  );
  const collectionSpecialAttributeOptions = useMemo(
    () => getCollectionAttributeOptions(collectionItems, true),
    [collectionItems],
  );
  const normalizedCollectionFilters = useMemo(
    () => ({
      ...collectionFilters,
      tag:
        collectionFilters.tag && !collectionTags.includes(collectionFilters.tag)
          ? ""
          : collectionFilters.tag,
      artStyle:
        collectionFilters.artStyle &&
        !collectionArtStyleOptions.some(
          (style) => style.id === collectionFilters.artStyle,
        )
          ? ""
          : collectionFilters.artStyle,
    }),
    [collectionArtStyleOptions, collectionFilters, collectionTags],
  );
  const filteredCollectionItems = useMemo(
    () =>
      filterCollectionItems(collectionItems, normalizedCollectionFilters, now),
    [collectionItems, normalizedCollectionFilters, now],
  );
  const sortedHomeInventory = useMemo(
    () =>
      [...filteredCollectionItems].sort(getInventoryComparator(inventorySort)),
    [filteredCollectionItems, inventorySort],
  );
  const archiveEntries = useMemo(
    () =>
      archives.map((archive) => {
        const progress = getArchivePropertyProgress(archive, {
          activeArtStyles: archiveArtStyleIds,
          seasonalEligible: forgePricing.seasonalArtworkIds.includes(
            archive.artwork_id,
          ),
        });
        return {
          archive,
          progress,
          complete: progress.archived >= progress.total,
        };
      }),
    [archiveArtStyleIds, archives, forgePricing.seasonalArtworkIds],
  );
  const archiveArtStyleOptions = useMemo(() => {
    const styleIds = new Set(archives.flatMap((archive) => archive.artStyles));
    const knownStyles = CARD_COSMETICS.filter((style) =>
      styleIds.has(style.id),
    ).map((style) => ({
      id: style.id,
      label: `#${style.number.toString().padStart(2, "0")} ${style.name}`,
    }));
    const knownIds = new Set<string>(knownStyles.map((style) => style.id));
    const historicalStyles = [...styleIds]
      .filter((styleId) => !knownIds.has(styleId))
      .sort((left, right) => left.localeCompare(right))
      .map((styleId) => ({ id: styleId, label: styleId }));
    return [...knownStyles, ...historicalStyles];
  }, [archives]);
  const normalizedArchiveFilters = useMemo(
    () => ({
      ...archiveFilters,
      artStyle:
        archiveFilters.artStyle &&
        !archiveArtStyleOptions.some(
          (style) => style.id === archiveFilters.artStyle,
        )
          ? ""
          : archiveFilters.artStyle,
    }),
    [archiveArtStyleOptions, archiveFilters],
  );
  const filteredArchiveEntries = useMemo(
    () =>
      filterAndSortArchiveEntries(archiveEntries, normalizedArchiveFilters),
    [archiveEntries, normalizedArchiveFilters],
  );
  const defaultCollectionItemId = sortedHomeInventory[0]?._id ?? null;
  const effectiveSelectedCollectionItemIds =
    selectedCollectionItemIds ??
    (defaultCollectionItemId ? [defaultCollectionItemId] : []);
  const selectedCollectionItems = effectiveSelectedCollectionItemIds
    .map((itemId) =>
      collectionItems.find((item) => item._id === itemId),
    )
    .filter((item): item is HydratedGameItem => Boolean(item));
  const selectedCollectionItemIdsSet = new Set(
    selectedCollectionItems.map((item) => item._id),
  );
  const selectedCollectionItem =
    selectedCollectionItems.length === 1 ? selectedCollectionItems[0] : null;
  const collectionBulkTotalValue = selectedCollectionItems.reduce(
    (sum, item) => sum + item.values.actual,
    0,
  );
  const collectionBulkAttributeScore = buildGalleryMetadataSnapshot(
    selectedCollectionItems,
    player.displayCap,
  ).score;
  const repairingCount = items.filter((item) => item.repairing).length;
  const collectionBulkState = useMemo(
    () =>
      getCollectionBulkState({
        collectionItems,
        displayCap: player.displayCap,
        quests,
        repairingCap: player.repairingCap,
        repairingCount,
        selectedItems: selectedCollectionItems,
      }),
    [
      collectionItems,
      player.displayCap,
      player.repairingCap,
      quests,
      repairingCount,
      selectedCollectionItems,
    ],
  );
  const collectionBulkConfirmationCopy = collectionBulkConfirmation
    ? getCollectionBulkConfirmationCopy(
        collectionBulkConfirmation,
        selectedCollectionItems,
      )
    : null;
  const lootBulkTotalValue = selectedLootEntries.reduce(
    (sum, entry) => sum + entry.item.values.actual,
    0,
  );
  const lootBulkState = useMemo(
    () =>
      getLootBulkState({
        availableInventorySlots,
        bankBalance: player.bankBalance,
        dealerPriceMultiplier,
        quests,
        selectedEntries: selectedLootEntries,
      }),
    [
      availableInventorySlots,
      dealerPriceMultiplier,
      player.bankBalance,
      quests,
      selectedLootEntries,
    ],
  );
  const lootBulkConfirmationCopy = lootBulkConfirmation
    ? getLootBulkConfirmationCopy(
        lootBulkConfirmation,
        selectedLootEntries.map((entry) => entry.item),
      )
    : null;
  const vintageCandidates = useMemo(
    () =>
      items.filter(
        (item) =>
          (item.status === "claimed" || item.status === "displayed") &&
          !item.vintage &&
          !item.original &&
          !item.repairing,
      ),
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

  function act(url: string, onSuccess?: () => void) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch(url, { method: "POST" });
      const body = (await response.json()) as {
        actionDialog?: ActionDialogResult;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        const message = body.error ?? "The action could not be completed.";
        setError(message);
        return;
      }

      if (body.message) {
        setNotice(body.message);
      }
      if (body.actionDialog) {
        setActionDialog(body.actionDialog);
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function updateCollectionItemSelection(
    itemId: string,
    extendSelection: boolean,
  ) {
    setSelectedCollectionItemIds((current) => {
      const selection =
        current ?? (defaultCollectionItemId ? [defaultCollectionItemId] : []);
      if (!extendSelection) {
        if (selection.length === 1 && selection[0] === itemId) {
          return [];
        }
        return [itemId];
      }
      if (selection.includes(itemId)) {
        return selection.filter((selectedId) => selectedId !== itemId);
      }
      return [...selection, itemId];
    });
  }

  function toggleCollectionItemSelection(
    itemId: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (suppressedCollectionClickRef.current === itemId) {
      suppressedCollectionClickRef.current = null;
      return;
    }
    updateCollectionItemSelection(itemId, event.ctrlKey || event.metaKey);
  }

  function startCollectionItemLongPress(
    itemId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!event.isPrimary || event.button !== 0) return;
    cancelCollectionItemLongPress();
    collectionLongPressRef.current = {
      itemId,
      timer: window.setTimeout(() => {
        collectionLongPressRef.current = null;
        suppressedCollectionClickRef.current = itemId;
        window.setTimeout(() => {
          if (suppressedCollectionClickRef.current === itemId) {
            suppressedCollectionClickRef.current = null;
          }
        }, 1_000);
        updateCollectionItemSelection(itemId, true);
      }, 500),
      x: event.clientX,
      y: event.clientY,
    };
  }

  function moveCollectionItemLongPress(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const longPress = collectionLongPressRef.current;
    if (
      longPress &&
      Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > 10
    ) {
      cancelCollectionItemLongPress();
    }
  }

  function cancelCollectionItemLongPress() {
    const longPress = collectionLongPressRef.current;
    if (!longPress) return;
    window.clearTimeout(longPress.timer);
    collectionLongPressRef.current = null;
  }

  function updateLootEntrySelection(
    entryKey: string,
    extendSelection: boolean,
  ) {
    setSelectedLootEntryKeys((current) => {
      const selection =
        current ?? (defaultLootEntryKey ? [defaultLootEntryKey] : []);
      if (!extendSelection) {
        if (selection.length === 1 && selection[0] === entryKey) {
          return [];
        }
        return [entryKey];
      }
      if (selection.includes(entryKey)) {
        return selection.filter((selectedKey) => selectedKey !== entryKey);
      }
      return [...selection, entryKey];
    });
  }

  function selectLootCategory(category: {
    id: LootCategory;
    entries: LootEntry[];
  }) {
    setLootCategory(category.id);
    setSelectedLootEntryKeys(
      category.entries[0] ? [category.entries[0].key] : [],
    );
  }

  function toggleLootEntrySelection(
    entryKey: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (suppressedLootClickRef.current === entryKey) {
      suppressedLootClickRef.current = null;
      return;
    }
    updateLootEntrySelection(entryKey, event.ctrlKey || event.metaKey);
  }

  function startLootEntryLongPress(
    entryKey: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!event.isPrimary || event.button !== 0) return;
    cancelLootEntryLongPress();
    lootLongPressRef.current = {
      itemId: entryKey,
      timer: window.setTimeout(() => {
        lootLongPressRef.current = null;
        suppressedLootClickRef.current = entryKey;
        window.setTimeout(() => {
          if (suppressedLootClickRef.current === entryKey) {
            suppressedLootClickRef.current = null;
          }
        }, 1_000);
        updateLootEntrySelection(entryKey, true);
      }, 500),
      x: event.clientX,
      y: event.clientY,
    };
  }

  function moveLootEntryLongPress(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const longPress = lootLongPressRef.current;
    if (
      longPress &&
      Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y) > 10
    ) {
      cancelLootEntryLongPress();
    }
  }

  function cancelLootEntryLongPress() {
    const longPress = lootLongPressRef.current;
    if (!longPress) return;
    window.clearTimeout(longPress.timer);
    lootLongPressRef.current = null;
  }

  function requestCollectionBulkAction(action: CollectionBulkAction) {
    const availability = collectionBulkState.availability[action];
    if (!availability.allowed) {
      setError(availability.reason ?? "The selected items do not qualify.");
      return;
    }
    setError("");
    setNotice("");
    if (action === "tag") {
      setTagEditorItems([...selectedCollectionItems]);
      return;
    }
    if (isDestructiveCollectionBulkAction(action)) {
      setCollectionBulkConfirmation(action);
      return;
    }
    performCollectionBulkAction(action);
  }

  function performCollectionBulkAction(action: CollectionBulkAction) {
    if (action === "tag") {
      setTagEditorItems([...selectedCollectionItems]);
      return;
    }
    const selectedItems = [...selectedCollectionItems];
    const historianQuestByItemId = new Map(
      collectionBulkState.historianQuestByItemId,
    );
    startTransition(async () => {
      let completed = 0;
      let totalMoney = 0;
      let totalKarma = 0;
      const specialOutcomes: ActionDialogResult[] = [];

      async function postAction(
        url: string,
        body?: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        const response = await fetch(url, {
          method: "POST",
          ...(body
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        });
        const result = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!response.ok) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "The bulk action could not be completed.",
          );
        }
        return result;
      }

      try {
        if (action === "set-gallery") {
          const result = await postAction("/api/play/items/set-gallery", {
            itemIds: selectedItems.map((item) => item._id),
          });
          setNotice(
            typeof result.message === "string"
              ? result.message
              : "Gallery updated.",
          );
        } else {
          for (const item of selectedItems) {
            if (action === "display" && item.status === "displayed") {
              completed += 1;
              continue;
            }

            let result: Record<string, unknown>;
            if (action === "take-down") {
              result = await postAction(
                `/api/play/items/${item._id}/undisplay`,
              );
            } else if (action === "collector-sale") {
              result = await postAction(
                `/api/play/items/${item._id}/collector-sale`,
                { offered: true },
              );
            } else if (action === "historian") {
              const questId = historianQuestByItemId.get(item._id);
              if (!questId) {
                throw new Error(
                  `${item.artwork.title} no longer has an available Historian quest.`,
                );
              }
              result = await postAction(
                `/api/play/items/${item._id}/send-to-historian`,
                { questId },
              );
              if (typeof result.autoClaimQuestId === "string") {
                await postAction(
                  `/api/play/quests/${result.autoClaimQuestId}/claim`,
                );
              }
            } else {
              result = await postAction(
                `/api/play/items/${item._id}/${action}`,
              );
            }

            if (typeof result.amount === "number") {
              totalMoney += result.amount;
            }
            if (typeof result.karma === "number") {
              totalKarma += result.karma;
            }
            if (isActionDialogResult(result.actionDialog)) {
              specialOutcomes.push(result.actionDialog);
            }
            completed += 1;
          }

          if (specialOutcomes.length > 0) {
            setActionDialog({
              variant:
                specialOutcomes.length === 1
                  ? specialOutcomes[0].variant
                  : "mixed",
              title:
                specialOutcomes.length === 1
                  ? specialOutcomes[0].title
                  : "Bulk action outcomes",
              message: specialOutcomes
                .map((outcome) => outcome.message)
                .join(" "),
            });
            setNotice(
              `${completed} selected ${completed === 1 ? "item was" : "items were"} processed; ${specialOutcomes.length} had special forgery outcomes.`,
            );
          } else {
            setNotice(
              getCollectionBulkSuccessMessage(
                action,
                selectedItems.length,
                totalMoney,
                totalKarma,
              ),
            );
          }
        }
        setSelectedCollectionItemIds([]);
        router.refresh();
      } catch (bulkError) {
        const message =
          bulkError instanceof Error
            ? bulkError.message
            : "The bulk action could not be completed.";
        setError(
          completed > 0
            ? `${completed} of ${selectedItems.length} items were processed before the action stopped. ${message}`
            : message,
        );
        setSelectedCollectionItemIds([]);
        router.refresh();
      }
    });
  }

  function requestLootBulkAction(action: LootBulkAction) {
    const availability = lootBulkState.availability[action];
    if (!availability.allowed) {
      setError(availability.reason ?? "The selected offers do not qualify.");
      return;
    }
    setError("");
    setNotice("");
    const dismissingPrivateAuctions =
      activeLootCategory?.id === "private-auctions" && action === "remove";
    if (isDestructiveLootBulkAction(action) && !dismissingPrivateAuctions) {
      setLootBulkConfirmation(action);
      return;
    }
    performLootBulkAction(action);
  }

  function performLootBulkAction(action: LootBulkAction) {
    const selectedEntries = [...selectedLootEntries];
    const historianQuestByItemId = new Map(
      lootBulkState.historianQuestByItemId,
    );
    startTransition(async () => {
      let completed = 0;
      let totalMoney = 0;
      let totalKarma = 0;
      const dismissedAuctionIds: string[] = [];
      const specialOutcomes: ActionDialogResult[] = [];

      async function postAction(
        url: string,
        body?: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        const response = await fetch(url, {
          method: "POST",
          ...(body
            ? {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        });
        const result = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (!response.ok) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "The bulk offer action could not be completed.",
          );
        }
        return result;
      }

      try {
        if (action === "acquire" || action === "collector-sale") {
          const result = await postAction("/api/play/items/acquire-many", {
            itemIds: selectedEntries.map((entry) => entry.item._id),
            mode: "selected",
            setForSale: action === "collector-sale",
          });
          completed = selectedEntries.length;
          setNotice(
            typeof result.message === "string"
              ? result.message
              : `${completed} selected offers were collected.`,
          );
        } else {
          for (const entry of selectedEntries) {
            let result: Record<string, unknown>;
            if (action === "remove") {
              if (entry.auction) {
                result = await postAction(
                  `/api/play/auctions/${entry.auction._id}/dismiss`,
                );
                dismissedAuctionIds.push(entry.auction._id);
              } else {
                result = await postAction(
                  `/api/play/items/${entry.item._id}/${
                    entry.item.status === "for_sale" ? "decline" : "sell"
                  }`,
                );
              }
            } else if (action === "purchase-donate") {
              await postAction(
                `/api/play/items/${entry.item._id}/purchase`,
              );
              result = await postAction(
                `/api/play/items/${entry.item._id}/donate`,
              );
            } else if (action === "historian") {
              const questId = historianQuestByItemId.get(entry.item._id);
              if (!questId) {
                throw new Error(
                  `${entry.item.artwork.title} no longer has an available Historian quest.`,
                );
              }
              const acquisitionAction =
                entry.item.status === "for_sale" ? "purchase" : "claim";
              await postAction(
                `/api/play/items/${entry.item._id}/${acquisitionAction}`,
              );
              result = await postAction(
                `/api/play/items/${entry.item._id}/send-to-historian`,
                { questId },
              );
              if (typeof result.autoClaimQuestId === "string") {
                await postAction(
                  `/api/play/quests/${result.autoClaimQuestId}/claim`,
                );
              }
            } else {
              result = await postAction(
                `/api/play/items/${entry.item._id}/${action}`,
              );
            }

            if (typeof result.amount === "number") {
              totalMoney += result.amount;
            }
            if (typeof result.karma === "number") {
              totalKarma += result.karma;
            }
            if (isActionDialogResult(result.actionDialog)) {
              specialOutcomes.push(result.actionDialog);
            }
            completed += 1;
          }

          if (specialOutcomes.length > 0) {
            setActionDialog({
              variant:
                specialOutcomes.length === 1
                  ? specialOutcomes[0].variant
                  : "mixed",
              title:
                specialOutcomes.length === 1
                  ? specialOutcomes[0].title
                  : "Bulk action outcomes",
              message: specialOutcomes
                .map((outcome) => outcome.message)
                .join(" "),
            });
          }
          setNotice(
            getLootBulkSuccessMessage(
              action,
              completed,
              totalMoney,
              totalKarma,
            ),
          );
        }

        if (dismissedAuctionIds.length > 0) {
          const dismissedIds = new Set(dismissedAuctionIds);
          setCreatedPrivateAuctions((current) =>
            current.filter((auction) => !dismissedIds.has(auction._id)),
          );
          setDismissedPrivateAuctionIds((current) => [
            ...new Set([...current, ...dismissedAuctionIds]),
          ]);
        }
        setSelectedLootEntryKeys([]);
        router.refresh();
      } catch (bulkError) {
        const message =
          bulkError instanceof Error
            ? bulkError.message
            : "The bulk offer action could not be completed.";
        setError(
          completed > 0
            ? `${completed} of ${selectedEntries.length} offers were processed before the action stopped. ${message}`
            : message,
        );
        setSelectedLootEntryKeys([]);
        router.refresh();
      }
    });
  }

  function historianQuestsForItem(item: HydratedGameItem) {
    return quests.filter((quest) =>
      getUnfulfilledHistorianTargetIds(quest).includes(item.artwork_id),
    );
  }

  function historianSubmissionDisabledReason(
    item: HydratedGameItem,
    matchingQuestCount: number,
  ) {
    if (item.permanent) {
      return "Permanent artwork cannot be sent to the Historian.";
    }
    if (item.repairing) {
      return "Stop repairing this artwork before sending it to the Historian.";
    }
    if (matchingQuestCount === 0) {
      return "This artwork is not needed by an active quest.";
    }
    return undefined;
  }

  function requestHistorianSubmission(item: HydratedGameItem) {
    const matchingQuests = historianQuestsForItem(item);
    if (historianSubmissionDisabledReason(item, matchingQuests.length)) return;
    if (matchingQuests.length === 1) {
      void sendItemToHistorian(item, matchingQuests[0]._id);
      return;
    }
    setHistorianSubmissionItem(item);
  }

  async function sendItemToHistorian(
    item: HydratedGameItem,
    questId: string,
  ) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const acquisitionUrl =
        item.status === "unclaimed"
          ? `/api/play/items/${item._id}/claim`
          : item.status === "for_sale"
            ? `/api/play/items/${item._id}/purchase`
            : null;
      if (acquisitionUrl) {
        const acquisitionResponse = await fetch(acquisitionUrl, {
          method: "POST",
        });
        const acquisitionBody = (await acquisitionResponse.json()) as {
          error?: string;
        };
        if (!acquisitionResponse.ok) {
          setError(
            acquisitionBody.error ??
              "The artwork could not be added to your collection.",
          );
          return;
        }
      }

      const response = await fetch(
        `/api/play/items/${item._id}/send-to-historian`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questId }),
        },
      );
      const body = (await response.json()) as {
        autoClaimQuestId?: string | null;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "The artwork could not be sent.");
        router.refresh();
        return;
      }

      let message = body.message;
      if (body.autoClaimQuestId) {
        const claimResponse = await fetch(
          `/api/play/quests/${body.autoClaimQuestId}/claim`,
          { method: "POST" },
        );
        const claimBody = (await claimResponse.json()) as {
          error?: string;
          message?: string;
        };
        if (!claimResponse.ok) {
          setError(
            claimBody.error ??
              "The final item was submitted, but the reward could not be claimed automatically.",
          );
          router.refresh();
          return;
        }
        message = claimBody.message;
      }
      setHistorianSubmissionItem(null);
      setNotice(message ?? "Artwork sent to the Art Historian.");
      router.refresh();
    });
  }

  function saveViewSettings(settings: Partial<PlayerViewSettings>) {
    void fetch("/api/play/view-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    }).then(async (response) => {
      if (response.ok) return;
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(body.error ?? "Your view settings could not be saved.");
    });
  }

  function purchaseAndDonateAllLoot() {
    const itemsToDonate = [...purchaseDonateAllSelection.items];
    setError("");
    setNotice("");
    startTransition(async () => {
      let completed = 0;
      let totalKarma = 0;
      const specialOutcomes: ActionDialogResult[] = [];
      try {
        for (const item of itemsToDonate) {
          const purchaseResponse = await fetch(
            `/api/play/items/${item._id}/purchase`,
            { method: "POST" },
          );
          const purchaseBody = (await purchaseResponse
            .json()
            .catch(() => ({}))) as { error?: string };
          if (!purchaseResponse.ok) {
            throw new Error(
              purchaseBody.error ?? "An offer could not be purchased.",
            );
          }

          const donationResponse = await fetch(
            `/api/play/items/${item._id}/donate`,
            { method: "POST" },
          );
          const donationBody = (await donationResponse
            .json()
            .catch(() => ({}))) as {
            actionDialog?: ActionDialogResult;
            error?: string;
            karma?: number;
          };
          if (!donationResponse.ok) {
            throw new Error(
              donationBody.error ?? "A purchased item could not be donated.",
            );
          }
          totalKarma += donationBody.karma ?? 0;
          if (donationBody.actionDialog) {
            specialOutcomes.push(donationBody.actionDialog);
          }
          completed += 1;
        }
        if (specialOutcomes.length > 0) {
          setActionDialog({
            variant:
              specialOutcomes.length === 1
                ? specialOutcomes[0].variant
                : "mixed",
            title:
              specialOutcomes.length === 1
                ? specialOutcomes[0].title
                : "Donation outcomes",
            message: specialOutcomes.map((outcome) => outcome.message).join(" "),
          });
        }
        setNotice(
          `Purchased and donated ${completed} ${
            completed === 1 ? "artwork" : "artworks"
          } for ${totalKarma.toLocaleString()} Karma.`,
        );
        setSelectedLootEntryKeys([]);
        router.refresh();
      } catch (donationError) {
        const message =
          donationError instanceof Error
            ? donationError.message
            : "The purchase-and-donate action could not be completed.";
        setError(
          completed > 0
            ? `${completed} of ${itemsToDonate.length} offers were purchased and donated before the action stopped. ${message}`
            : message,
        );
        setSelectedLootEntryKeys([]);
        router.refresh();
      }
    });
  }

  function sellAllLoot() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch("/api/play/items/sell-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bulkSaleProtections),
      });
      const responseText = await response.text();
      let body: {
        actionDialog?: ActionDialogResult;
        amount?: number;
        error?: string;
        message?: string;
      };
      try {
        body = responseText
          ? (JSON.parse(responseText) as typeof body)
          : {};
      } catch {
        body = {};
      }
      if (!response.ok || body.amount === undefined) {
        const message =
          body.error ??
          (response.status >= 500
            ? "The bulk sale could not be completed. Please try again."
            : "The loot could not be sold.");
        setError(message);
        return;
      }

      if (body.amount > 0) {
        const animationId = Date.now();
        setSellAllEarnings({ amount: body.amount, animationId });
        window.setTimeout(
          () =>
            setSellAllEarnings((current) =>
              current?.animationId === animationId ? null : current,
            ),
          1100,
        );
      }
      if (body.message) {
        setNotice(body.message);
      }
      if (body.actionDialog) {
        setActionDialog(body.actionDialog);
      }
      router.refresh();
    });
  }

  function donateAllLoot() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch("/api/play/items/donate-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bulkSaleProtections),
      });
      const responseText = await response.text();
      let body: {
        actionDialog?: ActionDialogResult;
        karma?: number;
        error?: string;
        message?: string;
      };
      try {
        body = responseText
          ? (JSON.parse(responseText) as typeof body)
          : {};
      } catch {
        body = {};
      }
      if (!response.ok || body.karma === undefined) {
        const message =
          body.error ??
          (response.status >= 500
            ? "The bulk donation could not be completed. Please try again."
            : "The loot could not be donated.");
        setError(message);
        return;
      }

      if (body.karma > 0) {
        const animationId = Date.now();
        setDonateAllEarnings({ karma: body.karma, animationId });
        window.setTimeout(
          () =>
            setDonateAllEarnings((current) =>
              current?.animationId === animationId ? null : current,
            ),
          1100,
        );
      }
      if (body.message) {
        setNotice(body.message);
      }
      if (body.actionDialog) {
        setActionDialog(body.actionDialog);
      }
      router.refresh();
    });
  }

  function declineAllLoot() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch("/api/play/items/decline-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bulkSaleProtections),
      });
      const body = (await response.json()) as {
        declined?: number;
        error?: string;
        message?: string;
      };
      if (!response.ok || body.declined === undefined) {
        setError(body.error ?? "The offers could not be declined.");
        return;
      }
      setNotice(body.message ?? "Offers declined.");
      setSelectedLootEntryKeys([]);
      router.refresh();
    });
  }

  function dismissAllLoot() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch("/api/play/auctions/dismiss-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bulkSaleProtections),
      });
      const body = (await response.json()) as {
        dismissed?: number;
        dismissedPrivateAuctionIds?: string[];
        error?: string;
        message?: string;
      };
      if (!response.ok || body.dismissed === undefined) {
        setError(body.error ?? "The private auctions could not be dismissed.");
        return;
      }
      setNotice(body.message ?? "Private auctions dismissed.");
      setSelectedLootEntryKeys([]);
      const dismissedAuctionIds = new Set(
        body.dismissedPrivateAuctionIds ?? [],
      );
      setCreatedPrivateAuctions((current) =>
        current.filter((auction) => !dismissedAuctionIds.has(auction._id)),
      );
      setDismissedPrivateAuctionIds((current) => [
        ...new Set([...current, ...dismissedAuctionIds]),
      ]);
      router.refresh();
    });
  }

  function handlePrivateAuctionMadePublic(
    auctionId: string,
    message = "Private auction converted to a public auction.",
  ) {
    setNotice(message);
    setSelectedLootEntryKeys([]);
    setSelectedPrivateAuction(null);
    setMadePublicPrivateAuctionIds((current) => [
      ...new Set([...current, auctionId]),
    ]);
    setCreatedPrivateAuctions((current) =>
      current.filter((auction) => auction._id !== auctionId),
    );
    router.refresh();
  }

  function makePrivateAuctionPublic(auction: AuctionView) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch(
        `/api/play/auctions/${auction._id}/make-public`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        error?: string;
        madePublicAuctionId?: string;
        message?: string;
      };
      if (!response.ok || !body.madePublicAuctionId) {
        setError(body.error ?? "The private auction could not be made public.");
        return;
      }
      handlePrivateAuctionMadePublic(
        body.madePublicAuctionId,
        body.message ?? "Private auction converted to a public auction.",
      );
    });
  }

  function makeAllPrivateAuctionsPublic() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch(
        "/api/play/auctions/make-all-public",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bulkSaleProtections),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        madePublic?: number;
        madePublicAuctionIds?: string[];
        message?: string;
      };
      if (!response.ok || body.madePublic === undefined) {
        setError(
          body.error ?? "The private auctions could not be made public.",
        );
        return;
      }
      const auctionIds = body.madePublicAuctionIds ?? [];
      setNotice(body.message ?? "Private auctions made public.");
      setSelectedLootEntryKeys([]);
      setMadePublicPrivateAuctionIds((current) => [
        ...new Set([...current, ...auctionIds]),
      ]);
      const convertedIds = new Set(auctionIds);
      setCreatedPrivateAuctions((current) =>
        current.filter((auction) => !convertedIds.has(auction._id)),
      );
      router.refresh();
    });
  }

  function donateItem(item: HydratedGameItem) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch(`/api/play/items/${item._id}/donate`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        actionDialog?: ActionDialogResult;
        donated?: boolean;
        error?: string;
        message?: string;
        recoveredStyle?: string;
      };
      if (!response.ok) {
        const message = body.error ?? "The donation could not be completed.";
        setError(message);
        return;
      }

      if (body.donated) {
        const animationId = Date.now();
        setDonationEffects((current) => ({
          ...current,
          [item._id]: {
            animationId,
            recoveredStyle: Boolean(body.recoveredStyle),
          },
        }));
        window.setTimeout(() => {
          setDonationEffects((current) => {
            if (current[item._id]?.animationId !== animationId) {
              return current;
            }
            const next = { ...current };
            delete next[item._id];
            return next;
          });
        }, 1050);
      }
      if (body.message) {
        setNotice(body.message);
      }
      if (body.actionDialog) {
        setActionDialog(body.actionDialog);
      }
      if (body.donated) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
      router.refresh();
    });
  }

  function requestItemRemoval(
    item: HydratedGameItem,
    action: "sell" | "donate",
  ) {
    if (
      item.artwork.rarity === "legendary" ||
      item.artwork.rarity === "masterpiece"
    ) {
      setValuableItemConfirmation({ action, item });
      return;
    }
    if (action === "sell") {
      act(`/api/play/items/${item._id}/sell`);
    } else {
      donateItem(item);
    }
  }

  async function openCrate(
    crate: LootCrateOffer,
    endpoint: string,
    count = 1,
  ) {
    setError("");
    setNotice("");
    setRevealedLootIds([]);
    setCrateOpening({ crateId: crate.id, phase: "opening" });
    const animationStarted = Date.now();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        ...(crate.quality !== "daily"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ count }),
            }
          : {}),
      });
      const body = (await response.json()) as {
        error?: string;
        itemCount?: number;
        item_ids?: string[];
        message?: string;
      };
      const remainingAnimation = Math.max(
        0,
        1500 - (Date.now() - animationStarted),
      );
      if (remainingAnimation > 0) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, remainingAnimation),
        );
      }
      if (!response.ok || body.itemCount === undefined) {
        throw new Error(body.error ?? "The crate could not be opened.");
      }
      const message =
        body.message ?? `${body.itemCount} artworks were added to your loot.`;
      setCrateOpening({ crateId: crate.id, phase: "opened" });
      setNotice(message);
      setRevealedLootIds(body.item_ids ?? []);
      setLootCategory("unclaimed");
      setSelectedLootEntryKeys(
        body.item_ids?.[0] ? [body.item_ids[0]] : [],
      );
      router.refresh();
      window.setTimeout(
        () =>
          setCrateOpening((current) =>
            current?.crateId === crate.id ? null : current,
          ),
        900,
      );
    } catch (crateError) {
      const message =
        crateError instanceof Error
          ? crateError.message
          : "The crate could not be opened.";
      setCrateOpening({ crateId: crate.id, phase: "error" });
      setError(message);
      window.setTimeout(
        () =>
          setCrateOpening((current) =>
            current?.crateId === crate.id ? null : current,
          ),
        900,
      );
    }
  }

  function requestMintMutation(
    item: HydratedGameItem,
    actionLabel: string,
    onConfirm: () => void,
  ) {
    const preservationEffect =
      actionLabel === "Displaying this artwork" &&
      legendaryAttributes.some(
        (attribute) =>
          attribute.active &&
          attribute.id === item.artwork.effect_id &&
          attribute.code === "MP_PRESERVATION_MINT",
      );
    if (!item.mint || preservationEffect) {
      onConfirm();
      return;
    }
    setMintConfirmation({ actionLabel, onConfirm });
  }

  function archiveAction(
    item: HydratedGameItem,
    gridSlot?: ActionGridSlot,
  ) {
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
        destructive
        icon="fa-archive"
        label={
          purchaseAmount > 0
            ? `Purchase and archive for $${purchaseAmount.toLocaleString()}`
            : "Archive permanently"
        }
        disabled={pending || Boolean(disabledReason)}
        disabledReason={disabledReason}
        gridSlot={gridSlot}
        onClick={() => setArchiveConfirmationItem(item)}
      />
    );
  }

  async function meetNpc(npc: NpcView | GalleryNpcView): Promise<boolean> {
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
        interaction?:
          | {
              type: "art-donor-offer" | "art-dealer-offer";
              npcId: string;
              npcName: string;
              quality: NpcQuality;
              items: ArtworkOfferItem[];
            }
          | {
              type: "auctioneer-access";
              npcName: string;
              quality: NpcQuality;
              auctionCount: number;
              auctions?: AuctionView[];
              expiration: string;
            }
          | CollectorResult
          | ArtExpertResult
          | ArtExpertRerollResult
          | ArtHistorianResult
          | PreservationistResult
          | NpcRewardInteraction;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The visitor interaction failed.");
      }
      setSocialBattery((current) =>
        Math.max(
          0,
          current -
            getVisitorSocialBatteryCost(
              npc.quality,
              npc.owner_id === playerId,
            ),
        ),
      );
      let showedAnimatedResult = false;
      if (
        body.interaction?.type === "art-donor-offer" ||
        body.interaction?.type === "art-dealer-offer"
      ) {
        showedAnimatedResult = true;
        showNpcEffect(body.interaction.npcId, body.interaction.npcName, [
          body.interaction.type === "art-donor-offer"
            ? { icon: "fa-plus", text: `+${body.interaction.items.length}`, tone: "positive" }
            : { icon: "fa-shopping-cart", text: `${body.interaction.items.length} offered`, tone: "money" },
          ...(body.interaction.type === "art-donor-offer"
            ? [{ icon: "fa-picture-o", tone: "positive" } as const]
            : []),
        ]);
      } else if (
        body.interaction?.type === "auctioneer-access"
      ) {
        showedAnimatedResult = true;
        const createdAuctions = body.interaction.auctions ?? [];
        if (createdAuctions.length > 0) {
          setCreatedPrivateAuctions((current) => {
            const byId = new Map(
              [...current, ...createdAuctions].map((auction) => [
                auction._id,
                auction,
              ]),
            );
            return [...byId.values()];
          });
        }
        showNpcEffect(npc._id, body.interaction.npcName, [
          {
            icon: "fa-gavel",
            text: `+${body.interaction.auctionCount}`,
            tone: "money",
          },
        ]);
      } else if (body.interaction?.type === "art-collector-result") {
        showedAnimatedResult = true;
        const tokens: NpcEffectToken[] = [];
        if (body.interaction.rewardType === "money") {
          tokens.push({
            icon: "fa-usd",
            text: `+$${body.interaction.rewardAmount.toLocaleString()}`,
            tone: "money",
          });
        } else if (body.interaction.rewardType === "xp") {
          tokens.push({
            icon: "fa-heart",
            text: `+${body.interaction.rewardAmount.toLocaleString()} XP`,
            tone: "xp",
          });
        }
        if ((body.interaction.bonusMoney ?? 0) > 0) {
          tokens.push({
            icon: "fa-usd",
            text: `+$${body.interaction.bonusMoney?.toLocaleString()}`,
            tone: "money",
          });
        }
        if (!body.interaction.keptItem) {
          tokens.push(
            { icon: "fa-minus", tone: "negative" },
            { icon: "fa-picture-o", tone: "negative" },
          );
        } else if (body.interaction.forgeryCaught) {
          tokens.push({ icon: "fa-exclamation-triangle", tone: "negative" });
        }
        if (body.interaction.bonusOffers > 0) {
          tokens.push({
            icon: "fa-shopping-cart",
            text: `${body.interaction.bonusOffers} offered`,
            tone: "money",
          });
        }
        showNpcEffect(
          body.interaction.npcId,
          body.interaction.npcName,
          tokens,
        );
      } else if (body.interaction?.type === "art-expert-karma") {
        showedAnimatedResult = true;
        const karma = body.interaction.karma;
        setKarmaBalance((current) => current + karma);
        showNpcEffect(body.interaction.npcId, body.interaction.npcName, [
          {
            icon: "fa-spa",
            text: `+${body.interaction.karma.toLocaleString()} Karma`,
            tone: "karma",
          },
          ...(body.interaction.xpBonus > 0
            ? [
                {
                  icon: "fa-heart",
                  text: `+${body.interaction.xpBonus.toLocaleString()} XP`,
                  tone: "xp",
                } as const,
              ]
            : []),
          ...(body.interaction.bonusMoney > 0
            ? [
                {
                  icon: "fa-usd",
                  text: `+$${body.interaction.bonusMoney.toLocaleString()}`,
                  tone: "money",
                } as const,
              ]
            : []),
        ]);
      } else if (body.interaction?.type === "art-expert-reroll") {
        showedAnimatedResult = true;
        showNpcEffect(body.interaction.npcId, body.interaction.npcName, [
          {
            icon: "fa-magic",
            text: `-${body.interaction.previousRollCount - body.interaction.rollCount} reroll`,
            tone: "positive",
          },
          ...(body.interaction.xpBonus > 0
            ? [
                {
                  icon: "fa-heart",
                  text: `+${body.interaction.xpBonus.toLocaleString()} XP`,
                  tone: "xp",
                } as const,
              ]
            : []),
          ...(body.interaction.bonusMoney > 0
            ? [
                {
                  icon: "fa-usd",
                  text: `+$${body.interaction.bonusMoney.toLocaleString()}`,
                  tone: "money",
                } as const,
              ]
            : []),
        ]);
      } else if (body.interaction?.type === "art-historian-quest") {
        showedAnimatedResult = true;
        showNpcEffect(body.interaction.npcId, body.interaction.npcName, [
          { icon: "fa-check-square-o", text: "Quest added", tone: "positive" },
        ]);
      } else if (body.interaction?.type === "preservationist-result") {
        showedAnimatedResult = true;
        showNpcEffect(body.interaction.npcId, body.interaction.npcName, [
          {
            icon: "fa-wrench",
            text: `+${Math.floor(body.interaction.repairedAmount * 100)}%`,
            tone: "repair",
          },
        ]);
      } else if (
        body.interaction?.type === "npc-reward" &&
        body.interaction.presentation === "popout"
      ) {
        showedAnimatedResult = true;
        showNpcEffect(body.interaction.npcId, body.interaction.npcName, [
          {
            icon:
              body.interaction.rewardType === "money"
                ? "fa-usd"
                : "fa-heart",
            text:
              body.interaction.rewardType === "money"
                ? `+$${body.interaction.rewardAmount.toLocaleString()}`
                : `+${body.interaction.rewardAmount.toLocaleString()} XP`,
            tone: body.interaction.rewardType,
          },
        ]);
      }
      if (body.message && !showedAnimatedResult) {
        setNotice(body.message);
      }

      router.refresh();
      return true;
    } catch (meetError) {
      const message =
        meetError instanceof Error
          ? meetError.message
          : "The visitor interaction failed.";
      setError(message);
      return false;
    } finally {
      setMeetingNpc(null);
    }

    function showNpcEffect(
      npcId: string,
      npcName: string,
      tokens: NpcEffectToken[],
    ) {
      if (tokens.length === 0) return;
      const npcElement = Array.from(
        document.querySelectorAll<HTMLElement>("[data-npc-id]"),
      ).find((element) => element.dataset.npcId === npcId);
      const bounds = npcElement?.getBoundingClientRect();
      npcEffectSequence.current += 1;
      const animationId = npcEffectSequence.current;
      const effectLabel =
        tokens
          .map((token) => token.text)
          .filter((text): text is string => Boolean(text))
          .join(", ") || `${npcName} interaction result`;
      setNpcRewardEffects((current) => ({
        ...current,
        [npcId]: {
          animationId,
          label: effectLabel,
          npcId,
          originX: Math.min(
            window.innerWidth - 90,
            Math.max(
              90,
              bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
            ),
          ),
          originY: Math.max(
            90,
            bounds ? bounds.top + bounds.height / 3 : window.innerHeight / 2,
          ),
          tokens,
        },
      }));
      window.setTimeout(() => {
        setNpcRewardEffects((current) => {
          if (current[npcId]?.animationId !== animationId) return current;
          const next = { ...current };
          delete next[npcId];
          return next;
        });
      }, 1_350 + Math.max(0, tokens.length - 1) * 110 + 250);
    }
  }

  function displayedItemActions(item: HydratedGameItem) {
    const historianQuests = historianQuestsForItem(item);
    const historianDisabledReason = historianSubmissionDisabledReason(
      item,
      historianQuests.length,
    );
    return (
      <>
        <ItemActionButton
          gridSlot={1}
          icon="fa-picture-o"
          label="Remove from gallery"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/undisplay`)}
          variant="gallery"
        />
        {canRerollDisplayed ? (
          <ItemActionButton
            gridSlot={2}
            icon="fa-magic"
            label="Modify displayed artwork"
            disabled={pending}
            onClick={() =>
              setRerollSession({
                item,
                bankBalance: player.bankBalance,
                karma: karmaBalance,
              })
            }
          />
        ) : null}
        <ItemActionButton
          destructive
          gridSlot={10}
          icon="fa-museum"
          label="Send to Historian"
          disabled={pending || Boolean(historianDisabledReason)}
          disabledReason={historianDisabledReason}
          onClick={() => requestHistorianSubmission(item)}
        />
        {tagItemAction(item)}
      </>
    );
  }

  function collectionGalleryAction(item: HydratedGameItem) {
    if (item.status === "displayed") {
      return (
        <button
          className="collection-gallery-action collection-gallery-action-active"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/undisplay`)}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-picture-o" />
          Take down
        </button>
      );
    }

    const displayPermission = getDisplayPermission(item, items, player.displayCap);
    const itemIndex = inventory.findIndex((candidate) => candidate._id === item._id);
    const remainingInventory = inventory.filter(
      (candidate) => candidate._id !== item._id,
    );
    const nextInventoryItem =
      remainingInventory[itemIndex] ?? remainingInventory[0] ?? null;
    return (
      <button
        className="collection-gallery-action"
        disabled={pending || !displayPermission.allowed}
        onClick={() =>
          requestMintMutation(
            item,
            "Displaying this artwork",
            () =>
              act(`/api/play/items/${item._id}/display`, () =>
                setSelectedCollectionItemIds(
                  nextInventoryItem ? [nextInventoryItem._id] : [],
                ),
              ),
          )
        }
        title={
          displayPermission.allowed
            ? "Display in gallery"
            : displayPermission.reason
        }
        type="button"
      >
        <i aria-hidden="true" className="fa fa-picture-o" />
        Display
      </button>
    );
  }

  function tagItemAction(item: HydratedGameItem) {
    return (
      <ItemActionButton
        gridSlot={11}
        icon="fa-tags"
        label={
          item.tags.length > 0
            ? `Modify tags: ${item.tags.join(", ")}`
            : "Add item tags"
        }
        disabled={pending}
        onClick={() => setTagEditorItems([item])}
      />
    );
  }

  function collectionDisplayedItemActions(item: HydratedGameItem) {
    const inventoryOnlyReason =
      "Take this artwork down before using this action.";
    const historianQuests = historianQuestsForItem(item);
    const historianDisabledReason = historianSubmissionDisabledReason(
      item,
      historianQuests.length,
    );
    return (
      <>
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          gridSlot={1}
          icon="fa-wrench"
          label="Repair item"
          onClick={() => undefined}
        />
        <ItemActionButton
          disabled={pending || !canRerollDisplayed}
          disabledReason={
            canRerollDisplayed ? undefined : inventoryOnlyReason
          }
          gridSlot={2}
          icon="fa-magic"
          label="Modify attributes"
          onClick={() =>
            setRerollSession({
              item,
              bankBalance: player.bankBalance,
              karma: karmaBalance,
            })
          }
        />
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          destructive
          gridSlot={3}
          icon="fa-usd"
          label={`Sell for $${item.values.sell.toLocaleString()}`}
          onClick={() => undefined}
        />
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          gridSlot={4}
          icon="fa-binoculars"
          label="Offer to Art Collectors"
          onClick={() => undefined}
        />
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          gridSlot={5}
          icon="fa-gavel"
          label="Put up for auction"
          onClick={() => undefined}
        />
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          destructive
          gridSlot={6}
          icon="fa-archive"
          label="Archive permanently"
          onClick={() => undefined}
        />
        <AuthenticityActions
          act={act}
          gridSlot={7}
          item={item}
          pending={pending}
        />
        {tagItemAction(item)}
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          destructive
          gridSlot={9}
          icon="fa-share-square"
          label="Donate for Karma"
          onClick={() => undefined}
        />
        <ItemActionButton
          destructive
          gridSlot={10}
          icon="fa-museum"
          label="Send to Historian"
          disabled={pending || Boolean(historianDisabledReason)}
          disabledReason={historianDisabledReason}
          onClick={() => requestHistorianSubmission(item)}
        />
      </>
    );
  }

  function lootItemActions(item: HydratedGameItem) {
    const historianQuests = historianQuestsForItem(item);
    const historianDisabledReason = historianSubmissionDisabledReason(
      item,
      historianQuests.length,
    );
    if (item.status === "for_sale") {
      return (
        <>
          <ItemActionButton
            destructive
            gridSlot={3}
            icon="fa-times"
            label="Decline dealer offer"
            disabled={pending}
            onClick={() => act(`/api/play/items/${item._id}/decline`)}
          />
          {archiveAction(item, 6)}
          <ItemActionButton
            gridSlot={4}
            icon="fa-binoculars"
            label="Purchase and set for sale"
            disabled={pending}
            onClick={() =>
              act(
                `/api/play/items/${item._id}/purchase-and-set-for-sale`,
              )
            }
          />
          <ItemActionButton
            destructive
            gridSlot={10}
            icon="fa-museum"
            label="Purchase and send to Historian"
            disabled={pending || Boolean(historianDisabledReason)}
            disabledReason={historianDisabledReason}
            onClick={() => requestHistorianSubmission(item)}
          />
        </>
      );
    }

    return (
      <>
        <ItemActionButton
          destructive
          gridSlot={3}
          icon="fa-usd"
          label={`Sell immediately for $${item.values.sell.toLocaleString()}`}
          disabled={pending}
          onClick={() => requestItemRemoval(item, "sell")}
        />
        <ItemActionButton
          destructive
          gridSlot={9}
          icon="fa-share-square"
          label="Donate for Karma"
          disabled={pending || item.permanent}
          onClick={() => requestItemRemoval(item, "donate")}
        />
        <ItemActionButton
          destructive
          gridSlot={6}
          icon="fa-times"
          label="Decline and remove from game"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/decline`)}
        />
        <ItemActionButton
          gridSlot={4}
          icon="fa-binoculars"
          label="Collect and set for sale"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/claim-and-set-for-sale`)}
        />
        {archiveAction(item, 12)}
        <ItemActionButton
          destructive
          gridSlot={10}
          icon="fa-museum"
          label="Claim and send to Historian"
          disabled={pending || Boolean(historianDisabledReason)}
          disabledReason={historianDisabledReason}
          onClick={() => requestHistorianSubmission(item)}
        />
      </>
    );
  }

  function lootPrimaryAction(item: HydratedGameItem) {
    if (item.status === "for_sale") {
      const purchaseAmount =
        (item as { price?: number }).price ??
        Math.floor(item.values.dealer * dealerPriceMultiplier);
      return (
        <button
          className="collection-gallery-action"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/purchase`)}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-shopping-cart" />
          Purchase for ${purchaseAmount.toLocaleString()}
        </button>
      );
    }

    const inventoryFullForItem =
      inventoryFull && !item.original && !item.vintage;
    return (
      <button
        className="collection-gallery-action"
        disabled={pending || inventoryFullForItem}
        onClick={() => act(`/api/play/items/${item._id}/claim`)}
        title={
          inventoryFullForItem
            ? "Your inventory is currently full."
            : "Add to collection"
        }
        type="button"
      >
        <i aria-hidden="true" className="fa fa-plus" />
        Add to collection
      </button>
    );
  }

  function collectionItemActions(item: HydratedGameItem) {
    const repairLimitReached =
      !item.repairing && repairingCount >= player.repairingCap;
    const repairDisabledReason = item.repairing
      ? undefined
      : item.condition >= 1
        ? "This item is already at 100% condition."
        : repairLimitReached
          ? `Your ${player.repairingCap}-item repair limit has been reached.`
          : undefined;
    const historianQuests = historianQuestsForItem(item);
    const historianDisabledReason = historianSubmissionDisabledReason(
      item,
      historianQuests.length,
    );

    return (
      <>
        <ItemActionButton
          gridSlot={1}
          icon="fa-wrench"
          label={
            item.repairing
              ? `Stop repairing at ${Math.floor(item.condition * 100)}% condition`
              : "Repair item"
          }
          disabled={pending || Boolean(repairDisabledReason)}
          disabledReason={repairDisabledReason}
          onClick={() => act(`/api/play/items/${item._id}/repair`)}
          variant={item.repairing ? "enabled" : "default"}
        />
        <ItemActionButton
          gridSlot={2}
          icon="fa-magic"
          label="Modify attributes"
          disabled={pending}
          onClick={() =>
            setRerollSession({
              item,
              bankBalance: player.bankBalance,
              karma: karmaBalance,
            })
          }
        />
        <ItemActionButton
          gridSlot={4}
          icon="fa-binoculars"
          label={
            item.tags.includes("for sale")
              ? "Stop offering to Art Collectors"
              : "Offer to Art Collectors"
          }
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/collector-sale`)}
          variant={item.tags.includes("for sale") ? "collector" : "default"}
        />
        <ItemActionButton
          gridSlot={5}
          icon="fa-gavel"
          label="Put up for auction"
          disabled={pending || item.permanent || item.repairing}
          onClick={() => setAuctionListingItem(item)}
        />
        <ItemActionButton
          destructive
          gridSlot={3}
          icon="fa-usd"
          label={`Sell for $${item.values.sell.toLocaleString()}`}
          disabled={pending}
          onClick={() => requestItemRemoval(item, "sell")}
        />
        {archiveAction(item, 6)}
        <ItemActionButton
          destructive
          gridSlot={9}
          icon="fa-share-square"
          label="Donate for Karma"
          disabled={pending || item.permanent}
          onClick={() => requestItemRemoval(item, "donate")}
        />
        <AuthenticityActions
          act={act}
          gridSlot={7}
          item={item}
          pending={pending}
        />
        {tagItemAction(item)}
        <ItemActionButton
          destructive
          gridSlot={10}
          icon="fa-museum"
          label="Send to Historian"
          disabled={pending || Boolean(historianDisabledReason)}
          disabledReason={historianDisabledReason}
          onClick={() => requestHistorianSubmission(item)}
        />
      </>
    );
  }

  function renderLootThumbnail({ auction, item, key }: LootEntry) {
    const revealIndex = auction
      ? -1
      : revealedLootIds.indexOf(item._id);
    return (
      <button
        aria-label={`Preview ${item.artwork.title} by ${item.artwork.artist}`}
        aria-pressed={selectedLootEntryKeysSet.has(key)}
        className={`${selectedLootEntryKeysSet.has(key) ? "selected" : ""} ${
          revealIndex >= 0 ? "loot-item-reveal" : ""
        }`.trim()}
        data-rarity={item.artwork.rarity}
        key={key}
        onClick={(event) => toggleLootEntrySelection(key, event)}
        onContextMenu={(event) => {
          if (suppressedLootClickRef.current === key) {
            event.preventDefault();
          }
        }}
        onPointerCancel={cancelLootEntryLongPress}
        onPointerDown={(event) => startLootEntryLongPress(key, event)}
        onPointerLeave={cancelLootEntryLongPress}
        onPointerMove={moveLootEntryLongPress}
        onPointerUp={cancelLootEntryLongPress}
        style={
          revealIndex >= 0
            ? { animationDelay: `${revealIndex * 110}ms` }
            : undefined
        }
        title={`${item.artwork.title} by ${item.artwork.artist}`}
        type="button"
      >
        <ItemThumbnail
          alt=""
          item={item}
          researchTarget={unfoundQuestTargetArtworkIds.has(item.artwork_id)}
          size={82}
        />
      </button>
    );
  }

  return (
    <main className="legacy-game">
      <div className="max-w-[1800px] m-auto">
        <section
          aria-label="Player progress"
          className="dashboard-resource-bars"
        >
          <div className="dashboard-resource-bar">
            <div>
              <span>
                Level {player.level.toLocaleString()}
                {player.isMaxLevel ? " · Next lottery ticket" : ""}
              </span>
              <strong>
                {player.xp.toLocaleString()} /{" "}
                {player.xpGoal.toLocaleString()} XP
              </strong>
            </div>
            <ProgressBar
              value={player.xp}
              goal={player.xpGoal}
              maxed={player.isMaxLevel}
            />
          </div>
          <div className="dashboard-resource-bar social-battery-resource">
            <div>
              <span>Social battery</span>
              <strong>
                {socialBattery.toLocaleString()} /{" "}
                {SOCIAL_BATTERY_MAX.toLocaleString()}
              </strong>
            </div>
            <div
              aria-label={`${socialBattery.toLocaleString()} of ${SOCIAL_BATTERY_MAX.toLocaleString()} social battery remaining`}
              aria-valuemax={SOCIAL_BATTERY_MAX}
              aria-valuemin={0}
              aria-valuenow={socialBattery}
              className="social-battery-meter"
              role="progressbar"
            >
              <span
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (socialBattery / SOCIAL_BATTERY_MAX) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        </section>
        <nav className="dashboard-tabs" aria-label="Player dashboard">
          {(
            [
              { id: "collection", label: "Home", icon: "fa-home" },
              { id: "explore", label: "Visit Galleries", icon: "fa-picture-o" },
              { id: "loot", label: "Offers", icon: "fa-gift" },
              { id: "quests", label: "Quests", icon: "fa-map-signs" },
              { id: "auctions", label: "Auction House", icon: "fa-gavel" },
              { id: "archive", label: "Archive", icon: "fa-archive" },
              { id: "daily", label: "Daily Events", icon: "fa-calendar" },
              { id: "profile", label: "Social", icon: "fa-comments" },
              { id: "history", label: "Legacy", icon: "fa-history" },
            ] as const
          ).map((tab) => (
            <button
              className={section === tab.id ? "current" : ""}
              key={tab.id}
              onClick={() => {
                if (tab.id === "explore") {
                  setExploreGalleryId(null);
                  setExploreResetKey((current) => current + 1);
                }
                const sectionName =
                  tab.id === "collection"
                    ? "home"
                    : tab.id === "profile"
                      ? "social"
                      : tab.id;
                router.replace(`/play?section=${sectionName}`, {
                  scroll: false,
                });
                setSection(tab.id);
              }}
              type="button"
            >
              <i aria-hidden="true" className={`fa ${tab.icon}`} />
              <span>{tab.label}</span>
              {tab.id === "loot" && unclaimed.length > 0
                ? ` (${unclaimed.length})`
                : ""}
              {tab.id === "archive" && archives.length > 0
                ? ` (${archives.length})`
                : ""}
              {tab.id === "quests" && quests.length > 0
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
          <section className="social-page-layout">
            <GalleryChat global viewerId={playerId} />
            <GalleryChat galleryOwnerId={playerId} viewerId={playerId} />
          </section>
        ) : null}

        {section === "history" ? (
          <section className="player-history-layout">
            <HallOfFamePanel records={hallOfFameRecords} />
            <PlayHistoryPanel snapshots={playthroughSnapshots} />
          </section>
        ) : null}

        {section === "loot" ? (
          <section className="random-drop">
            <div className="loot-dashboard">
              <section className="crate-store-panel">
                <label className="crate-purchase-count">
                  <span>Crates to buy</span>
                  <input
                    disabled={pending || crateOpening !== null}
                    max={20}
                    min={1}
                    onChange={(event) => {
                      const count = event.currentTarget.valueAsNumber;
                      setCratePurchaseCount(
                        Number.isFinite(count)
                          ? Math.min(20, Math.max(1, Math.floor(count)))
                          : 1,
                      );
                    }}
                    type="number"
                    value={cratePurchaseCount}
                  />
                </label>
                <div className="crate-store-grid">
                  <button
                    className="crate-store-card daily"
                    data-phase={
                      crateOpening?.crateId === "daily"
                        ? crateOpening.phase
                        : undefined
                    }
                    data-quality="daily"
                    disabled={!dropReady || pending || crateOpening !== null}
                    onClick={() =>
                      void openCrate(
                        {
                          id: "daily",
                          name: "Daily crate",
                          quality: "daily",
                          description:
                            "A complimentary collection assembled once per cooldown.",
                          highlights: [
                            `${dailyDropCount} artworks`,
                            "Free",
                            "Refreshes automatically",
                          ],
                          itemCount: dailyDropCount,
                          cost: 0,
                          levelRequirement: 0,
                        },
                        "/api/play/drop",
                      )
                    }
                    type="button"
                  >
                    <CrateCardArtwork quality="daily" />
                    <span className="crate-card-copy">
                      <strong>Daily crate</strong>
                    </span>
                    <strong className="crate-card-cost">
                      {dropReady ? "Free" : countdown(nextDrop - now)}
                    </strong>
                  </button>
                  {crateOffers.map((crate) => {
                    const levelLocked = player.level < crate.levelRequirement;
                    const totalCost = crate.cost * cratePurchaseCount;
                    const cannotAfford = player.bankBalance < totalCost;
                    return (
                      <button
                        className="crate-store-card"
                        data-phase={
                          crateOpening?.crateId === crate.id
                            ? crateOpening.phase
                            : undefined
                        }
                        data-quality={crate.quality}
                        disabled={
                          pending ||
                          crateOpening !== null ||
                          levelLocked ||
                          cannotAfford
                        }
                        key={crate.id}
                        onClick={() =>
                          void openCrate(
                            crate,
                            `/api/play/crates/${crate.id}`,
                            cratePurchaseCount,
                          )
                        }
                        title={
                          levelLocked
                            ? `Requires level ${crate.levelRequirement}`
                            : cannotAfford
                              ? "Not enough money"
                              : `Open ${crate.name}`
                        }
                        type="button"
                      >
                        <CrateCardArtwork quality={crate.quality} />
                        <span className="crate-card-copy">
                          <strong>
                            {crate.name} × {cratePurchaseCount}
                          </strong>
                        </span>
                          <strong className="crate-card-cost">
                            ${totalCost.toLocaleString()}
                          </strong>
                          <small>
                            {crateOpening?.crateId === crate.id
                              ? crateOpening.phase === "opening"
                                ? "Opening..."
                                : crateOpening.phase === "opened"
                                  ? "Opened!"
                                  : "Failed"
                              : levelLocked
                                ? `Level ${crate.levelRequirement}`
                                : `${(
                                    crate.itemCount * cratePurchaseCount
                                  ).toLocaleString()} artworks`}
                          </small>
                      </button>
                    );
                  })}
                </div>
                {debugEnabled ? (
                  <button
                    className="debug-raw-drop loot-debug-drop"
                    disabled={pending}
                    onClick={() => act("/api/play/drop/debug-raw")}
                    type="button"
                  >
                    generate raw-map debug drop
                  </button>
                ) : null}
              </section>
              {lootEntries.length > 0 ? (
                <section className="loot-items-panel">
                <div className="loot-items-content">
                  <div className="loot-section-list">
                    <div
                      aria-label="Offer categories"
                      className="loot-category-tabs"
                      role="tablist"
                    >
                      {availableLootCategories.map((category) => (
                        <button
                          aria-controls="active-loot-category"
                          aria-selected={
                            activeLootCategory?.id === category.id
                          }
                          className={
                            activeLootCategory?.id === category.id
                              ? "current"
                              : ""
                          }
                          key={category.id}
                          onClick={() => selectLootCategory(category)}
                          role="tab"
                          type="button"
                        >
                          <span>{category.label}</span>
                          <small>{category.entries.length.toLocaleString()}</small>
                        </button>
                      ))}
                    </div>
                    <section
                      aria-label={activeLootCategory?.label}
                      className="loot-section loot-tab-panel"
                      id="active-loot-category"
                      role="tabpanel"
                    >
                      <div className="collection-thumbnail-list loot-thumbnail-grid">
                        {activeLootEntries.map(renderLootThumbnail)}
                      </div>
                      <div className="loot-section-controls">
                        <div className="loot-section-actions">
                        {activeLootCategory?.id === "unclaimed" ? (
                          <>
                            <button
                              className="donate-all-loot"
                              disabled={
                                pending || bulkSellableLoot.length === 0
                              }
                              onClick={donateAllLoot}
                              type="button"
                            >
                              <i
                                aria-hidden="true"
                                className="fa fa-share-square"
                              />{" "}
                              Donate all
                              {donateAllEarnings ? (
                                <span
                                  className="donate-all-earnings"
                                  key={donateAllEarnings.animationId}
                                >
                                  +{donateAllEarnings.karma.toLocaleString()}{" "}
                                  Karma
                                </span>
                              ) : null}
                            </button>
                            <button
                              className="sell-all-loot"
                              disabled={
                                pending || bulkSellableLoot.length === 0
                              }
                              onClick={sellAllLoot}
                              type="button"
                            >
                              <i aria-hidden="true" className="fa fa-usd" />{" "}
                              Sell all
                              {sellAllEarnings ? (
                                <span
                                  className="sell-all-earnings"
                                  key={sellAllEarnings.animationId}
                                >
                                  +${sellAllEarnings.amount.toLocaleString()}
                                </span>
                              ) : null}
                            </button>
                          </>
                        ) : null}
                        {activeLootCategory?.id === "for-sale" ? (
                          <>
                            <button
                              className="purchase-donate-all-loot"
                              disabled={
                                pending ||
                                purchaseDonateAllSelection.items.length === 0
                              }
                              onClick={purchaseAndDonateAllLoot}
                              title={
                                purchaseDonateAllSelection.items.length === 0
                                  ? "No dealer offers can currently be purchased and donated"
                                  : undefined
                              }
                              type="button"
                            >
                              <i
                                aria-hidden="true"
                                className="fa fa-share-square"
                              />{" "}
                              Purchase and donate all
                            </button>
                            <button
                              className="decline-all-loot"
                              disabled={
                                pending || bulkDeclinableLoot.length === 0
                              }
                              onClick={declineAllLoot}
                              type="button"
                            >
                              <i aria-hidden="true" className="fa fa-times" />{" "}
                              Decline all
                            </button>
                          </>
                        ) : null}
                        {activeLootCategory?.id === "private-auctions" ? (
                          <>
                            {canMakePrivateAuctionsPublic ? (
                              <button
                                className="make-all-public-loot"
                                disabled={
                                  pending ||
                                  bulkDismissiblePrivateAuctions.length === 0
                                }
                                onClick={makeAllPrivateAuctionsPublic}
                                type="button"
                              >
                                <i
                                  aria-hidden="true"
                                  className="fa fa-globe"
                                />{" "}
                                Make all public
                              </button>
                            ) : null}
                            <button
                              className="dismiss-all-loot"
                              disabled={
                                pending ||
                                bulkDismissiblePrivateAuctions.length === 0
                              }
                              onClick={dismissAllLoot}
                              type="button"
                            >
                              <i aria-hidden="true" className="fa fa-times" />{" "}
                              Dismiss all
                            </button>
                          </>
                        ) : null}
                        </div>
                        <div className="loot-bulk-options">
                          <fieldset>
                            <legend className="sr-only">
                              Items to preserve
                            </legend>
                            {(
                              [
                                ["keepRares", "Keep rares"],
                                ["keepLegendaries", "Keep legendaries"],
                                ["keepMasterpieces", "Keep masterpieces"],
                                ["keepUnarchived", "Keep unarchived"],
                                [
                                  "keepUnfoundQuestTargets",
                                  "Keep unfound quest targets",
                                ],
                                ["keepArtStyles", "Keep art styles"],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key}>
                                <input
                                  checked={bulkSaleProtections[key]}
                                  onChange={(event) => {
                                    const next = {
                                      ...bulkSaleProtections,
                                      [key]: event.target.checked,
                                    };
                                    setBulkSaleProtections(next);
                                    saveViewSettings({
                                      bulkSaleProtections: next,
                                    });
                                  }}
                                  type="checkbox"
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </fieldset>
                        </div>
                      </div>
                    </section>
                  </div>
                  {selectedLootEntries.length > 1 ? (
                    <LootBulkActionsPanel
                      availability={lootBulkState.availability}
                      category={activeLootCategory?.id ?? "unclaimed"}
                      itemCount={selectedLootEntries.length}
                      onAction={requestLootBulkAction}
                      pending={pending}
                      purchaseCost={lootBulkState.totalPurchaseCost}
                      totalValue={lootBulkTotalValue}
                    />
                  ) : selectedLootItem ? (
                    <div
                      aria-live="polite"
                      className="collection-preview loot-preview"
                    >
                      <ItemCard
                        actions={
                          selectedLootAuction
                            ? (
                                <>
                                  {canMakePrivateAuctionsPublic ? (
                                    <ItemActionButton
                                      disabled={pending}
                                      gridSlot={1}
                                      icon="fa-globe"
                                      label="Make public"
                                      onClick={() =>
                                        makePrivateAuctionPublic(
                                          selectedLootAuction,
                                        )
                                      }
                                    />
                                  ) : null}
                                  <ItemActionButton
                                    destructive
                                    disabled={pending}
                                    gridSlot={3}
                                    icon="fa-times"
                                    label="Dismiss private auction"
                                    onClick={() =>
                                      act(
                                        `/api/play/auctions/${selectedLootAuction._id}/dismiss`,
                                        () => {
                                          setDismissedPrivateAuctionIds(
                                            (current) => [
                                              ...new Set([
                                                ...current,
                                                selectedLootAuction._id,
                                              ]),
                                            ],
                                          );
                                          setSelectedLootEntryKeys([]);
                                        },
                                      )
                                    }
                                  />
                                </>
                              )
                            : lootItemActions(selectedLootItem)
                        }
                        alreadyOwned={ownedArtworkIds.has(
                          selectedLootItem.artwork_id,
                        )}
                        item={selectedLootItem}
                        owner={
                          selectedLootAuction
                            ? {
                                playerId:
                                  selectedLootAuction.seller_id ??
                                  "system:auction-house",
                                screenName: selectedLootAuction.seller_name,
                              }
                            : {
                                playerId,
                                screenName: player.screenName,
                              }
                        }
                        key={
                          selectedLootAuction
                            ? `auction:${selectedLootAuction._id}:${getItemCardKey(selectedLootItem)}`
                            : getItemCardKey(selectedLootItem)
                        }
                        legendaryAttributes={legendaryAttributes}
                        overlay={
                          <>
                            {donationEffects[selectedLootItem._id] ? (
                              <DonationRewardEffect
                                effect={donationEffects[selectedLootItem._id]}
                              />
                            ) : null}
                            {selectedLootAuction?.currentlyWinning ? (
                              <WinningAuctionWatermark />
                            ) : null}
                          </>
                        }
                        permissions={{
                          canManageItem: true,
                          canCustomizeCosmetic: false,
                        }}
                        primaryAction={
                          selectedLootAuction ? (
                            <button
                              className="collection-gallery-action"
                              disabled={pending}
                              onClick={() =>
                                setSelectedPrivateAuction(selectedLootAuction)
                              }
                              type="button"
                            >
                              <i aria-hidden="true" className="fa fa-gavel" />
                              Bid on item · $
                              {selectedLootAuction.minimum_bid.toLocaleString()}
                            </button>
                          ) : (
                            lootPrimaryAction(selectedLootItem)
                          )
                        }
                        researchTarget={unfoundQuestTargetArtworkIds.has(
                          selectedLootItem.artwork_id,
                        )}
                        styleInventory={player.cardStyleInventory}
                        viewerId={playerId}
                      />
                    </div>
                  ) : (
                    <div className="loot-preview-empty">
                      Select an artwork to preview it.
                    </div>
                  )}
                </div>
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "collection" && collectionItems.length > 0 ? (
          <InfoPanel className="home-gallery-overview">
            <section className="home-overview-section">
              <div className="home-overview-actions">
                <button
                  className="home-gallery-button"
                  onClick={() => {
                    setExploreGalleryId(playerId);
                    setExploreResetKey((current) => current + 1);
                    setSection("explore");
                    router.replace(
                      `/play?section=explore&gallery=${encodeURIComponent(playerId)}`,
                      { scroll: false },
                    );
                  }}
                  type="button"
                >
                  Go to gallery
                </button>
                {player.level >= 50 ? (
                  <span
                    className="vintage-runback-button-wrap"
                    title={
                      activeAuctionCount > 0
                        ? "Resolve all active auctions before entering a new era"
                        : vintageCandidates.length < vintageConsiderationCount
                          ? `Collect ${vintageConsiderationCount} eligible items before entering a new era`
                          : "Enter a new era"
                    }
                  >
                    <button
                      aria-label={
                        activeAuctionCount > 0
                          ? "Resolve all active auctions before entering a new era"
                          : vintageCandidates.length < vintageConsiderationCount
                            ? `Collect ${vintageConsiderationCount} eligible items before entering a new era`
                            : "Enter a new era"
                      }
                      className="vintage-runback-button home-new-era-button"
                      disabled={
                        activeAuctionCount > 0 ||
                        vintageCandidates.length < vintageConsiderationCount
                      }
                      onClick={() => setVintageDialogOpen(true)}
                      type="button"
                    >
                      Enter a new era
                    </button>
                  </span>
                ) : null}
              </div>
              <header className="home-overview-section-heading">
                <h2 className="info-panel-title">Gallery overview</h2>
              </header>
              <GalleryStats>
                <GalleryStat
                  label="Gallery value"
                  value={`$${(galleryMetadata?.value ?? 0).toLocaleString()}`}
                />
                <GalleryStat
                  label="On display"
                  value={
                    <DisplayedSummary
                      displayCapacity={player.displayCap}
                      rarities={displayed.map(
                        (item) => item.artwork.rarity,
                      )}
                      theme="museum"
                    />
                  }
                />
                <GalleryStat
                  label="Attribute score"
                  value={(galleryMetadata?.score ?? 0).toLocaleString()}
                />
                <GalleryStat
                  label="Featured value"
                  value={`$${(
                    galleryMetadata?.featured_value ?? 0
                  ).toLocaleString()}`}
                />
                <GalleryStat
                  label="Earnings per hour"
                  value={`$${galleryRates.moneyPerHour.toLocaleString()}`}
                />
                <GalleryStat
                  label="Experience per hour"
                  value={galleryRates.xpPerHour.toLocaleString()}
                />
                <GalleryStat
                  label="Attributes"
                  value={
                    galleryMetadata && galleryMetadata.attributes.length > 0
                      ? galleryMetadata.attributes.map((attribute, i) => (
                          <Attribute
                            attribute={attribute}
                            displayCapacity={galleryMetadata.display_capacity}
                            key={`${attribute.id}_${i}`}
                          />
                        ))
                      : "None"
                  }
                />
              </GalleryStats>
              <div
                aria-label="Artwork on display"
                className="home-gallery-display-items collection-thumbnail-list"
              >
                {displayed.length === 0 ? (
                  <p className="collection-sidebar-empty">
                    No works are currently on display.
                  </p>
                ) : (
                  displayed.map((item) => (
                    <button
                      aria-label={`Open details for ${item.artwork.title} by ${item.artwork.artist}`}
                      aria-pressed={selectedCollectionItemIdsSet.has(item._id)}
                      className={
                        selectedCollectionItemIdsSet.has(item._id)
                          ? "selected"
                          : ""
                      }
                      data-rarity={item.artwork.rarity}
                      key={item._id}
                      onClick={(event) =>
                        toggleCollectionItemSelection(item._id, event)
                      }
                      onContextMenu={(event) => {
                        if (suppressedCollectionClickRef.current === item._id) {
                          event.preventDefault();
                        }
                      }}
                      onPointerCancel={cancelCollectionItemLongPress}
                      onPointerDown={(event) =>
                        startCollectionItemLongPress(item._id, event)
                      }
                      onPointerLeave={cancelCollectionItemLongPress}
                      onPointerMove={moveCollectionItemLongPress}
                      onPointerUp={cancelCollectionItemLongPress}
                      title={`${item.artwork.title} by ${item.artwork.artist}`}
                      type="button"
                    >
                      <ItemThumbnail
                        alt=""
                        item={item}
                        researchTarget={unfoundQuestTargetArtworkIds.has(
                          item.artwork_id,
                        )}
                        size={82}
                      />
                    </button>
                  ))
                )}
              </div>
            </section>
          </InfoPanel>
        ) : null}

        {section === "collection" && collectionItems.length === 0 ? (
          <section className="collection-empty-state">
            <button onClick={() => setSection("loot")} type="button">
              go here and come back when you collect some artwork!
            </button>
          </section>
        ) : null}

        {section === "collection" && collectionItems.length > 0 ? (
          <section className="collection-workspace">
            <aside className="collection-inventory-panel">
              <section className="collection-sidebar-section">
                <header className="collection-panel-heading">
                  <div>
                    <span className="collection-kicker">your collection</span>
                    <h2>
                      inventory{" "}
                    </h2>
                  </div>
                  <span
                    aria-label={`${player.inventorySlotsUsed.toLocaleString()} of ${player.inventoryCap.toLocaleString()} inventory slots used`}
                    className="collection-count"
                    title="Inventory slots used"
                  >
                    {player.inventorySlotsUsed}/{player.inventoryCap}
                  </span>
                </header>
                <CollectionInventoryControls
                  artStyleOptions={collectionArtStyleOptions}
                  attributeOptions={collectionAttributeOptions}
                  filters={normalizedCollectionFilters}
                  matchCount={sortedHomeInventory.length}
                  onFiltersChange={setCollectionFilters}
                  onSortChange={(next) => {
                    setInventorySort(next);
                    saveViewSettings({ inventorySort: next });
                  }}
                  sort={inventorySort}
                  specialAttributeOptions={collectionSpecialAttributeOptions}
                  tags={collectionTags}
                  totalCount={collectionItems.length}
                />
                {sortedHomeInventory.length === 0 ? (
                  <p className="collection-sidebar-empty">
                    No artworks match the current filters.
                  </p>
                ) : (
                  <div className="collection-thumbnail-list">
                    {sortedHomeInventory.map((item) => (
                      <button
                        aria-label={`Preview ${item.artwork.title} by ${item.artwork.artist}`}
                        aria-pressed={selectedCollectionItemIdsSet.has(item._id)}
                        data-rarity={item.artwork.rarity}
                        className={
                          selectedCollectionItemIdsSet.has(item._id)
                            ? "selected"
                            : ""
                        }
                        key={item._id}
                        onClick={(event) =>
                          toggleCollectionItemSelection(item._id, event)
                        }
                        onContextMenu={(event) => {
                          if (
                            suppressedCollectionClickRef.current === item._id
                          ) {
                            event.preventDefault();
                          }
                        }}
                        onPointerCancel={cancelCollectionItemLongPress}
                        onPointerDown={(event) =>
                          startCollectionItemLongPress(item._id, event)
                        }
                        onPointerLeave={cancelCollectionItemLongPress}
                        onPointerMove={moveCollectionItemLongPress}
                        onPointerUp={cancelCollectionItemLongPress}
                        title={`${item.artwork.title} by ${item.artwork.artist}`}
                        type="button"
                      >
                        <ItemThumbnail
                          alt=""
                          item={item}
                          researchTarget={unfoundQuestTargetArtworkIds.has(
                            item.artwork_id,
                          )}
                          showDisplayStatus
                          size={82}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </aside>
            <div className="collection-main">
              {selectedCollectionItems.length > 1 ? (
                <CollectionBulkActionsPanel
                  attributeScore={collectionBulkAttributeScore}
                  availability={collectionBulkState.availability}
                  itemCount={selectedCollectionItems.length}
                  onAction={requestCollectionBulkAction}
                  pending={pending}
                  totalValue={collectionBulkTotalValue}
                />
              ) : selectedCollectionItem ? (
                <section className="collection-preview" aria-live="polite">
                  <ItemCard
                    actions={
                      selectedCollectionItem.status === "displayed"
                        ? collectionDisplayedItemActions(selectedCollectionItem)
                        : selectedCollectionItem.status === "auctioned"
                          ? tagItemAction(selectedCollectionItem)
                          : collectionItemActions(selectedCollectionItem)
                    }
                    consigned={selectedCollectionItem.status === "auctioned"}
                    item={selectedCollectionItem}
                    owner={{
                      playerId,
                      screenName: player.screenName,
                    }}
                    key={getItemCardKey(selectedCollectionItem)}
                    legendaryAttributes={legendaryAttributes}
                    permissions={{
                      canManageItem: true,
                      canCustomizeCosmetic:
                        selectedCollectionItem.status !== "auctioned",
                    }}
                    primaryAction={
                      selectedCollectionItem.status === "auctioned"
                        ? undefined
                        : collectionGalleryAction(selectedCollectionItem)
                    }
                    researchTarget={unfoundQuestTargetArtworkIds.has(
                      selectedCollectionItem.artwork_id,
                    )}
                    styleInventory={player.cardStyleInventory}
                    viewerId={playerId}
                  />
                </section>
              ) : (
                <section
                  aria-live="polite"
                  className="collection-preview collection-selection-empty"
                >
                  <p>Select an artwork to preview it.</p>
                </section>
              )}
            </div>
          </section>
        ) : null}

        {section === "inventory" ? (
          <section className="inventory">
            <InventorySection
              emptyText="No works are currently on display."
              items={displayed}
              legendaryAttributes={legendaryAttributes}
              researchArtworkIds={unfoundQuestTargetArtworkIds}
              canCustomize
              styleInventory={player.cardStyleInventory}
              title={`on display (${displayed.length}/${player.displayCap})`}
              viewerId={playerId}
              actions={displayedItemActions}
            />
            <InventorySection
              emptyText="Your inventory is empty."
              items={sortedInventory}
              legendaryAttributes={legendaryAttributes}
              researchArtworkIds={unfoundQuestTargetArtworkIds}
              canCustomize
              styleInventory={player.cardStyleInventory}
              donationEffects={donationEffects}
              title="inventory"
              controls={
                <label className="inventory-sort">
                  <span>Sort</span>
                  <select
                    onChange={(event) => {
                      const next = event.target.value as InventorySort;
                      setInventorySort(next);
                      saveViewSettings({ inventorySort: next });
                    }}
                    value={inventorySort}
                  >
                    <InventorySortOptions />
                  </select>
                </label>
              }
              viewerId={playerId}
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
                const historianQuests = historianQuestsForItem(item);
                const historianDisabledReason =
                  historianSubmissionDisabledReason(
                    item,
                    historianQuests.length,
                  );
                return (
                  <>
                    <ItemActionButton
                      gridSlot={1}
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
                          : () => setError(displayPermission.reason)
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
                      gridSlot={2}
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
                      gridSlot={4}
                      icon="fa-magic"
                      label="Modify attributes"
                      disabled={pending}
                      onClick={() =>
                        setRerollSession({
                          item,
                          bankBalance: player.bankBalance,
                          karma: karmaBalance,
                        })
                      }
                    />
                    <ItemActionButton
                      gridSlot={5}
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
                      gridSlot={7}
                      icon="fa-gavel"
                      label="Put up for auction"
                      disabled={pending || item.permanent || item.repairing}
                      onClick={() => setAuctionListingItem(item)}
                    />
                    <ItemActionButton
                      destructive
                      gridSlot={3}
                      icon="fa-usd"
                      label={`Sell for $${item.values.sell.toLocaleString()}`}
                      disabled={pending}
                      onClick={() => requestItemRemoval(item, "sell")}
                    />
                    <ItemActionButton
                      destructive
                      gridSlot={9}
                      icon="fa-share-square"
                      label="Donate for Karma"
                      disabled={pending || item.permanent}
                      onClick={() => requestItemRemoval(item, "donate")}
                    />
                    <AuthenticityActions
                      act={act}
                      gridSlot={8}
                      item={item}
                      pending={pending}
                    />
                    {tagItemAction(item)}
                    {archiveAction(item, 6)}
                    <ItemActionButton
                      destructive
                      gridSlot={10}
                      icon="fa-museum"
                      label="Send to Historian"
                      disabled={pending || Boolean(historianDisabledReason)}
                      disabledReason={historianDisabledReason}
                      onClick={() => requestHistorianSubmission(item)}
                    />
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
              router.refresh();
            }}
          />
        ) : null}

        {section === "archive" ? (
          <section className="archive">
            <header className="archive-heading">
              <button
                className="archive-forgery-button"
                onClick={() => setForgeryDialogInitialArchiveId(null)}
                type="button"
              >
                <i aria-hidden="true" className="fa fa-user-secret" />
                Create a forgery
              </button>
            </header>
            {archives.length === 0 ? (
              <p className="empty-state">Your archive is empty.</p>
            ) : (
              <>
                <div className="archive-filters">
                  <label className="archive-search">
                    <span>Search archive</span>
                    <input
                      onChange={(event) =>
                        setArchiveFilters((current) => ({
                          ...current,
                          search: event.target.value,
                        }))
                      }
                      placeholder="artist or artwork"
                      type="search"
                      value={normalizedArchiveFilters.search}
                    />
                  </label>
                  <label>
                    <span>Sort</span>
                    <select
                      onChange={(event) =>
                        setArchiveFilters((current) => ({
                          ...current,
                          sort: event.target.value as ArchiveSort,
                        }))
                      }
                      value={normalizedArchiveFilters.sort}
                    >
                      <ArchiveSortOptions />
                    </select>
                  </label>
                  <label>
                    <span>Rarity</span>
                    <select
                      onChange={(event) =>
                        setArchiveFilters((current) => ({
                          ...current,
                          rarity: event.target.value as
                            | ArtworkRarity
                            | "all",
                        }))
                      }
                      value={normalizedArchiveFilters.rarity}
                    >
                      <option value="all">all rarities</option>
                      {ARTWORK_RARITIES.map((rarity) => (
                        <option key={rarity} value={rarity}>
                          {rarity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Progress</span>
                    <select
                      onChange={(event) =>
                        setArchiveFilters((current) => ({
                          ...current,
                          completion: event.target.value as
                            ArchiveBrowseFilters["completion"],
                        }))
                      }
                      value={normalizedArchiveFilters.completion}
                    >
                      <option value="all">all entries</option>
                      <option value="incomplete">incomplete</option>
                      <option value="complete">complete</option>
                    </select>
                  </label>
                  <label>
                    <span>Unlocked art style</span>
                    <select
                      onChange={(event) =>
                        setArchiveFilters((current) => ({
                          ...current,
                          artStyle: event.target.value,
                        }))
                      }
                      value={normalizedArchiveFilters.artStyle}
                    >
                      <option value="">all art styles</option>
                      {archiveArtStyleOptions.map((style) => (
                        <option key={style.id} value={style.id}>
                          {style.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details className="archive-filter-details">
                    <summary>
                      Variant filters
                      <span>
                        {filteredArchiveEntries.length}/{archiveEntries.length}
                      </span>
                    </summary>
                    <div className="archive-variant-filters">
                      {ARCHIVE_FILTER_CATEGORIES.map((category) => (
                        <label key={category}>
                          <span>{ARCHIVE_FILTER_LABELS[category]}</span>
                          <select
                            onChange={(event) =>
                              setArchiveFilters((current) => ({
                                ...current,
                                variants: {
                                  ...current.variants,
                                  [category]: event.target
                                    .value as ArchiveFilterMode,
                                },
                              }))
                            }
                            value={
                              normalizedArchiveFilters.variants[category]
                            }
                          >
                            <option value="any">Any</option>
                            <option value="only">Only</option>
                            <option value="exclude">Exclude</option>
                          </select>
                        </label>
                      ))}
                      <button
                        className="archive-clear-filters"
                        onClick={() =>
                          setArchiveFilters(getDefaultArchiveBrowseFilters())
                        }
                        type="button"
                      >
                        Clear filters
                      </button>
                    </div>
                  </details>
                </div>
                {filteredArchiveEntries.length === 0 ? (
                  <p className="empty-state">No archive entries match.</p>
                ) : (
                  <div className="archive-artwork-grid">
                    {filteredArchiveEntries.map(
                      ({ archive, complete, progress }) => (
                        <button
                          aria-label={`Open archive entry for ${archive.artwork.title} by ${archive.artwork.artist}, ${progress.archived} of ${progress.total} properties archived`}
                          className="archive-artwork-thumbnail"
                          data-complete={complete ? "true" : undefined}
                          data-rarity={archive.artwork.rarity}
                          key={archive._id}
                          onClick={() => setArchiveEntryDetails(archive)}
                          title={`${archive.artwork.title} by ${archive.artwork.artist}`}
                          type="button"
                        >
                          <ArtworkThumbnail
                            alt=""
                            artworkId={archive.artwork_id}
                            size={82}
                          >
                            <span
                              aria-label={`${progress.archived} of ${progress.total} archive properties collected`}
                              className="archive-property-progress"
                              role="img"
                            >
                              <i aria-hidden="true" className="fa fa-archive" />
                              {progress.archived}/{progress.total}
                            </span>
                          </ArtworkThumbnail>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </>
            )}
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
            <div className="npc-area">
              {galleryVisitors.map((npc) => {
                const socialBatteryCost = getVisitorSocialBatteryCost(
                  npc.quality,
                  true,
                );
                const insufficientBattery =
                  socialBattery < socialBatteryCost;
                return (
                  <span className="gallery-npc-slot" key={npc._id}>
                    <button
                      className={`gallery-npc ${npc.quality} ${
                        npc.alreadyMet || insufficientBattery
                          ? "disabled"
                          : "enabled"
                      } ${npcRewardEffects[npc._id] ? "rewarding" : ""}`}
                      data-npc-id={npc._id}
                      disabled={
                        pending ||
                        meetingNpc !== null ||
                        npc.alreadyMet ||
                        insufficientBattery ||
                        Boolean(npcRewardEffects[npc._id])
                      }
                      onClick={async () => {
                        if (await meetNpc(npc)) {
                          markVisitorMet(npc._id);
                        } else {
                          removeVisitor(npc._id);
                          void refreshVisitors();
                        }
                      }}
                      title={
                        npc.alreadyMet
                          ? `${npc.npc_name} already met`
                          : insufficientBattery
                            ? `${socialBatteryCost} social battery required`
                            : `meet ${npc.npc_name} (${socialBatteryCost} social battery)`
                      }
                      type="button"
                    >
                      <i aria-hidden="true" className={`fa ${npc.icon}`} />
                      <span>{npc.npc_name}</span>
                    </button>
                  </span>
                );
              })}
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
                            backgroundImage: `url("/api/artwork/${item.artwork_id}/image?variant=full")`,
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
            <GalleryChat galleryOwnerId={playerId} viewerId={playerId} />
          </section>
        ) : null}

        {section === "quests" ? (
          <QuestSection
            onAction={act}
            completed={player.completedQuests}
            pending={pending}
            quests={quests}
          />
        ) : null}

        {section === "explore" ? (
          <GalleryExplorer
            impersonating={impersonating}
            initialBankBalance={player.bankBalance}
            initialGalleryId={exploreGalleryId}
            initialSort={player.viewSettings.gallerySort}
            initialViewMode={player.viewSettings.galleryView}
            key={`gallery-explorer-${exploreResetKey}`}
            meetingNpc={meetingNpc}
            npcSpawnOptions={npcSpawnOptions}
            npcSpawnIntervalMinutes={npcSpawnIntervalMinutes}
            npcRewardEffects={npcRewardEffects}
            onMeetNpc={meetNpc}
            onGoHome={() => {
              setExploreGalleryId(null);
              setSection("collection");
              router.replace("/play?section=home", { scroll: false });
            }}
            onViewSettingsChange={saveViewSettings}
            socialBattery={socialBattery}
            viewerId={playerId}
          />
        ) : null}

        {section === "auctions" ? (
          <AuctionHouse
            canMakePrivateAuctionsPublic={canMakePrivateAuctionsPublic}
            initialBankBalance={player.bankBalance}
            initialAuctionId={searchParams.get("auction")}
            legendaryAttributes={legendaryAttributes}
            marketExpertExpiration={marketExpertExpiration}
            playerId={playerId}
          />
        ) : null}

        {section === "daily" ? (
          <DailyEventsPanel
            currentDay={dailyEventDay}
            impersonating={impersonating}
            legendaryAttributes={legendaryAttributes}
            playerId={playerId}
            raffle={raffle}
          />
        ) : null}

        {rerollSession ? (
          <RerollDialog
            bankBalance={rerollSession.bankBalance}
            item={rerollSession.item}
            karma={rerollSession.karma}
            levelUpDiscountAvailable={levelUpDiscountAvailable}
            levelUpConditionMinimum={levelUpConditionMinimum}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setRerollSession(null)}
            onRerolled={(item, nextBankBalance) => {
              setRerollSession({
                item,
                bankBalance: nextBankBalance,
                karma: rerollSession.karma,
              });
              router.refresh();
            }}
            onLeveled={(item, karma) => {
              setRerollSession((current) =>
                current ? { ...current, item, karma } : current,
              );
              router.refresh();
            }}
          />
        ) : null}
        {tagEditorItems.length > 0 ? (
          <ItemTagsDialog
            items={tagEditorItems}
            onClose={() => setTagEditorItems([])}
            onSaved={(message) => {
              setNotice(message);
              setTagEditorItems([]);
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
        {collectionBulkConfirmation && collectionBulkConfirmationCopy ? (
          <CollectionBulkConfirmationDialog
            actionLabel={collectionBulkConfirmationCopy.actionLabel}
            confirmLabel={collectionBulkConfirmationCopy.confirmLabel}
            description={collectionBulkConfirmationCopy.description}
            destructive={collectionBulkConfirmationCopy.destructive}
            itemCount={selectedCollectionItems.length}
            onCancel={() => setCollectionBulkConfirmation(null)}
            onConfirm={() =>
              performCollectionBulkAction(collectionBulkConfirmation)
            }
            totalValue={collectionBulkTotalValue}
          />
        ) : null}
        {lootBulkConfirmation && lootBulkConfirmationCopy ? (
          <CollectionBulkConfirmationDialog
            actionLabel={lootBulkConfirmationCopy.actionLabel}
            confirmLabel={lootBulkConfirmationCopy.confirmLabel}
            contextLabel="Bulk offers action"
            description={lootBulkConfirmationCopy.description}
            destructive
            itemCount={selectedLootEntries.length}
            onCancel={() => setLootBulkConfirmation(null)}
            onConfirm={() => performLootBulkAction(lootBulkConfirmation)}
            totalValue={lootBulkTotalValue}
          />
        ) : null}
        {actionDialog ? (
          <ActionResultDialog
            result={actionDialog}
            onClose={() => setActionDialog(null)}
          />
        ) : null}
        {vintageDialogOpen ? (
          <EnterEraDialog
            items={vintageCandidates}
            requiredCount={vintageConsiderationCount}
            activeAuctionCount={activeAuctionCount}
            onClose={() => setVintageDialogOpen(false)}
            onComplete={(message) => {
              setVintageDialogOpen(false);
              setNotice(message);
              router.refresh();
            }}
          />
        ) : null}
        {galleryItemDetails ? (
          <StandardItemDialog
            actions={displayedItemActions(galleryItemDetails)}
            currentRendererId={resolveCardRendererId({
              itemRendererId: galleryItemDetails.card_renderer,
            })}
            displayOwner={{
              playerId,
              screenName: player.screenName,
            }}
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
            viewerId={playerId}
          />
        ) : null}
        {linkedItemDetails ? (
          <StandardItemDialog
            currentRendererId={resolveCardRendererId({
              itemRendererId: linkedItemDetails.item.card_renderer,
            })}
            displayOwner={linkedItemDetails.displayOwner ?? undefined}
            item={linkedItemDetails.item}
            legendaryAttributes={legendaryAttributes}
            onClose={() => {
              setLinkedItemDetails(null);
              const params = new URLSearchParams(searchParams.toString());
              params.delete("item");
              router.replace(
                params.size > 0 ? `/play?${params.toString()}` : "/play",
                { scroll: false },
              );
            }}
            permissions={{
              canManageItem: false,
              canCustomizeCosmetic: false,
            }}
            viewerId={playerId}
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
            researchTarget={unfoundQuestTargetArtworkIds.has(
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
        {valuableItemConfirmation ? (
          <ValuableItemConfirmationDialog
            action={valuableItemConfirmation.action}
            item={valuableItemConfirmation.item}
            onCancel={() => setValuableItemConfirmation(null)}
            onConfirm={() => {
              if (valuableItemConfirmation.action === "sell") {
                act(
                  `/api/play/items/${valuableItemConfirmation.item._id}/sell`,
                );
              } else {
                donateItem(valuableItemConfirmation.item);
              }
            }}
          />
        ) : null}
        {archiveEntryDetails ? (
          <ArchiveEntryDialog
            activeArtStyles={archiveArtStyleIds}
            archive={archiveEntryDetails}
            forgeDisabledReason={
              inventoryFull &&
              !archiveEntryDetails.modifiers.includes("vintage")
                ? "Your inventory is currently full."
                : undefined
            }
            onClose={() => setArchiveEntryDetails(null)}
            onForge={() => {
              setForgeryDialogInitialArchiveId(archiveEntryDetails._id);
              setArchiveEntryDetails(null);
            }}
            seasonalEligible={forgePricing.seasonalArtworkIds.includes(
              archiveEntryDetails.artwork_id,
            )}
          />
        ) : null}
        {forgeryDialogInitialArchiveId !== undefined ? (
          <ForgeryDialog
            archives={archives}
            initialArchiveId={forgeryDialogInitialArchiveId}
            inventoryFull={inventoryFull}
            pricing={forgePricing}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setForgeryDialogInitialArchiveId(undefined)}
            onForged={(message) => {
              setForgeryDialogInitialArchiveId(undefined);
              setNotice(message);
              router.refresh();
            }}
          />
        ) : null}
        {selectedPrivateAuction ? (
          <AuctionBidDialog
            auction={selectedPrivateAuction}
            bankBalance={player.bankBalance}
            canMakePublic={canMakePrivateAuctionsPublic}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setSelectedPrivateAuction(null)}
            onMadePublic={(auctionId, message) =>
              handlePrivateAuctionMadePublic(auctionId, message)
            }
            onSuccess={() => {
              setSelectedPrivateAuction(null);
              router.refresh();
            }}
            playerId={playerId}
          />
        ) : null}
        {historianSubmissionItem ? (
          <HistorianSubmissionDialog
            item={historianSubmissionItem}
            onClose={() => setHistorianSubmissionItem(null)}
            onSelect={(questId) =>
              void sendItemToHistorian(historianSubmissionItem, questId)
            }
            pending={pending}
            quests={historianQuestsForItem(historianSubmissionItem)}
          />
        ) : null}
        {hydrated
          ? createPortal(
              <NpcEffectLayer effects={Object.values(npcRewardEffects)} />,
              document.body,
            )
          : null}
      </div>
    </main>
  );
}

function subscribeToHydration() {
  return () => undefined;
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydratedSnapshot() {
  return false;
}

function NpcEffectLayer({ effects }: { effects: NpcVisualEffect[] }) {
  return (
    <div className="npc-effect-layer" aria-live="polite">
      {effects.map((effect) => (
        <div
          aria-label={effect.label}
          className="npc-effect-burst"
          key={effect.animationId}
          role="status"
          style={{ left: effect.originX, top: effect.originY }}
        >
          {effect.tokens.map((token, index) => (
            <span
              className={`npc-effect-token ${token.tone}`}
              key={`${effect.animationId}-${index}`}
              style={{ animationDelay: `${index * 110}ms` }}
            >
              <i aria-hidden="true" className={`fa ${token.icon}`} />
              {token.text ? <strong>{token.text}</strong> : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function QuestSection({
  completed,
  onAction,
  pending,
  quests,
}: {
  completed: number;
  onAction: (url: string) => void;
  pending: boolean;
  quests: ArtHistorianQuestView[];
}) {
  return (
    <section className="historian-quests">
      <InfoPanel>
        <div className="flex flex-col gap-3">
          <header>
            <h2 className="info-panel-title">research quests</h2>
          </header>
          <GalleryStats>
            <GalleryStat label="Active" value={quests.length} />
            <GalleryStat label="Available" value={8 - quests.length} />
            <GalleryStat label="Completed" value={completed} />
          </GalleryStats>
        </div>
      </InfoPanel>
      {quests.length === 0 ? (
        <p className="empty-state">
          You have no active Art Historian objectives. Go visit galleries and interact with visitors to get research quests!
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
                    Submit {quest.min_requirement} of {quest.target.length}{" "}
                    requested works
                  </h3>
                </div>
                <strong
                  className={
                    quest.progress.canClaim ? "complete" : undefined
                  }
                >
                  {quest.progress.fulfilled}/{quest.progress.targetCount}
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
                    onClick={() => {
                      const submitted = quest.progress.fulfilled;
                      if (
                        submitted > 0 &&
                        !window.confirm(
                          `Cancel this objective and forfeit ${submitted} submitted ${submitted === 1 ? "artwork" : "artworks"}?`,
                        )
                      ) {
                        return;
                      }
                      onAction(`/api/play/quests/${quest._id}/cancel`);
                    }}
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
          className={`historian-target ${
            target.fulfilled ? "fulfilled" : target.owned ? "owned" : "missing"
          }`}
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
            aria-label={
              target.fulfilled
                ? "Sent to Historian"
                : target.owned
                  ? "Available to send"
                  : "Not collected"
            }
            className={`fa ${
              target.fulfilled
                ? "fa-check-circle"
                : target.owned
                  ? "fa-arrow-circle-right"
                  : "fa-circle-o"
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

function HistorianSubmissionDialog({
  item,
  onClose,
  onSelect,
  pending,
  quests,
}: {
  item: HydratedGameItem;
  onClose: () => void;
  onSelect: (questId: string) => void;
  pending: boolean;
  quests: ArtHistorianQuestView[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby="historian-submission-title"
      className="reroll-dialog historian-submission-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="reroll-dialog-content">
        <header className="reroll-dialog-header">
          <div>
            <p className="reroll-dialog-kicker">Art Historian</p>
            <h2 id="historian-submission-title">Choose a research quest</h2>
            <p className="reroll-artwork-artist">
              {item.artwork.title} by {item.artwork.artist}
            </p>
          </div>
          <button
            aria-label="Close Historian submission dialog"
            className="reroll-dialog-close"
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <p className="reroll-dialog-description">
          Sending this artwork removes it from your collection. Choose which
          quest target it should fulfill.
        </p>
        <div className="historian-submission-options">
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
                    Submit {quest.min_requirement} of {quest.target.length}{" "}
                    requested works
                  </h3>
                </div>
                <strong
                  className={
                    quest.progress.canClaim ? "complete" : undefined
                  }
                >
                  {quest.progress.fulfilled}/{quest.progress.targetCount}
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
                <button
                  className="historian-submission-select"
                  disabled={pending}
                  onClick={() => onSelect(quest._id)}
                  type="button"
                >
                  <i aria-hidden="true" className="fa fa-graduation-cap" /> Use
                  this quest
                </button>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </dialog>
  );
}

function ActionResultDialog({
  result,
  onClose,
}: {
  result: ActionDialogResult;
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
      aria-describedby="action-result-description"
      aria-labelledby="action-result-title"
      className="forgery-result-dialog"
      data-outcome={result.variant}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="forgery-result-content">
        <header>
          <div>
            <p className="reroll-dialog-kicker">Authenticity alert</p>
            <h2 id="action-result-title">{result.title}</h2>
          </div>
          <button
            aria-label="Close action result"
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <div className="forgery-result-emblem" aria-hidden="true">
          <i
            className={`fa ${
              result.variant === "authenticated"
                ? "fa-check-circle"
                : result.variant === "returned"
                  ? "fa-search"
                  : "fa-ban"
            }`}
          />
          {result.variant !== "authenticated" ? (
            <i className="fa fa-user-secret" />
          ) : null}
        </div>
        <p className="forgery-result-message" id="action-result-description">
          {result.message}
        </p>
        <div className="forgery-result-actions">
          <button onClick={closeDialog} type="button">
            Acknowledge
          </button>
        </div>
      </div>
    </dialog>
  );
}

function RerollDialog({
  item,
  bankBalance,
  karma,
  levelUpDiscountAvailable,
  levelUpConditionMinimum,
  legendaryAttributes,
  onClose,
  onLeveled,
  onRerolled,
}: {
  item: HydratedGameItem;
  bankBalance: number;
  karma: number;
  levelUpDiscountAvailable: boolean;
  levelUpConditionMinimum: number;
  legendaryAttributes: LegendaryAttributeView[];
  onClose: () => void;
  onLeveled: (item: HydratedGameItem, karma: number) => void;
  onRerolled: (item: HydratedGameItem, bankBalance: number) => void;
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
  const levelUpCost = getItemLevelUpCost(item.level, levelUpDiscounted);
  const canAffordLevelUp = canAffordItemLevelUp(karma, levelUpCost);
  const atMaximumLevel = item.level >= ITEM_LEVEL_MAX;
  const eligibleLegendaryAttributes = legendaryAttributes.filter(
    (attribute) =>
      attribute.active &&
      item.artwork.effect_id === attribute.id,
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
    const preservationEffect =
      actionLabel === "Displaying this artwork" &&
      legendaryAttributes.some(
        (attribute) =>
          attribute.active &&
          attribute.id === item.artwork.effect_id &&
          attribute.code === "MP_PRESERVATION_MINT",
      );
    if (!item.mint || preservationEffect) {
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
      setNotice(message);
    } catch (rerollError) {
      const message =
        rerollError instanceof Error
          ? rerollError.message
          : "The reroll could not be completed.";
      setError(message);
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
        karma?: number;
        message?: string;
      };
      if (!response.ok || !body.item || body.karma === undefined) {
        throw new Error(body.error ?? "The promotion could not be completed.");
      }

      const nextItem: HydratedGameItem = {
        ...item,
        ...body.item,
        artwork: item.artwork,
      };
      onLeveled(nextItem, body.karma);
      const message =
        body.message ??
        `${item.artwork.title} reached level ${nextItem.level}.`;
      setNotice(message);
    } catch (levelError) {
      const message =
        levelError instanceof Error
          ? levelError.message
          : "The promotion could not be completed.";
      setError(message);
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
            <ItemThumbnail
              alt={`${item.artwork.title} by ${item.artwork.artist}`}
              className="reroll-artwork-thumbnail"
              item={item}
            />
            <div>
              <p className="reroll-dialog-kicker">
                modify artwork · promotion level {item.level}
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
                Promotion Level {item.level} <span>/ {ITEM_LEVEL_MAX}</span>
              </h3>
            </div>
          </header>
          <p className="item-level-up-description">
            Spend Karma earned through donations to promote this item,
            increasing its value and improving the minimum attraction values
            available on future rerolls.
          </p>
          {!atMaximumLevel ? (
            <>
              {levelUpDiscounted ? (
                <p className="item-level-up-discount">
                  <i aria-hidden="true" className="fa fa-wrench" />
                  Preservationist benefit: Karma cost reduced by 20%.
                </p>
              ) : null}
              <div className="item-level-up-costs">
                <div className={canAffordLevelUp ? "" : "insufficient"}>
                  <span>Karma</span>
                  <strong>
                    {levelUpCost.toLocaleString()} / {karma.toLocaleString()}
                  </strong>
                  <small>(required / available)</small>
                </div>
              </div>
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
                {busy ? "Applying level..." : `Increase promotion level`}
              </button>
              {!canAffordLevelUp ? (
                <p className="item-level-up-unavailable">
                  You need more Karma to promote this artwork.
                </p>
              ) : null}
            </>
          ) : (
            <p className="item-level-up-maximum">
              This artwork has reached the maximum development level.
            </p>
          )}
        </section>

        {eligibleLegendaryAttributes[0] ? (
          <fieldset className="legendary-selector">
            <legend>Artwork Effect</legend>
            <div className="legendary-selector-single">
              <span>
                <strong>{eligibleLegendaryAttributes[0].title}</strong>
                <span>{eligibleLegendaryAttributes[0].description}</span>
                <em>
                  &ldquo;{eligibleLegendaryAttributes[0].flavorText}&rdquo;
                </em>
              </span>
            </div>
          </fieldset>
        ) : null}

        <div className="reroll-attributes">
          <h3>Attributes</h3>
          <p id="reroll-description" className="reroll-dialog-description">
            These determine which type of visitor the work is most likely to attract.
          </p>
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

type ActionGridSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

function AuthenticityActions({
  item,
  pending,
  act,
  gridSlot,
}: {
  item: HydratedGameItem;
  pending: boolean;
  act: (url: string) => void;
  gridSlot?: ActionGridSlot;
}) {
  const authenticate = item.authenticationPermission;
  const allowed = authenticate?.allowed === true;
  return (
    <>
      <ItemActionButton
        alwaysVisible
        disabled={pending || !allowed}
        disabledReason={
          !allowed
            ? authenticate?.reason ?? "This artwork cannot be authenticated."
            : undefined
        }
        gridSlot={gridSlot}
        icon="fa-search"
        label={
          allowed
            ? `Authenticate for $${authenticate.cost.toLocaleString()}`
            : "Authenticate"
        }
        onClick={() => act(`/api/play/items/${item._id}/authenticate`)}
      />
      {/*<ItemActionButton
        disabled={pending || !report?.allowed}
        disabledReason={
          report && !report.allowed ? report.reason : undefined
        }
        icon="fa-flag"
        label="Report suspicious artwork"
        onClick={() => act(`/api/play/items/${item._id}/report`)}
      />*/}
    </>
  );
}

function ItemActionButton({
  icon,
  label,
  disabled,
  disabledReason,
  gridSlot,
  alwaysVisible = false,
  onDisabledClick,
  onClick,
  variant = "default",
}: {
  icon: string;
  label: string;
  disabled: boolean;
  disabledReason?: string;
  destructive?: boolean;
  gridSlot?: ActionGridSlot;
  alwaysVisible?: boolean;
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
      className={`item-action-button item-action-${variant}${
        alwaysVisible ? " item-action-always-visible" : ""
      }${gridSlot ? ` card-action-slot-${gridSlot}` : ""}`}
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
  donationEffects,
  viewerId,
  actions,
  controls,
}: {
  title: string;
  emptyText: string;
  items: HydratedGameItem[];
  legendaryAttributes: LegendaryAttributeView[];
  researchArtworkIds: ReadonlySet<string>;
  canCustomize?: boolean;
  styleInventory: CardStyleInventory;
  donationEffects?: Record<
    string,
    { animationId: number; recoveredStyle: boolean }
  >;
  viewerId: string;
  actions: (item: HydratedGameItem) => React.ReactNode;
  controls?: React.ReactNode;
}) {
  return (
    <section className="inventory-section">
      <div className="inventory-section-heading">
        <h2>{title}</h2>
        {controls}
      </div>
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
              overlay={
                donationEffects?.[item._id] ? (
                  <DonationRewardEffect effect={donationEffects[item._id]} />
                ) : null
              }
              permissions={{
                canManageItem: true,
                canCustomizeCosmetic:
                  Boolean(canCustomize) && item.status !== "auctioned",
              }}
              researchTarget={researchArtworkIds.has(item.artwork_id)}
              styleInventory={styleInventory}
              viewerId={viewerId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LootBulkActionsPanel({
  availability,
  category,
  itemCount,
  onAction,
  pending,
  purchaseCost,
  totalValue,
}: {
  availability: Record<LootBulkAction, CollectionBulkAvailability>;
  category: LootCategory;
  itemCount: number;
  onAction: (action: LootBulkAction) => void;
  pending: boolean;
  purchaseCost: number;
  totalValue: number;
}) {
  const actionSets: Record<
    LootCategory,
    Array<{
      action: LootBulkAction;
      destructive?: boolean;
      icon: string;
      label: string;
    }>
  > = {
    unclaimed: [
      { action: "acquire", icon: "fa-download", label: "Collect" },
      {
        action: "collector-sale",
        icon: "fa-binoculars",
        label: "Collect and set for sale",
      },
      {
        action: "remove",
        icon: "fa-usd",
        label: "Sell",
        destructive: true,
      },
      {
        action: "donate",
        icon: "fa-share-square",
        label: "Donate",
        destructive: true,
      },
      {
        action: "historian",
        icon: "fa-museum",
        label: "Send to Historian",
        destructive: true,
      },
      {
        action: "archive",
        icon: "fa-archive",
        label: "Archive",
        destructive: true,
      },
    ],
    "for-sale": [
      { action: "acquire", icon: "fa-shopping-cart", label: "Purchase" },
      {
        action: "collector-sale",
        icon: "fa-binoculars",
        label: "Purchase and set for sale",
      },
      {
        action: "remove",
        icon: "fa-times",
        label: "Decline",
        destructive: true,
      },
      {
        action: "purchase-donate",
        icon: "fa-share-square",
        label: "Purchase and donate",
        destructive: true,
      },
      {
        action: "historian",
        icon: "fa-museum",
        label: "Purchase and send to Historian",
        destructive: true,
      },
      {
        action: "archive",
        icon: "fa-archive",
        label: "Purchase and archive",
        destructive: true,
      },
    ],
    "private-auctions": [
      {
        action: "remove",
        icon: "fa-times",
        label: "Dismiss",
        destructive: true,
      },
    ],
  };
  const actions: Array<{
    action: LootBulkAction;
    destructive?: boolean;
    icon: string;
    label: string;
  }> = actionSets[category];

  return (
    <section
      aria-live="polite"
      className="collection-preview collection-bulk-panel loot-preview loot-bulk-panel"
    >
      <div className="collection-bulk-summary">
        <span className="collection-kicker">bulk selection</span>
        <h2>{itemCount.toLocaleString()} offers selected</h2>
        <dl>
          <div>
            <dt>Item count</dt>
            <dd>{itemCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total value</dt>
            <dd>${totalValue.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Purchase cost</dt>
            <dd>${purchaseCost.toLocaleString()}</dd>
          </div>
        </dl>
        <p>
          Click a thumbnail to make it the only selection. Ctrl-click or press
          and hold to add or remove offers.
        </p>
      </div>
      <div className="collection-bulk-actions">
        {actions.map(({ action, destructive, icon, label }) => {
          const actionAvailability = availability[action];
          const disabled = pending || !actionAvailability.allowed;
          const reason = pending
            ? "Another action is being processed."
            : actionAvailability.reason;
          return (
            <button
              aria-label={reason ? `${label}. Unavailable: ${reason}` : label}
              className={destructive ? "destructive" : undefined}
              disabled={disabled}
              key={action}
              onClick={() => onAction(action)}
              title={reason}
              type="button"
            >
              <i aria-hidden="true" className={`fa ${icon}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CollectionBulkActionsPanel({
  attributeScore,
  availability,
  itemCount,
  onAction,
  pending,
  totalValue,
}: {
  attributeScore: number;
  availability: Record<CollectionBulkAction, CollectionBulkAvailability>;
  itemCount: number;
  onAction: (action: CollectionBulkAction) => void;
  pending: boolean;
  totalValue: number;
}) {
  const allSelectedItemsDisplayed = availability["take-down"].allowed;
  const actions: Array<{
    action: CollectionBulkAction;
    icon: string;
    label: string;
    destructive?: boolean;
  }> = [
    allSelectedItemsDisplayed
      ? {
          action: "take-down",
          icon: "fa-picture-o",
          label: "Take down",
        }
      : { action: "display", icon: "fa-picture-o", label: "Display" },
    { action: "set-gallery", icon: "fa-th", label: "Set gallery" },
    { action: "tag", icon: "fa-tags", label: "Tag" },
    {
      action: "collector-sale",
      icon: "fa-binoculars",
      label: "Set for sale",
    },
    { action: "repair", icon: "fa-wrench", label: "Set for repair" },
    { action: "sell", icon: "fa-usd", label: "Sell", destructive: true },
    {
      action: "historian",
      icon: "fa-museum",
      label: "Send to Historian",
      destructive: true,
    },
    {
      action: "archive",
      icon: "fa-archive",
      label: "Archive",
      destructive: true,
    },
    {
      action: "donate",
      icon: "fa-share-square",
      label: "Donate",
      destructive: true,
    },
  ];

  return (
    <section
      aria-live="polite"
      className="collection-preview collection-bulk-panel"
    >
      <div className="collection-bulk-summary">
        <span className="collection-kicker">bulk selection</span>
        <h2>{itemCount.toLocaleString()} items selected</h2>
        <dl>
          <div>
            <dt>Item count</dt>
            <dd>{itemCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total value</dt>
            <dd>${totalValue.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Attribute score</dt>
            <dd>{attributeScore.toLocaleString()}</dd>
          </div>
        </dl>
        <p>
          Click a thumbnail to make it the only selection. Ctrl-click or press
          and hold to add or remove items.
        </p>
      </div>
      <div className="collection-bulk-actions">
        {actions.map(({ action, destructive, icon, label }) => {
          const actionAvailability = availability[action];
          const disabled = pending || !actionAvailability.allowed;
          const reason = pending
            ? "Another action is being processed."
            : actionAvailability.reason;
          return (
            <button
              aria-label={reason ? `${label}. Unavailable: ${reason}` : label}
              className={destructive ? "destructive" : undefined}
              disabled={disabled}
              key={action}
              onClick={() => onAction(action)}
              title={reason}
              type="button"
            >
              <i aria-hidden="true" className={`fa ${icon}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function getLootBulkState({
  availableInventorySlots,
  bankBalance,
  dealerPriceMultiplier,
  quests,
  selectedEntries,
}: {
  availableInventorySlots: number;
  bankBalance: number;
  dealerPriceMultiplier: number;
  quests: readonly ArtHistorianQuestView[];
  selectedEntries: readonly LootEntry[];
}): {
  availability: Record<LootBulkAction, CollectionBulkAvailability>;
  historianQuestByItemId: Map<string, string>;
  totalPurchaseCost: number;
} {
  const available = (): CollectionBulkAvailability => ({ allowed: true });
  const unavailable = (reason: string): CollectionBulkAvailability => ({
    allowed: false,
    reason,
  });
  const selectedItems = selectedEntries.map((entry) => entry.item);
  const privateAuctionEntry = selectedEntries.find((entry) => entry.auction);
  const purchaseRequirements = getBulkAcquisitionRequirements(
    selectedItems,
    (item) =>
      item.status === "for_sale"
        ? Math.floor(item.values.dealer * dealerPriceMultiplier)
        : 0,
  );

  let acquire = privateAuctionEntry
    ? unavailable("Private auction items must be acquired through bidding.")
    : available();
  if (
    acquire.allowed &&
    purchaseRequirements.requiredSlots > availableInventorySlots
  ) {
    acquire = unavailable(
      "Your inventory does not have room for every selected item.",
    );
  }
  if (
    acquire.allowed &&
    purchaseRequirements.totalCost > bankBalance
  ) {
    acquire = unavailable(
      "You do not have enough money to purchase every selected offer.",
    );
  }

  let archive = privateAuctionEntry
    ? unavailable("Private auction items cannot be archived.")
    : available();
  const archiveInvalid = selectedItems.find(
    (item) => item.archivePermission?.allowed !== true,
  );
  if (archive.allowed && archiveInvalid) {
    archive = unavailable(
      archiveInvalid.archivePermission?.reason ??
        `${archiveInvalid.artwork.title} cannot be archived.`,
    );
  }
  if (
    archive.allowed &&
    purchaseRequirements.totalCost > bankBalance
  ) {
    archive = unavailable(
      "You do not have enough money to purchase and archive every selected offer.",
    );
  }

  const donateInvalid = selectedEntries.find(
    (entry) =>
      entry.auction ||
      entry.item.status !== "unclaimed" ||
      entry.item.permanent,
  );
  const donate = donateInvalid
    ? unavailable(
        donateInvalid.auction
          ? "Private auction items cannot be donated."
          : donateInvalid.item.status !== "unclaimed"
            ? `${donateInvalid.item.artwork.title} is not unclaimed loot.`
            : `${donateInvalid.item.artwork.title} cannot be donated.`,
      )
    : available();

  const purchaseDonateInvalid = selectedEntries.find(
    (entry) =>
      entry.auction ||
      entry.item.status !== "for_sale" ||
      entry.item.permanent,
  );
  let purchaseDonate = purchaseDonateInvalid
    ? unavailable(
        purchaseDonateInvalid.auction
          ? "Private auction items cannot be purchased and donated."
          : purchaseDonateInvalid.item.status !== "for_sale"
            ? `${purchaseDonateInvalid.item.artwork.title} is not a dealer offer.`
            : `${purchaseDonateInvalid.item.artwork.title} cannot be donated.`,
      )
    : available();
  const purchaseDonateNeedsSlot = selectedItems.some(
    (item) => !item.original && !item.vintage,
  );
  if (
    purchaseDonate.allowed &&
    purchaseDonateNeedsSlot &&
    availableInventorySlots < 1
  ) {
    purchaseDonate = unavailable(
      "Your inventory needs one open slot to purchase and donate these offers.",
    );
  }
  if (
    purchaseDonate.allowed &&
    purchaseRequirements.totalCost > bankBalance
  ) {
    purchaseDonate = unavailable(
      "You do not have enough money to purchase every selected offer.",
    );
  }

  const removeInvalid = selectedEntries.find(
    (entry) =>
      !entry.auction &&
      entry.item.status === "unclaimed" &&
      entry.item.permanent,
  );
  const remove = removeInvalid
    ? unavailable(`${removeInvalid.item.artwork.title} cannot be sold.`)
    : available();

  let historian = privateAuctionEntry
    ? unavailable("Private auction items cannot be sent to the Historian.")
    : available();
  const historianAssignment = assignHistorianQuests(
    selectedItems,
    quests,
    ["unclaimed", "for_sale"],
    "must be an unclaimed item or dealer offer before it can be acquired and sent",
  );
  if (historian.allowed && historianAssignment.reason) {
    historian = unavailable(historianAssignment.reason);
  }
  const historianNeedsInventorySlot = selectedItems.some(
    (item) => !item.original && !item.vintage,
  );
  if (
    historian.allowed &&
    historianNeedsInventorySlot &&
    availableInventorySlots < 1
  ) {
    historian = unavailable(
      "Your inventory needs one open slot to acquire and send these items.",
    );
  }
  if (
    historian.allowed &&
    purchaseRequirements.totalCost > bankBalance
  ) {
    historian = unavailable(
      "You do not have enough money to purchase every selected Historian item.",
    );
  }

  return {
    availability: {
      archive,
      acquire,
      donate,
      remove,
      historian,
      "purchase-donate": purchaseDonate,
      "collector-sale": acquire,
    },
    historianQuestByItemId: historianAssignment.questByItemId,
    totalPurchaseCost: purchaseRequirements.totalCost,
  };
}

function getCollectionBulkState({
  collectionItems,
  displayCap,
  quests,
  repairingCap,
  repairingCount,
  selectedItems,
}: {
  collectionItems: readonly HydratedGameItem[];
  displayCap: number;
  quests: readonly ArtHistorianQuestView[];
  repairingCap: number;
  repairingCount: number;
  selectedItems: readonly HydratedGameItem[];
}): {
  availability: Record<CollectionBulkAction, CollectionBulkAvailability>;
  historianQuestByItemId: Map<string, string>;
} {
  const available = (): CollectionBulkAvailability => ({ allowed: true });
  const unavailable = (reason: string): CollectionBulkAvailability => ({
    allowed: false,
    reason,
  });
  const selectedIds = new Set(selectedItems.map((item) => item._id));
  const duplicateArtworkId = selectedItems.find(
    (item, index) =>
      selectedItems.findIndex(
        (candidate) => candidate.artwork_id === item.artwork_id,
      ) !== index,
  )?.artwork_id;

  let display = available();
  const nonDisplayable = selectedItems.find(
    (item) => item.status !== "claimed" && item.status !== "displayed",
  );
  if (nonDisplayable) {
    display = unavailable("Auctioned items cannot be displayed.");
  } else {
    const repairing = selectedItems.find(
      (item) => item.status === "claimed" && item.repairing,
    );
    if (repairing) {
      display = unavailable(
        `${repairing.artwork.title} is currently being repaired.`,
      );
    } else if (duplicateArtworkId) {
      display = unavailable(
        "The gallery cannot display two copies of the same artwork.",
      );
    } else {
      const conflictingItem = selectedItems
        .filter((item) => item.status === "claimed")
        .find((item) =>
          collectionItems.some(
            (candidate) =>
              !selectedIds.has(candidate._id) &&
              candidate.artwork_id === item.artwork_id &&
              (candidate.status === "displayed" || candidate.permanent),
          ),
        );
      if (conflictingItem) {
        display = unavailable(
          `${conflictingItem.artwork.title} is already represented on display.`,
        );
      } else {
        const displayedCount = collectionItems.filter(
          (item) => item.status === "displayed",
        ).length;
        const additions = selectedItems.filter(
          (item) => item.status === "claimed",
        ).length;
        if (displayedCount + additions > displayCap) {
          display = unavailable(
            `Displaying this selection would exceed the ${displayCap}-item gallery limit.`,
          );
        }
      }
    }
  }

  const galleryPlan = planGallerySelection(
    selectedItems,
    collectionItems,
    displayCap,
  );
  const setGallery = galleryPlan.ok
    ? available()
    : unavailable(galleryPlan.reason);
  const takeDown = selectedItems.every(
    (item) => item.status === "displayed",
  )
    ? available()
    : unavailable("Every selected item must currently be on display.");

  const sellInvalid = selectedItems.find(
    (item) =>
      item.status !== "claimed" || item.permanent,
  );
  const sell = sellInvalid
    ? unavailable(
        sellInvalid.status !== "claimed"
          ? `${sellInvalid.artwork.title} must be taken down or removed from auction first.`
          : `${sellInvalid.artwork.title} cannot be sold.`,
      )
    : available();

  const donateInvalid = selectedItems.find(
    (item) =>
      item.status !== "claimed" || item.permanent,
  );
  const donate = donateInvalid
    ? unavailable(
        donateInvalid.status !== "claimed"
          ? `${donateInvalid.artwork.title} must be taken down or removed from auction first.`
          : `${donateInvalid.artwork.title} cannot be donated.`,
      )
    : available();

  const collectorSaleInvalid = selectedItems.find(
    (item) =>
      item.status !== "claimed" || item.tags.includes("for sale"),
  );
  const collectorSale = collectorSaleInvalid
    ? unavailable(
        collectorSaleInvalid.status !== "claimed"
          ? `${collectorSaleInvalid.artwork.title} must be in inventory before it can be offered.`
          : `${collectorSaleInvalid.artwork.title} is already offered to Art Collectors.`,
      )
    : available();

  const repairInvalid = selectedItems.find(
    (item) =>
      item.status !== "claimed" || item.repairing || item.condition >= 1,
  );
  let repair = repairInvalid
    ? unavailable(
        repairInvalid.status !== "claimed"
          ? `${repairInvalid.artwork.title} must be in inventory before it can be repaired.`
          : repairInvalid.repairing
            ? `${repairInvalid.artwork.title} is already set for repair.`
            : `${repairInvalid.artwork.title} is already at 100% condition.`,
      )
    : available();
  if (
    repair.allowed &&
    repairingCount + selectedItems.length > repairingCap
  ) {
    repair = unavailable(
      `This selection would exceed the ${repairingCap}-item repair limit.`,
    );
  }

  let archive = available();
  if (duplicateArtworkId) {
    archive = unavailable(
      "Bulk archive supports only one copy of each artwork.",
    );
  } else {
    const archiveInvalid = selectedItems.find((item) => {
      if (item.status !== "claimed") return true;
      const permission =
        item.archivePermission ??
        getArchivePermission(
          item,
          item.archivedCategories ?? [],
          item.archivedArtStyles ?? [],
        );
      return !permission.allowed;
    });
    if (archiveInvalid) {
      const permission =
        archiveInvalid.archivePermission ??
        getArchivePermission(
          archiveInvalid,
          archiveInvalid.archivedCategories ?? [],
          archiveInvalid.archivedArtStyles ?? [],
        );
      archive = unavailable(
        archiveInvalid.status !== "claimed"
          ? `${archiveInvalid.artwork.title} must be in inventory before archiving.`
          : permission.allowed
            ? `${archiveInvalid.artwork.title} cannot be archived.`
            : permission.reason,
      );
    }
  }

  const historianAssignment = assignHistorianQuests(selectedItems, quests);

  return {
    availability: {
      display,
      "take-down": takeDown,
      "set-gallery": setGallery,
      tag: available(),
      "collector-sale": collectorSale,
      repair,
      sell,
      historian: historianAssignment.reason
        ? unavailable(historianAssignment.reason)
        : available(),
      archive,
      donate,
    },
    historianQuestByItemId: historianAssignment.questByItemId,
  };
}

function assignHistorianQuests(
  items: readonly HydratedGameItem[],
  quests: readonly ArtHistorianQuestView[],
  allowedStatuses: readonly GameItem["status"][] = ["claimed", "displayed"],
  statusDescription = "must be in your collection before it can be sent",
): { questByItemId: Map<string, string>; reason?: string } {
  const questByItemId = new Map<string, string>();
  const reservedTargets = new Set<string>();

  for (const item of items) {
    if (!allowedStatuses.includes(item.status)) {
      return {
        questByItemId,
        reason: `${item.artwork.title} ${statusDescription}.`,
      };
    }
    if (item.permanent) {
      return {
        questByItemId,
        reason: `${item.artwork.title} cannot be sent to the Historian.`,
      };
    }
    if (item.repairing) {
      return {
        questByItemId,
        reason: `Stop repairing ${item.artwork.title} before sending it.`,
      };
    }

    const quest = quests.find((candidate) => {
      const key = `${candidate._id}:${item.artwork_id}`;
      return (
        !reservedTargets.has(key) &&
        getUnfulfilledHistorianTargetIds(candidate).includes(item.artwork_id)
      );
    });
    if (!quest) {
      return {
        questByItemId,
        reason: `${item.artwork.title} does not have an available Historian quest target.`,
      };
    }
    reservedTargets.add(`${quest._id}:${item.artwork_id}`);
    questByItemId.set(item._id, quest._id);
  }

  return { questByItemId };
}

function getLootBulkConfirmationCopy(
  action: LootDestructiveBulkAction,
  items: readonly HydratedGameItem[],
): {
  actionLabel: string;
  confirmLabel: string;
  description: string;
} {
  const highRarityCount = items.filter(
    (item) =>
      item.artwork.rarity === "legendary" ||
      item.artwork.rarity === "masterpiece",
  ).length;
  const highRarityWarning =
    highRarityCount > 0
      ? ` Are you sure? ${highRarityCount} selected ${highRarityCount === 1 ? "item is" : "items are"} Legendary or Masterpiece rarity.`
      : "";

  switch (action) {
    case "archive":
      return {
        actionLabel: "Archive",
        confirmLabel: "Archive selected",
        description:
          `Every selected item will be permanently removed after its new modifiers, art style, and value are added to the archive. Dealer offers will be purchased first.${highRarityWarning}`,
      };
    case "donate":
      return {
        actionLabel: "Donate",
        confirmLabel: "Donate selected",
        description:
          `Every selected unclaimed item will be permanently removed in exchange for Karma and any recoverable art styles.${highRarityWarning}`,
      };
    case "remove":
      return {
        actionLabel: "Remove",
        confirmLabel: "Process selected",
        description:
          `Unclaimed items will be sold, dealer offers will be declined, and private auctions will be dismissed.${highRarityWarning}`,
      };
    case "historian":
      return {
        actionLabel: "Send",
        confirmLabel: "Send selected",
        description:
          `Each selected item will be collected or purchased, then permanently sent to one available Art Historian quest target.${highRarityWarning}`,
      };
    case "purchase-donate":
      return {
        actionLabel: "Purchase and donate",
        confirmLabel: "Purchase and donate selected",
        description:
          `Each selected dealer offer will be purchased, then permanently donated for Karma and any recoverable art styles.${highRarityWarning}`,
      };
  }
}

function getLootBulkSuccessMessage(
  action: LootBulkAction,
  itemCount: number,
  totalMoney: number,
  totalKarma: number,
): string {
  switch (action) {
    case "archive":
      return `Archived ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"}.`;
    case "acquire":
      return `Collected or purchased ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"}.`;
    case "donate":
      return `Donated ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} for ${totalKarma.toLocaleString()} Karma.`;
    case "remove":
      return `Processed ${itemCount} selected ${itemCount === 1 ? "offer" : "offers"}${totalMoney > 0 ? ` for $${totalMoney.toLocaleString()}` : ""}.`;
    case "historian":
      return `Sent ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} to the Art Historian.`;
    case "purchase-donate":
      return `Purchased and donated ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} for ${totalKarma.toLocaleString()} Karma.`;
    case "collector-sale":
      return `Collected or purchased ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} and offered them to Art Collectors.`;
  }
}

function isDestructiveLootBulkAction(
  action: LootBulkAction,
): action is LootDestructiveBulkAction {
  return [
    "archive",
    "donate",
    "remove",
    "historian",
    "purchase-donate",
  ].includes(action);
}

function getCollectionBulkConfirmationCopy(
  action: CollectionDestructiveBulkAction,
  items: readonly HydratedGameItem[],
): {
  actionLabel: string;
  confirmLabel: string;
  description: string;
  destructive: boolean;
} {
  const highRarityCount = items.filter(
    (item) =>
      item.artwork.rarity === "legendary" ||
      item.artwork.rarity === "masterpiece",
  ).length;
  const highRarityWarning =
    highRarityCount > 0
      ? ` Are you sure? ${highRarityCount} selected ${highRarityCount === 1 ? "item is" : "items are"} Legendary or Masterpiece rarity.`
      : "";

  switch (action) {
    case "sell":
      return {
        actionLabel: "Sell",
        confirmLabel: "Sell selected",
        description:
          `Selling permanently removes every selected item from your collection in exchange for its current sell value.${highRarityWarning}`,
        destructive: true,
      };
    case "historian":
      return {
        actionLabel: "Send",
        confirmLabel: "Send selected",
        description:
          `Each selected item will permanently leave your collection and fulfill one available Art Historian quest target.${highRarityWarning}`,
        destructive: true,
      };
    case "archive":
      return {
        actionLabel: "Archive",
        confirmLabel: "Archive selected",
        description:
          `Archiving permanently removes every selected item after adding its new modifiers, art style, and value to the archive.${highRarityWarning}`,
        destructive: true,
      };
    case "donate":
      return {
        actionLabel: "Donate",
        confirmLabel: "Donate selected",
        description:
          `Donating permanently removes every selected item in exchange for Karma and any recoverable art styles.${highRarityWarning}`,
        destructive: true,
      };
  }
}

function getCollectionBulkSuccessMessage(
  action: Exclude<CollectionBulkAction, "set-gallery" | "tag">,
  itemCount: number,
  totalMoney: number,
  totalKarma: number,
): string {
  switch (action) {
    case "display":
      return `Displayed ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"}.`;
    case "take-down":
      return `Took down ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"}.`;
    case "collector-sale":
      return `Set ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} for sale to Art Collectors.`;
    case "repair":
      return `Set ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} for repair.`;
    case "sell":
      return `Sold ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} for $${totalMoney.toLocaleString()}.`;
    case "historian":
      return `Sent ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} to the Art Historian.`;
    case "archive":
      return `Archived ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"}.`;
    case "donate":
      return `Donated ${itemCount} selected ${itemCount === 1 ? "artwork" : "artworks"} for ${totalKarma.toLocaleString()} Karma.`;
  }
}

function isDestructiveCollectionBulkAction(
  action: CollectionBulkAction,
): action is CollectionDestructiveBulkAction {
  return ["sell", "historian", "archive", "donate"].includes(action);
}

function isActionDialogResult(value: unknown): value is ActionDialogResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActionDialogResult>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.message === "string" &&
    ["authenticated", "destroyed", "returned", "mixed"].includes(
      candidate.variant ?? "",
    )
  );
}

function InventorySortOptions() {
  return (
    <>
      <option value="newest">Acquired: newest first</option>
      <option value="oldest">Acquired: oldest first</option>
      <option value="value-high">Value: high to low</option>
      <option value="value-low">Value: low to high</option>
      <option value="title">Title: A to Z</option>
      <option value="title-desc">Title: Z to A</option>
      <option value="artwork-newest">Artwork date: newest first</option>
      <option value="artwork-oldest">Artwork date: oldest first</option>
      <option value="artist">Artist: A to Z</option>
      <option value="artist-desc">Artist: Z to A</option>
      <option value="rarity">Rarity: highest first</option>
      <option value="rarity-low">Rarity: lowest first</option>
      <option value="condition">Condition: highest first</option>
      <option value="condition-low">Condition: lowest first</option>
      <option value="level-high">Promotion level: highest first</option>
      <option value="level-low">Promotion level: lowest first</option>
    </>
  );
}

function ArchiveSortOptions() {
  return (
    <>
      <option value="newest">Archived: newest first</option>
      <option value="oldest">Archived: oldest first</option>
      <option value="value-high">Archived value: high to low</option>
      <option value="value-low">Archived value: low to high</option>
      <option value="progress-high">Progress: highest first</option>
      <option value="progress-low">Progress: lowest first</option>
      <option value="count-high">Works archived: high to low</option>
      <option value="count-low">Works archived: low to high</option>
      <option value="title">Title: A to Z</option>
      <option value="title-desc">Title: Z to A</option>
      <option value="artist">Artist: A to Z</option>
      <option value="artist-desc">Artist: Z to A</option>
      <option value="rarity">Rarity: highest first</option>
      <option value="rarity-low">Rarity: lowest first</option>
      <option value="artwork-newest">Artwork date: newest first</option>
      <option value="artwork-oldest">Artwork date: oldest first</option>
    </>
  );
}

const ARCHIVE_FILTER_LABELS: Record<ArchiveFilterCategory, string> = {
  mint: "Mint",
  foil: "Foil",
  unlocked: "Unlocked",
  seasonal: "Seasonal",
  vintage: "Vintage",
  lottery: "Lottery",
};

const COLLECTION_FLAG_LABELS: Record<CollectionFlagKey, string> = {
  repairing: "Repairing",
  "for-sale": "For sale",
  foil: "Foil",
  unlocked: "Unlocked",
  seasonal: "Seasonal",
  lottery: "Lottery",
  original: "Original",
  vintage: "Vintage",
  forgery: "Known forgery",
};

function CollectionInventoryControls({
  artStyleOptions,
  attributeOptions,
  filters,
  matchCount,
  onFiltersChange,
  onSortChange,
  sort,
  specialAttributeOptions,
  tags,
  totalCount,
}: {
  artStyleOptions: CollectionAttributeOption[];
  attributeOptions: CollectionAttributeOption[];
  filters: CollectionFilters;
  matchCount: number;
  onFiltersChange: (filters: CollectionFilters) => void;
  onSortChange: (sort: InventorySort) => void;
  sort: InventorySort;
  specialAttributeOptions: CollectionAttributeOption[];
  tags: string[];
  totalCount: number;
}) {
  function update(patch: Partial<CollectionFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  function toggleStatus(status: CollectionStatus) {
    update({
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((candidate) => candidate !== status)
        : [...filters.statuses, status],
    });
  }

  function toggleRarity(rarity: ArtworkRarity) {
    update({
      rarities: filters.rarities.includes(rarity)
        ? filters.rarities.filter((candidate) => candidate !== rarity)
        : [...filters.rarities, rarity],
    });
  }

  function toggleAttribute(
    key: "attributeIds" | "specialAttributeIds",
    minimumKey: "attributeMinimum" | "specialAttributeMinimum",
    id: string,
  ) {
    const current = filters[key];
    const next = current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id];
    update({
      [key]: next,
      [minimumKey]: Math.min(filters[minimumKey], Math.max(1, next.length)),
    });
  }

  return (
    <div className="collection-inventory-controls">
      <label className="collection-search-control">
        <span>Search inventory</span>
        <input
          onChange={(event) => update({ search: event.target.value })}
          placeholder="Title or artist, #tag, *new, *dupes"
          type="search"
          value={filters.search}
        />
        <small>
          Separate terms with commas. Use #tag, *new, or *dupes.
        </small>
      </label>
      <div className="collection-control-row">
        <label>
          <span>Sort</span>
          <select
            onChange={(event) =>
              onSortChange(event.target.value as InventorySort)
            }
            value={sort}
          >
            <InventorySortOptions />
          </select>
        </label>
        <label>
          <span>Tag</span>
          <select
            onChange={(event) => update({ tag: event.target.value })}
            value={filters.tag}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="collection-filter-details">
        <summary>
          Filters
          <span>
            {matchCount}/{totalCount}
          </span>
        </summary>
        <div className="collection-filter-content">
          <div className="collection-filter-pair">
            <fieldset>
              <legend>Status</legend>
              <div className="collection-filter-checks">
                {COLLECTION_STATUSES.map((status) => (
                  <label key={status}>
                    <input
                      checked={filters.statuses.includes(status)}
                      onChange={() => toggleStatus(status)}
                      type="checkbox"
                    />
                    <span>
                      {status === "claimed"
                        ? "Inventory"
                        : status === "displayed"
                          ? "On display"
                          : "Auctioned"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Rarity</legend>
              <div className="collection-filter-checks">
                {ARTWORK_RARITIES.map((rarity) => (
                  <label
                    className="collection-rarity-filter"
                    data-rarity={rarity}
                    key={rarity}
                  >
                    <input
                      checked={filters.rarities.includes(rarity)}
                      onChange={() => toggleRarity(rarity)}
                      type="checkbox"
                    />
                    <span>{rarity}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <fieldset className="collection-art-style-filter">
            <label>
              <span>Applied style</span>
              <select
                onChange={(event) => update({ artStyle: event.target.value })}
                value={filters.artStyle}
              >
                <option value="">All art styles</option>
                {artStyleOptions.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend>Properties</legend>
            <div className="collection-flag-filters">
              {COLLECTION_FLAG_KEYS.map((key) => (
                <label key={key}>
                  <span>{COLLECTION_FLAG_LABELS[key]}</span>
                  <select
                    onChange={(event) =>
                      update({
                        flags: {
                          ...filters.flags,
                          [key]: event.target.value as CollectionFlagMode,
                        },
                      })
                    }
                    value={filters.flags[key]}
                  >
                    <option value="any">Any</option>
                    <option value="only">Only</option>
                    <option value="exclude">Exclude</option>
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="collection-attribute-filter-row">
            {attributeOptions.length > 0 ? (
              <CollectionAttributeFilters
                label="Attributes"
                minimum={filters.attributeMinimum}
                onMinimumChange={(attributeMinimum) =>
                  update({ attributeMinimum })
                }
                onToggle={(id) =>
                  toggleAttribute("attributeIds", "attributeMinimum", id)
                }
                options={attributeOptions}
                selectedIds={filters.attributeIds}
                thresholdLimit={4}
              />
            ) : null}
            {specialAttributeOptions.length > 0 ? (
              <CollectionAttributeFilters
                className="collection-special-attributes"
                label="Special attributes"
                minimum={filters.specialAttributeMinimum}
                onMinimumChange={(specialAttributeMinimum) =>
                  update({ specialAttributeMinimum })
                }
                onToggle={(id) =>
                  toggleAttribute(
                    "specialAttributeIds",
                    "specialAttributeMinimum",
                    id,
                  )
                }
                options={specialAttributeOptions}
                selectedIds={filters.specialAttributeIds}
                thresholdLimit={3}
              />
            ) : null}
          </div>
          <button
            className="collection-clear-filters"
            onClick={() => onFiltersChange(getDefaultCollectionFilters())}
            type="button"
          >
            Clear filters
          </button>
        </div>
      </details>
    </div>
  );
}

function CollectionAttributeFilters({
  className,
  label,
  minimum,
  onMinimumChange,
  onToggle,
  options,
  selectedIds,
  thresholdLimit,
}: {
  className?: string;
  label: string;
  minimum: number;
  onMinimumChange: (minimum: number) => void;
  onToggle: (id: string) => void;
  options: CollectionAttributeOption[];
  selectedIds: string[];
  thresholdLimit: number;
}) {
  const maximum = Math.min(thresholdLimit, Math.max(1, selectedIds.length));
  return (
    <fieldset className={className}>
      <legend>{label}</legend>
      <label className="collection-attribute-minimum">
        <span>Require at least</span>
        <select
          disabled={selectedIds.length === 0}
          onChange={(event) => onMinimumChange(Number(event.target.value))}
          value={Math.min(minimum, maximum)}
        >
          {Array.from({ length: maximum }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <div className="collection-attribute-filters">
        {options.map((option) => (
          <label key={option.id}>
            <input
              checked={selectedIds.includes(option.id)}
              onChange={() => onToggle(option.id)}
              type="checkbox"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DonationRewardEffect({
  effect,
}: {
  effect: { animationId: number; recoveredStyle: boolean };
}) {
  return (
    <span
      aria-label={
        effect.recoveredStyle
          ? "Karma and an art style recovered"
          : "Karma gained"
      }
      className="donation-reward-effect"
      key={effect.animationId}
      role="status"
    >
      <i aria-hidden="true" className="fa fa-spa karma" />
      {effect.recoveredStyle ? (
        <i aria-hidden="true" className="fa fa-paint-brush art-style" />
      ) : null}
    </span>
  );
}

function getItemCardKey(item: HydratedGameItem): string {
  return `${item._id}:${JSON.stringify(item)}`;
}

function CrateCardArtwork({
  quality,
}: {
  quality: LootCrateOffer["quality"];
}) {
  return (
    <span aria-hidden="true" className="crate-card-artwork">
      <span className="crate-card-glow" />
      <span className="crate-card-lid" />
      <span className="crate-card-box">
        <i className={quality === "daily" ? "fa fa-gift" : "fa fa-cube"} />
      </span>
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

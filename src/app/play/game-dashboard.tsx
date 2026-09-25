"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";

import ArchiveEntryDialog from "@/components/archive-entry-dialog";
import ForgeryDialog from "@/components/forgery-dialog";
import ArtworkThumbnail from "@/components/artwork-thumbnail";
import ItemThumbnail from "@/components/item-thumbnail";
import HallOfFamePanel from "@/components/hall-of-fame-panel";
import RafflePanel, {
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
import type { CardStyleInventory } from "@/components/item-cards/catalog";
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
import type { CrateOfferView } from "@/server/crate-gameplay";
import { getArchivePropertyProgress } from "@/server/archive-gameplay";
import {
  type BulkSaleProtections,
  shouldPreserveBulkSaleItem,
} from "@/server/bulk-sale";
import type { ArtHistorianQuestView } from "@/server/art-historian-gameplay";
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
  NPC_QUALITIES,
  type NpcQuality,
} from "@/server/npc-gameplay";
import type { NpcRewardInteraction } from "@/server/standard-npc-rewards";
import type {
  InventorySort,
  PlayerViewSettings,
} from "@/server/player-view-settings";

import AuctionHouse, { AuctionBidDialog } from "./auctions/auction-house";
import type { AuctionView } from "@/server/auction-gameplay";
import GalleryExplorer, {
  GalleryAttributeSummary,
  GalleryRaritySummary,
  type GalleryNpcView,
} from "./galleries/gallery-explorer";
import GalleryChat from "./galleries/gallery-chat";
import type { GalleryMetadataSnapshot } from "@/server/gallery-metadata-core";
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
  npcsMet: Partial<Record<NpcQuality, number>>;
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
  canRerollDisplayed,
  levelUpDiscountAvailable,
  levelUpConditionMinimum,
  legendaryAttributes,
  npcSpawnOptions,
  npcSpawnIntervalMinutes,
  crateOffers,
  raffle,
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
  hallOfFameRecords?: HallOfFameDisplayRecord[];
  playthroughSnapshots?: PlaythroughSnapshot[];
  vintageConsiderationCount?: number;
}) {
  const router = useRouter();
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
    | "raffle"
    | "history"
  >(
    initialGalleryId
      ? "explore"
      : initialSection === "history"
        ? "history"
        : initialSection === "raffle"
          ? "raffle"
          : initialSection === "auctions"
            ? "auctions"
      : items.some((item) => item.status === "unclaimed")
        ? "loot"
        : "profile",
  );
  const [exploreResetKey, setExploreResetKey] = useState(0);
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
  const [npcSpawnQuality, setNpcSpawnQuality] =
    useState<NpcQuality>("bronze");
  const [spawningNpc, setSpawningNpc] = useState<string | null>(null);
  const [meetingNpc, setMeetingNpc] = useState<string | null>(null);
  const [auctioneerSession, setAuctioneerSession] = useState<{
    npcName: string;
    quality: NpcQuality;
    auctions: AuctionView[];
  } | null>(null);
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
  const [selectedCollectionItemId, setSelectedCollectionItemId] = useState<
    string | null
  >(null);
  const [selectedLootItemId, setSelectedLootItemId] = useState<string | null>(
    null,
  );
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveRarity, setArchiveRarity] = useState<
    ArtworkRarity | "all"
  >("all");
  const [archiveCompletion, setArchiveCompletion] = useState<
    "all" | "complete" | "incomplete"
  >("all");
  const [bulkSaleProtections, setBulkSaleProtections] =
    useState<BulkSaleProtections>(player.viewSettings.bulkSaleProtections);
  const [inventorySort, setInventorySort] = useState<InventorySort>(
    player.viewSettings.inventorySort,
  );
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
  const [forgeryArchive, setForgeryArchive] =
    useState<HydratedPlayerArtworkArchive | null>(null);
  const [vintageDialogOpen, setVintageDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    markVisitorMet,
    removeVisitor,
    refreshVisitors,
    visitors: galleryVisitors,
  } = useGalleryVisitors({
    enabled: section === "collection" || section === "gallery",
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
  const selectedLootItem =
    unclaimed.find((item) => item._id === selectedLootItemId) ??
    unclaimed[0] ??
    null;
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
  const questTargetArtworkIds = useMemo(
    () => new Set(quests.flatMap((quest) => quest.target)),
    [quests],
  );
  const bulkSellableLoot = useMemo(
    () =>
      unclaimed.filter(
        (item) =>
          item.status === "unclaimed" &&
          !item.permanent &&
          !item.original &&
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
          !item.original &&
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
  const hasClaimableLoot = unclaimed.some(
    (item) => item.status === "unclaimed",
  );
  const hasPurchasableLoot = unclaimed.some(
    (item) => item.status === "for_sale",
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
  const filteredArchiveEntries = useMemo(() => {
    const search = archiveSearch.trim().toLocaleLowerCase();
    return archiveEntries.filter(({ archive, complete }) => {
      if (
        search &&
        !archive.artwork.title.toLocaleLowerCase().includes(search) &&
        !archive.artwork.artist.toLocaleLowerCase().includes(search)
      ) {
        return false;
      }
      if (
        archiveRarity !== "all" &&
        archive.artwork.rarity !== archiveRarity
      ) {
        return false;
      }
      return (
        archiveCompletion === "all" ||
        (archiveCompletion === "complete" && complete) ||
        (archiveCompletion === "incomplete" && !complete)
      );
    });
  }, [archiveCompletion, archiveEntries, archiveRarity, archiveSearch]);
  const selectedCollectionItem =
    collectionItems.find((item) => item._id === selectedCollectionItemId) ??
    collectionItems[0] ??
    null;
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

  function historianQuestsForItem(item: HydratedGameItem) {
    return quests.filter((quest) =>
      quest.targets.some(
        (target) =>
          target.artwork._id === item.artwork_id && !target.fulfilled,
      ),
    );
  }

  function historianSubmissionDisabledReason(
    item: HydratedGameItem,
    matchingQuestCount: number,
  ) {
    if (item.permanent || item.original) {
      return "Original and permanent artwork cannot be sent to the Historian.";
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
        setError(body.error ?? "The dealer offers could not be declined.");
        return;
      }
      setNotice(body.message ?? "Dealer offers declined.");
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
      setSelectedLootItemId(body.item_ids?.[0] ?? null);
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
    if (!item.mint) {
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
      setNotice(message);
      router.refresh();
    } catch (spawnError) {
      const message =
        spawnError instanceof Error
          ? spawnError.message
          : "The NPC could not be spawned.";
      setError(message);
    } finally {
      setSpawningNpc(null);
    }
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
        body.interaction?.type === "auctioneer-access" &&
        body.interaction.auctions &&
        body.interaction.auctions.length > 0
      ) {
        setAuctioneerSession({
          npcName: body.interaction.npcName,
          quality: body.interaction.quality,
          auctions: body.interaction.auctions,
        });
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
      removeVisitor(npc._id);
      void refreshVisitors();
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
                karma: karmaBalance,
              })
            }
          />
        ) : null}
        <ItemActionButton
          icon="fa-museum"
          label="Send to Historian"
          disabled={pending || Boolean(historianDisabledReason)}
          disabledReason={historianDisabledReason}
          onClick={() => requestHistorianSubmission(item)}
        />
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
                setSelectedCollectionItemId(nextInventoryItem?._id ?? null),
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
        <ItemActionButton
          disabled
          disabledReason={inventoryOnlyReason}
          gridSlot={9}
          icon="fa-share-square"
          label="Donate for Karma"
          onClick={() => undefined}
        />
        <ItemActionButton
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
            icon="fa-times"
            label="Decline dealer offer"
            disabled={pending}
            onClick={() => act(`/api/play/items/${item._id}/decline`)}
          />
          {archiveAction(item)}
          <ItemActionButton
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
          icon="fa-usd"
          label={`Sell immediately for $${item.values.sell.toLocaleString()}`}
          disabled={pending}
          onClick={() => requestItemRemoval(item, "sell")}
        />
        <ItemActionButton
          icon="fa-share-square"
          label="Donate for Karma"
          disabled={pending || item.permanent || item.original}
          onClick={() => requestItemRemoval(item, "donate")}
        />
        <ItemActionButton
          icon="fa-times"
          label="Decline and remove from game"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/decline`)}
        />
        <ItemActionButton
          icon="fa-binoculars"
          label="Collect and set for sale"
          disabled={pending}
          onClick={() => act(`/api/play/items/${item._id}/claim-and-set-for-sale`)}
        />
        {archiveAction(item)}
        <ItemActionButton
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
          gridSlot={3}
          icon="fa-usd"
          label={`Sell for $${item.values.sell.toLocaleString()}`}
          disabled={pending}
          onClick={() => requestItemRemoval(item, "sell")}
        />
        {archiveAction(item, 6)}
        <ItemActionButton
          gridSlot={9}
          icon="fa-share-square"
          label="Donate for Karma"
          disabled={pending || item.permanent || item.original}
          onClick={() => requestItemRemoval(item, "donate")}
        />
        <AuthenticityActions
          act={act}
          gridSlot={7}
          item={item}
          pending={pending}
        />
        <ItemActionButton
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

  return (
    <main className="legacy-game">
      <div className="max-w-[1280px] m-auto">
        <nav className="dashboard-tabs" aria-label="Player dashboard">
          {(
            [
              { id: "profile", label: "Profile", icon: "fa-user" },
              { id: "collection", label: "Collection", icon: "fa-picture-o" },
              { id: "loot", label: "crates", icon: "fa-gift" },
              { id: "explore", label: "Explore", icon: "fa-binoculars" },
              { id: "archive", label: "Archive", icon: "fa-archive" },
              { id: "quests", label: "Quests", icon: "fa-map-signs" },
              { id: "auctions", label: "Auction House", icon: "fa-gavel" },
              { id: "raffle", label: "Lottery", icon: "fa-ticket" },
              { id: "history", label: "History", icon: "fa-history" },
            ] as const
          ).map((tab) => (
            <button
              className={section === tab.id ? "current" : ""}
              key={tab.id}
              onClick={() => {
                if (tab.id === "explore") {
                  setExploreResetKey((current) => current + 1);
                  router.replace("/play?section=explore", { scroll: false });
                }
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
          <section className="player-profile-layout">
            <div className="profile-sidebar">
              <GalleryChat global viewerId={playerId} />
              <GalleryChat galleryOwnerId={playerId} viewerId={playerId} />
            </div>
            <section className="player-profile">
              <header className="museum-profile-heading">
              <div>
                <p>Artfunkel collection registry</p>
                <h2>
                  {player.screenName}
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
                        className="vintage-runback-button"
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
                </h2>
                <span>Private collection and activity record</span>
              </div>
              <strong>Level {player.level.toString()}</strong>
            </header>

            <div className="museum-profile-progress">
              <div>
                <span>
                  {player.isMaxLevel
                    ? "Next lottery ticket"
                    : "Experience"}
                </span>
                <strong>
                  {player.xp.toLocaleString()} /{" "}
                  {player.xpGoal.toLocaleString()} XP
                </strong>
              </div>
              <ProgressBar value={player.xp} goal={player.xpGoal} maxed={player.isMaxLevel}  />
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
                  value={player.raffleTickets.toLocaleString()}
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

              <section className="museum-profile-karma">
                <header>
                  <span>Good Karma</span>
                  <small>Earned by donating artwork and being kind. Used to level up items.</small>
                </header>
                <div className="karma-balance">
                  <i aria-hidden="true" className="fa fa-spa" />
                  <div>
                    <strong>{karmaBalance.toLocaleString()}</strong>
                  </div>
                </div>
              </section>
            </section>
            <aside className="profile-gallery-panel">
              <header>
                <div>
                  <span>On display</span>
                  <small>
                    {displayed.length} / {player.displayCap} works
                  </small>
                </div>
                <i aria-hidden="true" className="fa fa-picture-o" />
              </header>
              {displayed.length > 0 ? (
                <>
                  <div className="profile-gallery-thumbnails">
                    {displayed.slice(0, 8).map((item) => (
                      <button
                        aria-label={`View ${item.artwork.title} by ${item.artwork.artist}`}
                        key={item._id}
                        onClick={() => {
                          setSelectedCollectionItemId(item._id);
                          setSection("collection");
                        }}
                        title={`${item.artwork.title} by ${item.artwork.artist}`}
                        type="button"
                      >
                        <ItemThumbnail
                          alt=""
                          item={item}
                          researchTarget={questTargetArtworkIds.has(
                            item.artwork_id,
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  {displayed.length > 8 ? (
                    <p>+{displayed.length - 8} additional works on display</p>
                  ) : null}
                  <button
                    className="profile-gallery-action"
                    onClick={() => setSection("collection")}
                    type="button"
                  >
                    Manage gallery
                  </button>
                </>
              ) : inventory.some((item) => item.status === "claimed") ? (
                <div className="profile-gallery-empty">
                  <i aria-hidden="true" className="fa fa-picture-o" />
                  <p>
                    Your walls are waiting. Put some of your collected works on
                    display.
                  </p>
                  <button
                    className="profile-gallery-action"
                    onClick={() => setSection("collection")}
                    type="button"
                  >
                    Manage gallery
                  </button>
                </div>
              ) : (
                <div className="profile-gallery-empty">
                  <i aria-hidden="true" className="fa fa-gift" />
                  <p>
                    Start collecting artwork before curating your first
                    exhibition.
                  </p>
                  <button
                    className="profile-gallery-action"
                    onClick={() => setSection("loot")}
                    type="button"
                  >
                    Go to crates section
                  </button>
                </div>
              )}
              {galleryMetadata ? (
                <GalleryMetadataPanel
                  galleryMetadata={galleryMetadata}
                  galleryRates={galleryRates}
                />
              ) : null}
            </aside>
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
              <section className="loot-items-panel">
                {unclaimed.length > 0 && selectedLootItem ? (
                  <div className="loot-items-content">
                    <div className="collection-thumbnail-list loot-thumbnail-grid">
                      {unclaimed.map((item) => {
                        const revealIndex = revealedLootIds.indexOf(item._id);
                        return (
                          <button
                            aria-label={`Preview ${item.artwork.title} by ${item.artwork.artist}`}
                            aria-pressed={selectedLootItem._id === item._id}
                            className={`${selectedLootItem._id === item._id ? "selected" : ""} ${
                              revealIndex >= 0 ? "loot-item-reveal" : ""
                            }`.trim()}
                            data-rarity={item.artwork.rarity}
                            key={item._id}
                            onClick={() => setSelectedLootItemId(item._id)}
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
                              researchTarget={unfoundQuestTargetArtworkIds.has(
                                item.artwork_id,
                              )}
                              size={82}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <div
                      aria-live="polite"
                      className="collection-preview loot-preview"
                    >
                      <ItemCard
                        actions={lootItemActions(selectedLootItem)}
                        alreadyOwned={ownedArtworkIds.has(
                          selectedLootItem.artwork_id,
                        )}
                        item={selectedLootItem}
                        owner={{
                          playerId,
                          screenName: player.screenName,
                        }}
                        key={getItemCardKey(selectedLootItem)}
                        legendaryAttributes={legendaryAttributes}
                        overlay={
                          donationEffects[selectedLootItem._id] ? (
                            <DonationRewardEffect
                              effect={donationEffects[selectedLootItem._id]}
                            />
                          ) : null
                        }
                        permissions={{
                          canManageItem: true,
                          canCustomizeCosmetic: false,
                        }}
                        primaryAction={lootPrimaryAction(selectedLootItem)}
                        researchTarget={unfoundQuestTargetArtworkIds.has(
                          selectedLootItem.artwork_id,
                        )}
                        styleInventory={player.cardStyleInventory}
                        viewerId={playerId}
                      />
                    </div>
                  </div>
                ) : null}
                {hasClaimableLoot || hasPurchasableLoot ? (
                  <div className="loot-bulk-sale">
                    <div className="loot-bulk-sale-copy">
                      <span className="collection-kicker">bulk actions</span>
                      <strong>Clear unwanted artworks</strong>
                      <small>
                        {bulkSellableLoot.length} owned ·{" "}
                        {bulkDeclinableLoot.length} dealer{" "}
                        {bulkDeclinableLoot.length === 1 ? "offer" : "offers"}
                      </small>
                    </div>
                    <fieldset>
                      <legend className="sr-only">Items to preserve</legend>
                      {(
                        [
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
                    <button
                      className="sell-all-loot"
                      disabled={pending || bulkSellableLoot.length === 0}
                      onClick={sellAllLoot}
                      type="button"
                    >
                      <i aria-hidden="true" className="fa fa-usd" /> Sell all
                      {sellAllEarnings ? (
                        <span
                          className="sell-all-earnings"
                          key={sellAllEarnings.animationId}
                        >
                          +${sellAllEarnings.amount.toLocaleString()}
                        </span>
                      ) : null}
                    </button>
                    <button
                      className="donate-all-loot"
                      disabled={pending || bulkSellableLoot.length === 0}
                      onClick={donateAllLoot}
                      type="button"
                    >
                      <i aria-hidden="true" className="fa fa-share-square" /> Donate all
                      {donateAllEarnings ? (
                        <span
                          className="donate-all-earnings"
                          key={donateAllEarnings.animationId}
                        >
                          +{donateAllEarnings.karma.toLocaleString()} Karma
                        </span>
                      ) : null}
                    </button>
                    {hasPurchasableLoot ? (
                      <button
                        className="decline-all-loot"
                        disabled={pending || bulkDeclinableLoot.length === 0}
                        onClick={declineAllLoot}
                        type="button"
                      >
                        <i aria-hidden="true" className="fa fa-times" /> Decline
                        all
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}

        {section === "collection" && collectionItems.length === 0 ? (
          <>
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
            <section className="collection-empty-state">
              <button onClick={() => setSection("loot")} type="button">
                go here and come back when you collect some artwork!
              </button>
            </section>
          </>
        ) : null}

        {section === "collection" && collectionItems.length > 0 ? (
          <section className="collection-workspace">
            {impersonating ? (
              <div className="admin-gallery-controls col-span-full">
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
            {galleryMetadata ? (
              <InfoPanel className="col-span-full">
                <div className="flex flex-col gap-3">
                  <header>
                    <h2 className="info-panel-title">gallery overview</h2>
                  </header>
                  <GalleryStats>
                    <GalleryStat label="Gallery value" value={"$" + galleryMetadata.value.toLocaleString()} />
                    <GalleryStat label="Works displayed" value={galleryMetadata.display_count} />
                    <GalleryStat label="Attribute score" value={galleryMetadata.score.toLocaleString()} />
                    <GalleryStat label="Featured value" value={"$" + galleryMetadata.featured_value.toLocaleString()} />
                    <GalleryStat label="Earnings per hour" value={"$" + galleryRates.moneyPerHour.toLocaleString()} />
                    <GalleryStat label="Experience per hour" value={galleryRates.xpPerHour.toLocaleString()} />
                    <GalleryStat label="Attributes" value={galleryMetadata.attributes.map((attribute, i) => <Attribute key={`${attribute.id}_${i}`} attribute={attribute} displayCapacity={galleryMetadata.display_capacity} />)} />
                  </GalleryStats>
                </div>
              </InfoPanel>
            ) : null}
            <aside className="collection-inventory-panel">
              <section className="collection-sidebar-section">
                <header className="collection-panel-heading">
                  <div>
                    <span className="collection-kicker">your collection</span>
                    <h2>inventory</h2>
                  </div>
                  <span className="collection-count">{inventory.length}</span>
                </header>
                <label className="collection-inventory-sort">
                  <span>Sort inventory</span>
                  <select
                    onChange={(event) => {
                      const next = event.target.value as InventorySort;
                      setInventorySort(next);
                      saveViewSettings({ inventorySort: next });
                    }}
                    value={inventorySort}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="value-high">Value: high to low</option>
                    <option value="value-low">Value: low to high</option>
                    <option value="title">Title: A to Z</option>
                    <option value="artist">Artist: A to Z</option>
                    <option value="rarity">Rarity: highest first</option>
                    <option value="condition">Condition: highest first</option>
                  </select>
                </label>
                {inventory.length === 0 ? (
                  <p className="collection-sidebar-empty">
                    Your inventory is empty.
                  </p>
                ) : (
                  <div className="collection-thumbnail-list">
                    {sortedInventory.map((item) => (
                      <button
                        aria-label={`Preview ${item.artwork.title} by ${item.artwork.artist}`}
                        aria-pressed={selectedCollectionItem?._id === item._id}
                        data-rarity={item.artwork.rarity}
                        className={
                          selectedCollectionItem?._id === item._id
                            ? "selected"
                            : ""
                        }
                        key={item._id}
                        onClick={() => setSelectedCollectionItemId(item._id)}
                        title={`${item.artwork.title} by ${item.artwork.artist}`}
                        type="button"
                      >
                        <ItemThumbnail
                          alt=""
                          item={item}
                          researchTarget={questTargetArtworkIds.has(
                            item.artwork_id,
                          )}
                          size={82}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section className="collection-sidebar-section on-display-panel">
                <header className="collection-panel-heading">
                  <div>
                    <h2>on display</h2>
                  </div>
                  <DisplayedSummary
                    theme="museum"
                    displayCapacity={galleryMetadata?.display_capacity ?? 0}
                    rarities={galleryMetadata?.display_rarities ?? []}
                  />
                </header>
                {displayed.length === 0 ? (
                  <p className="collection-sidebar-empty">
                    No works are currently on display.
                  </p>
                ) : (
                  <div className="collection-thumbnail-list">
                    {displayed.map((item) => (
                      <button
                        aria-label={`Open details for ${item.artwork.title} by ${item.artwork.artist}`}
                        aria-pressed={selectedCollectionItem?._id === item._id}
                        data-rarity={item.artwork.rarity}
                        className={
                          selectedCollectionItem?._id === item._id
                            ? "selected"
                            : ""
                        }
                        key={item._id}
                        onClick={() => setSelectedCollectionItemId(item._id)}
                        title={`${item.artwork.title} by ${item.artwork.artist}`}
                        type="button"
                      >
                        <ItemThumbnail
                          alt=""
                          item={item}
                          researchTarget={questTargetArtworkIds.has(
                            item.artwork_id,
                          )}
                          size={82}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </aside>
            <div className="collection-main">
              {selectedCollectionItem ? (
                <section className="collection-preview" aria-live="polite">
                  <ItemCard
                    actions={
                      selectedCollectionItem.status === "displayed"
                        ? collectionDisplayedItemActions(selectedCollectionItem)
                        : selectedCollectionItem.status === "auctioned"
                          ? undefined
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
              ) : null}
              <GalleryChat galleryOwnerId={playerId} viewerId={playerId} />
              <div className="gallery-window">
                <div className="gallery-scroll-window">
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
                              onClick={() =>
                                setSelectedCollectionItemId(item._id)
                              }
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
                <div className="npc-area gallery-npc-overlay">
                  {galleryVisitors.map((npc) => (
                      <span className="gallery-npc-slot" key={npc._id}>
                        <button
                          className={`gallery-npc ${npc.quality} ${
                            npc.alreadyMet ? "disabled" : "enabled"
                          } ${
                            npcRewardEffects[npc._id] ? "rewarding" : ""
                          }`}
                          data-npc-id={npc._id}
                          disabled={
                            pending ||
                            meetingNpc !== null ||
                            npc.alreadyMet ||
                            Boolean(npcRewardEffects[npc._id])
                          }
                          onClick={async () => {
                            if (await meetNpc(npc)) markVisitorMet(npc._id);
                          }}
                          title={
                            npc.alreadyMet
                              ? `${npc.npc_name} already met`
                              : `meet ${npc.npc_name}`
                          }
                          type="button"
                        >
                          <i
                            aria-hidden="true"
                            className={`fa ${npc.icon}`}
                          />
                          <span>{npc.npc_name}</span>
                        </button>
                      </span>
                    ))}
                </div>
              </div>
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
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="value-high">Value: high to low</option>
                    <option value="value-low">Value: low to high</option>
                    <option value="title">Title: A to Z</option>
                    <option value="artist">Artist: A to Z</option>
                    <option value="rarity">Rarity: highest first</option>
                    <option value="condition">Condition: highest first</option>
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
                          karma: karmaBalance,
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
                      onClick={() => requestItemRemoval(item, "sell")}
                    />
                    <ItemActionButton
                      icon="fa-share-square"
                      label="Donate for Karma"
                      disabled={pending || item.permanent || item.original}
                      onClick={() => requestItemRemoval(item, "donate")}
                    />
                    <AuthenticityActions
                      act={act}
                      item={item}
                      pending={pending}
                    />
                    {archiveAction(item)}
                    <ItemActionButton
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
            {archives.length === 0 ? (
              <p className="empty-state">Your archive is empty.</p>
            ) : (
              <>
                <div className="archive-filters">
                  <label className="archive-search">
                    <span>Search</span>
                    <input
                      onChange={(event) => setArchiveSearch(event.target.value)}
                      placeholder="artist or artwork"
                      type="search"
                      value={archiveSearch}
                    />
                  </label>
                  <label>
                    <span>Rarity</span>
                    <select
                      onChange={(event) =>
                        setArchiveRarity(
                          event.target.value as ArtworkRarity | "all",
                        )
                      }
                      value={archiveRarity}
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
                        setArchiveCompletion(
                          event.target.value as
                            | "all"
                            | "complete"
                            | "incomplete",
                        )
                      }
                      value={archiveCompletion}
                    >
                      <option value="all">all entries</option>
                      <option value="incomplete">incomplete</option>
                      <option value="complete">complete</option>
                    </select>
                  </label>
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
              {galleryVisitors.map((npc) => (
                  <span className="gallery-npc-slot" key={npc._id}>
                    <button
                      className={`gallery-npc ${npc.quality} ${
                        npc.alreadyMet ? "disabled" : "enabled"
                      } ${npcRewardEffects[npc._id] ? "rewarding" : ""}`}
                      data-npc-id={npc._id}
                      disabled={
                        pending ||
                        meetingNpc !== null ||
                        npc.alreadyMet ||
                        Boolean(npcRewardEffects[npc._id])
                      }
                      onClick={async () => {
                        if (await meetNpc(npc)) markVisitorMet(npc._id);
                      }}
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
                  </span>
                ))}
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
            initialBankBalance={player.bankBalance}
            initialGalleryId={exploreResetKey === 0 ? initialGalleryId : null}
            initialSort={player.viewSettings.gallerySort}
            initialViewMode={player.viewSettings.galleryView}
            key={`gallery-explorer-${exploreResetKey}`}
            meetingNpc={meetingNpc}
            npcSpawnIntervalMinutes={npcSpawnIntervalMinutes}
            npcRewardEffects={npcRewardEffects}
            onMeetNpc={meetNpc}
            onViewSettingsChange={saveViewSettings}
            viewerId={playerId}
          />
        ) : null}

        {section === "auctions" ? (
          <AuctionHouse
            initialBankBalance={player.bankBalance}
            initialAuctionId={searchParams.get("auction")}
            legendaryAttributes={legendaryAttributes}
            marketExpertExpiration={marketExpertExpiration}
            playerId={playerId}
          />
        ) : null}

        {section === "raffle" ? (
          <RafflePanel
            availableTickets={raffle.availableTickets}
            nextDrawAt={raffle.nextDrawAt}
            previousWinners={raffle.previousWinners}
            prizes={raffle.prizes}
            viewerId={playerId}
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
              setForgeryArchive(archiveEntryDetails);
              setArchiveEntryDetails(null);
            }}
            seasonalEligible={forgePricing.seasonalArtworkIds.includes(
              archiveEntryDetails.artwork_id,
            )}
          />
        ) : null}
        {forgeryArchive ? (
          <ForgeryDialog
            archive={forgeryArchive}
            pricing={forgePricing}
            legendaryAttributes={legendaryAttributes}
            onClose={() => setForgeryArchive(null)}
            onForged={(message) => {
              setForgeryArchive(null);
              setNotice(message);
              router.refresh();
            }}
          />
        ) : null}
        {auctioneerSession ? (
          <AuctioneerOfferDialog
            auctions={auctioneerSession.auctions}
            bankBalance={player.bankBalance}
            legendaryAttributes={legendaryAttributes}
            npcName={auctioneerSession.npcName}
            onAuctionsChange={(auctions) =>
              setAuctioneerSession((current) =>
                current ? { ...current, auctions } : current,
              )
            }
            onClose={() => setAuctioneerSession(null)}
            playerId={playerId}
            quality={auctioneerSession.quality}
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
        {typeof document !== "undefined"
          ? createPortal(
              <NpcEffectLayer effects={Object.values(npcRewardEffects)} />,
              document.body,
            )
          : null}
      </div>
    </main>
  );
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

function AuctioneerOfferDialog({
  npcName,
  quality,
  auctions,
  bankBalance,
  legendaryAttributes,
  playerId,
  onClose,
  onAuctionsChange,
}: {
  npcName: string;
  quality: NpcQuality;
  auctions: AuctionView[];
  bankBalance: number;
  legendaryAttributes: CardLegendaryAttribute[];
  playerId: string;
  onClose: () => void;
  onAuctionsChange: (auctions: AuctionView[]) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [selectedAuction, setSelectedAuction] = useState<AuctionView | null>(null);

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

  async function refreshAuction(auctionId: string) {
    try {
      const response = await fetch(`/api/play/auctions?auction=${auctionId}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const body = (await response.json()) as { auctions: AuctionView[] };
        const updated = body.auctions.find((a) => a._id === auctionId);
        if (updated) {
          onAuctionsChange(
            auctions.map((a) => (a._id === auctionId ? updated : a)),
          );
        } else {
          onAuctionsChange(auctions.filter((a) => a._id !== auctionId));
        }
      }
    } catch {
      // Ignore
    }
  }

  return (
    <>
      <dialog
        aria-labelledby="auctioneer-offer-title"
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
              <h2 id="auctioneer-offer-title">{npcName}&apos;s private auctions</h2>
            </div>
            <button
              aria-label={`Close ${npcName} private auctions`}
              className="reroll-dialog-close"
              onClick={closeDialog}
              type="button"
            >
              <i aria-hidden="true" className="fa fa-times" />
            </button>
          </header>
          <p>Closing this dialog leaves your private auctions accessible in the Auction House.</p>
          {auctions.length === 0 ? (
            <p className="empty-state">No active private auctions.</p>
          ) : (
            <div className="donor-offer-list">
              {auctions.map((auction) => (
                <article
                  className="donor-offer-item donor-offer-item-clickable"
                  key={auction._id}
                  onClick={() => setSelectedAuction(auction)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedAuction(auction);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <ItemThumbnail
                    alt={`${auction.item.artwork.title} by ${auction.item.artwork.artist}`}
                    className="donor-offer-thumbnail"
                    item={auction.item}
                  />
                  <div className="donor-offer-details">
                    <div>
                      <span
                        className={`artwork-ownership-indicator ${
                          auction.owned ? "owned" : "new"
                        }`}
                      >
                        {auction.owned ? "owned" : "new artwork"}
                      </span>
                      <span
                        className={`donor-offer-rarity rarity-text ${auction.item.artwork.rarity}`}
                      >
                        {auction.item.artwork.rarity}
                      </span>
                      {auction.currentlyWinning ? (
                        <span className="auctioneer-winning-indicator">
                          winning
                        </span>
                      ) : null}
                    </div>
                    <strong>{auction.item.artwork.title}</strong>
                    <span>{auction.item.artwork.artist}</span>
                    <span>
                      promotion level {auction.item.level} · condition{" "}
                      {Math.round(auction.item.condition * 100)}%
                    </span>
                    <span>
                      estimated value ${auction.item.values.actual.toLocaleString()}
                    </span>
                    <strong className="dealer-offer-price">
                      {auction.has_bid ? "current bid" : "starting bid"}{" "}
                      ${auction.current_bid.toLocaleString()}
                    </strong>
                  </div>
                  <div className="donor-offer-actions">
                    <ItemActionButton
                      disabled={false}
                      icon="fa-gavel"
                      label={`Bid on ${auction.item.artwork.title}`}
                      onClick={() => setSelectedAuction(auction)}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </dialog>
      {selectedAuction ? (
        <AuctionBidDialog
          auction={selectedAuction}
          bankBalance={bankBalance}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setSelectedAuction(null)}
          onSuccess={() => {
            const targetId = selectedAuction._id;
            setSelectedAuction(null);
            void refreshAuction(targetId);
            router.refresh();
          }}
          playerId={playerId}
        />
      ) : null}
    </>
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
  onSelected,
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
  const levelUpCost = getItemLevelUpCost(item.level, levelUpDiscounted);
  const canAffordLevelUp = canAffordItemLevelUp(karma, levelUpCost);
  const atMaximumLevel = item.level >= ITEM_LEVEL_MAX;
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

function getInventoryComparator(
  sort: InventorySort,
): (left: HydratedGameItem, right: HydratedGameItem) => number {
  const byNewest = (left: HydratedGameItem, right: HydratedGameItem) =>
    Date.parse(right.date_received) - Date.parse(left.date_received);
  const tieBreak = (left: HydratedGameItem, right: HydratedGameItem) =>
    byNewest(left, right) || left._id.localeCompare(right._id);

  return (left, right) => {
    let comparison = 0;
    switch (sort) {
      case "oldest":
        comparison =
          Date.parse(left.date_received) - Date.parse(right.date_received);
        break;
      case "value-high":
        comparison = right.values.actual - left.values.actual;
        break;
      case "value-low":
        comparison = left.values.actual - right.values.actual;
        break;
      case "title":
        comparison = left.artwork.title.localeCompare(right.artwork.title);
        break;
      case "artist":
        comparison = left.artwork.artist.localeCompare(right.artwork.artist);
        break;
      case "rarity":
        comparison =
          ARTWORK_RARITIES.indexOf(right.artwork.rarity) -
          ARTWORK_RARITIES.indexOf(left.artwork.rarity);
        break;
      case "condition":
        comparison = right.condition - left.condition;
        break;
      case "newest":
        comparison = byNewest(left, right);
        break;
    }
    return comparison || tieBreak(left, right);
  };
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

function GalleryMetadataPanel({
  className = "",
  galleryMetadata,
  galleryRates,
}: {
  className?: string;
  galleryMetadata: GalleryMetadataSnapshot;
  galleryRates: GalleryRates;
}) {
  return (
    <section
      className={`profile-gallery-metadata ${className}`.trim()}
    >
      <header>
        <h2>gallery overview</h2>
      </header>
      <dl className="profile-gallery-stats">
        <div>
          <dt>Gallery value</dt>
          <dd>${galleryMetadata.value.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Works displayed</dt>
          <dd>{galleryMetadata.display_count}</dd>
        </div>
        <div>
          <dt>Attribute score</dt>
          <dd>{galleryMetadata.score.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Featured value</dt>
          <dd>${galleryMetadata.featured_value.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Earnings per hour</dt>
          <dd>${galleryRates.moneyPerHour.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Experience per hour</dt>
          <dd>{galleryRates.xpPerHour.toLocaleString()}</dd>
        </div>
        <div className="profile-gallery-icon-row">
          <dt className="sr-only">Attributes</dt>
          <dd>
            <GalleryAttributeSummary
              attributes={galleryMetadata.attributes}
              displayCapacity={galleryMetadata.display_capacity}
            />
          </dd>
        </div>
        <div className="profile-gallery-icon-row">
          <dt className="sr-only">Rarities</dt>
          <dd>
            <GalleryRaritySummary
              rarities={galleryMetadata.display_rarities}
            />
          </dd>
        </div>
      </dl>
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

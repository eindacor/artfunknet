import { createHash } from "node:crypto";

import type { Db, Filter } from "mongodb";
import { TutorialElement } from "../shared/tutorial.ts";

import type { ArtworkRarity, GameItem, ItemAttribute } from "./gameplay.ts";
import { getEffectiveGalleryAttributeRating } from "./gallery-metadata-core.ts";
import {
  ART_COLLECTOR_ATTRIBUTE_ID,
  ART_DONOR_ATTRIBUTE_ID,
} from "./legendary-attributes.ts";
import type { ArtworkEffect } from "./artwork-effects.ts";
import {
  getVisitorGenerationPasses,
  MASTERPIECE_EFFECT_CODES,
} from "./masterpiece-effects.ts";
import {
  hydrateGameItems,
  type HydratedGameItem,
} from "./item-artwork.ts";

export const NPC_QUALITIES = [
  "bronze",
  "silver",
  "gold",
  "platinum",
] as const;

export type NpcQuality = (typeof NPC_QUALITIES)[number];

export type GalleryNpc = {
  _id: string;
  spawn_key?: string;
  quality: NpcQuality;
  attribute_id: string;
  owner_id: string;
  owner_name: string;
  spawned_at: Date;
  expiration: Date | null;
  tutorial?: true;
  tutorial_revision?: number;
  tutorial_reward_claimed?: boolean;
  players_met: string[];
  icon: string;
  npc_name: string;
  proc_chance: number;
};

export type GalleryNpcItem = {
  attributes: GameItem["attributes"];
  artwork: { rarity: ArtworkRarity };
};

type PlayerRecord = {
  _id: string;
  screen_name: string;
  active: boolean;
  artist_id?: string;
  artist_featured?: boolean;
  profile: {
    level: number;
    display_cap: number;
    npcs_met?: Partial<Record<NpcQuality, number>>;
    npcs_met_reset_at?: string;
  };
  tutorial?: { step: string | null; revision: number };
};

const PLAYER_LEVEL_MAX = 50;
const BASE_NPC_PROC_MAX = 0.9;
const RARITY_NPC_COEFFICIENTS: Record<ArtworkRarity, number> = {
  common: 0.84,
  uncommon: 0.88,
  rare: 0.92,
  legendary: 0.96,
  masterpiece: 1,
};
const NPC_QUALITY_WEIGHTS: Record<NpcQuality, number> = {
  bronze: 12,
  silver: 10,
  gold: 8,
  platinum: 6,
};

export function aggregateGalleryAttributes(
  items: GalleryNpcItem[],
): Map<string, { attribute: ItemAttribute; total: number }> {
  const totals = new Map<
    string,
    { attribute: ItemAttribute; total: number }
  >();

  for (const item of items) {
    for (const attribute of getGalleryItemAttributes(item)) {
      const current = totals.get(attribute._id);
      totals.set(attribute._id, {
        attribute,
        total: (current?.total ?? 0) + (attribute.value ?? 0),
      });
    }
  }

  return totals;
}

export function getRareDisplayedAttributeIds(
  items: GalleryNpcItem[],
): Set<string> {
  const attributeIds = new Set<string>();
  for (const item of items) {
    if (item.artwork.rarity !== "rare") continue;
    for (const attribute of getGalleryItemAttributes(item)) {
      attributeIds.add(attribute._id);
    }
  }
  return attributeIds;
}

export function getNpcProcMap(
  items: GalleryNpcItem[],
  displayCap: number,
  playerLevel: number,
): Map<string, { attribute: ItemAttribute; chance: number }> {
  if (items.length === 0 || displayCap <= 0) return new Map();

  const rarityCoefficient =
    items.reduce(
      (sum, item) => sum + RARITY_NPC_COEFFICIENTS[item.artwork.rarity],
      0,
    ) / items.length;
  const levelCoefficient =
    0.9 + (Math.min(Math.max(playerLevel, 0), PLAYER_LEVEL_MAX) / 500);

  return new Map(
    [...aggregateGalleryAttributes(items)].map(
      ([attributeId, { attribute, total }]) => {
        const attributeRating = getEffectiveGalleryAttributeRating(
          total,
          displayCap,
        );
        const baseProc =
          attributeRating * rarityCoefficient * levelCoefficient;
        const chance = Number(
          (Math.pow(baseProc, 2) * BASE_NPC_PROC_MAX).toFixed(2),
        );
        return [attributeId, { attribute, chance }];
      },
    ),
  );
}

export function getNpcQuality(roll: number): NpcQuality {
  const total = NPC_QUALITIES.reduce(
    (sum, quality) => sum + NPC_QUALITY_WEIGHTS[quality],
    0,
  );
  let remaining = Math.min(Math.max(roll, 0), 0.999999999999) * total;
  for (const quality of NPC_QUALITIES) {
    remaining -= NPC_QUALITY_WEIGHTS[quality];
    if (remaining < 0) return quality;
  }
  return "platinum";
}

export async function ensureTutorialDonor(
  database: Db,
  playerId: string,
  now = new Date(),
  tutorialRevision?: number,
): Promise<void> {
  const id = createHash("sha256").update(`first-feature-tutorial:${playerId}`).digest("hex").slice(0, 32);
  const npcs = database.collection<GalleryNpc>("npcs");
  const existing = await npcs.findOne({ _id: id }, { projection: { _id: 1, tutorial_revision: 1 } });
  if (existing && (tutorialRevision === undefined || (existing.tutorial_revision ?? -1) >= tutorialRevision)) return;
  const [player, attribute] = await Promise.all([
    database.collection<PlayerRecord>("players").findOne({ _id: playerId, active: true,
      ...(tutorialRevision === undefined ? {} : {
        "tutorial.step": TutorialElement.TUTORIAL_MEET_VISITOR, "tutorial.revision": tutorialRevision,
      }) }),
    database.collection<ItemAttribute>("attributes").findOne({ _id: ART_DONOR_ATTRIBUTE_ID }),
  ]);
  if (!player) return;
  // Keep the met record as the one-time tutorial marker, including across eras.
  await npcs.updateOne({ _id: id }, { $setOnInsert: {
    _id: id,
    spawn_key: `tutorial:${id}`,
    quality: "bronze",
    attribute_id: ART_DONOR_ATTRIBUTE_ID,
    owner_id: playerId,
    owner_name: player.screen_name,
    spawned_at: now,
    expiration: null,
    tutorial: true,
    players_met: [],
    icon: attribute?.icon || "fa-share-square fa-flip-horizontal",
    npc_name: attribute?.npc_name || "Art Donor",
    proc_chance: 1,
  } }, { upsert: true });
  if (tutorialRevision !== undefined) {
    await npcs.updateOne({
      _id: id,
      $or: [{ tutorial_revision: { $exists: false } }, { tutorial_revision: { $lt: tutorialRevision } }],
    }, [{ $set: {
      tutorial_revision: tutorialRevision,
      spawned_at: now,
      // Preserve the lifetime reward marker when reopening a previously met Donor.
      tutorial_reward_claimed: { $or: [
        { $eq: ["$tutorial_reward_claimed", true] }, { $in: [playerId, "$players_met"] },
      ] },
      players_met: [],
    } }]);
  }
}

export function getNpcAvailabilityFilter(now: Date, viewerId?: string): Filter<GalleryNpc> {
  if (!viewerId) return { tutorial: { $ne: true }, expiration: { $gt: now } };
  return {
    $or: [
      { tutorial: { $ne: true }, expiration: { $gt: now } },
      {
        tutorial: true,
        owner_id: viewerId,
        expiration: null,
        players_met: { $ne: viewerId },
      },
    ],
  };
}

export async function refreshNpcSpawns(
  database: Db,
  now = new Date(),
  spawnIntervalMinutes = 10,
  ownerId?: string,
  featuredArtistVisitorChance = 0.25,
): Promise<void> {
  const spawnIntervalMs = spawnIntervalMinutes * 60 * 1000;
  const cycleStartMs =
    Math.floor(now.getTime() / spawnIntervalMs) * spawnIntervalMs;
  const spawnedAt = new Date(cycleStartMs);
  const expiration = new Date(cycleStartMs + spawnIntervalMs);
  const [players, rawDisplayedItems, pairedAttributes] = await Promise.all([
    database
      .collection<PlayerRecord>("players")
      .find(ownerId ? { _id: ownerId, active: true } : { active: true })
      .project<PlayerRecord>({
        _id: 1,
        screen_name: 1,
        active: 1,
        artist_id: 1,
        artist_featured: 1,
        "profile.level": 1,
        "profile.display_cap": 1,
      })
      .toArray(),
    database
      .collection<GameItem>("items")
      .find({ ...(ownerId ? { owner: ownerId } : {}), status: "displayed" })
      .toArray(),
    database
      .collection<ItemAttribute>("attributes")
      .find({ $or: [
        { _id: { $in: [ART_COLLECTOR_ATTRIBUTE_ID, ART_DONOR_ATTRIBUTE_ID] } },
        { active: true, npc_name: { $type: "string", $ne: "" } },
      ] })
      .toArray(),
  ]);
  const displayedItems = await hydrateGameItems(database, rawDisplayedItems);
  const activeLegendaryIds = [
    ...new Set(
      displayedItems
        .map((item) => item.artwork.effect_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const collectorEffects =
    activeLegendaryIds.length === 0
      ? []
      : await database
          .collection<ArtworkEffect>("artwork_effects")
          .find({
            _id: { $in: activeLegendaryIds },
            code: {
              $in: ["COLLECTOR_MAX_QUALITY", "COLLECTOR_DONOR_PAIR"],
            },
            active: true,
          })
          .project<Pick<ArtworkEffect, "_id" | "code">>({
            _id: 1,
            code: 1,
          })
          .toArray();
  const collectorQualityEffectIds = new Set(
    collectorEffects
      .filter((attribute) => attribute.code === "COLLECTOR_MAX_QUALITY")
      .map((attribute) => attribute._id),
  );
  const collectorDonorPairEffectIds = new Set(
    collectorEffects
      .filter((attribute) => attribute.code === "COLLECTOR_DONOR_PAIR")
      .map((attribute) => attribute._id),
  );
  const ownersWithMaximumCollectorQuality = new Set(
    displayedItems
      .filter(
        (item) =>
          item.artwork.effect_id &&
          collectorQualityEffectIds.has(item.artwork.effect_id),
      )
      .map((item) => item.owner),
  );
  const ownersWithCollectorDonorPair = new Set(
    displayedItems
      .filter(
        (item) =>
          item.artwork.effect_id &&
          collectorDonorPairEffectIds.has(item.artwork.effect_id),
      )
      .map((item) => item.owner),
  );
  const pairedAttributeMap = new Map(
    pairedAttributes.map((attribute) => [attribute._id, attribute]),
  );
  const itemsByOwner = new Map<string, HydratedGameItem[]>();
  for (const item of displayedItems) {
    const ownerItems = itemsByOwner.get(item.owner) ?? [];
    ownerItems.push(item);
    itemsByOwner.set(item.owner, ownerItems);
  }
  const masterpieceGalleryEffects =
    activeLegendaryIds.length === 0
      ? []
      : await database
          .collection<ArtworkEffect>("artwork_effects")
          .find({
            _id: { $in: activeLegendaryIds },
            code: {
              $in: [
                MASTERPIECE_EFFECT_CODES.commonSubstitution,
                MASTERPIECE_EFFECT_CODES.rareVisitorDouble,
              ],
            },
            active: true,
          })
          .toArray();
  const effectCodeById = new Map(
    masterpieceGalleryEffects.map((effect) => [effect._id, effect.code]),
  );

  const operations = players.flatMap((player) => {
    const ownerItems = itemsByOwner.get(player._id) ?? [];
    const substitutionItem = ownerItems
      .filter(
        (item) =>
          item.artwork.effect_id &&
          effectCodeById.get(item.artwork.effect_id) ===
            MASTERPIECE_EFFECT_CODES.commonSubstitution,
      )
      .sort(
        (left, right) =>
          left.values.actual - right.values.actual ||
          left._id.localeCompare(right._id),
      )[0];
    const hasRareDoubleEffect = ownerItems.some(
      (item) =>
        item.artwork.effect_id &&
        effectCodeById.get(item.artwork.effect_id) ===
          MASTERPIECE_EFFECT_CODES.rareVisitorDouble,
    );
    const rareDisplayedAttributeIds = hasRareDoubleEffect
      ? getRareDisplayedAttributeIds(ownerItems)
      : new Set<string>();
    const scoringItems = ownerItems.map((item) =>
      substitutionItem && item.artwork.rarity === "common"
        ? { ...item, attributes: substitutionItem.attributes }
        : item,
    );
    const procMap = getNpcProcMap(
      scoringItems,
      player.profile.display_cap,
      player.profile.level,
    );
    const normalOperations = [...procMap].flatMap(([attributeId, { attribute, chance }]) => {
      const baseSpawnKey = `${player._id}:${cycleStartMs}:${attributeId}`;
      const generationPasses = getVisitorGenerationPasses(
        hasRareDoubleEffect,
        rareDisplayedAttributeIds.has(attributeId),
      );
      return Array.from({ length: generationPasses }).flatMap((_, passIndex) => {
        const spawnKey =
          passIndex === 0
            ? baseSpawnKey
            : `${baseSpawnKey}:pass:${passIndex + 1}`;
        if (seededRoll(`${spawnKey}:spawn`) >= chance) return [];

        const maximumCollectorQuality =
          attributeId === ART_COLLECTOR_ATTRIBUTE_ID &&
          ownersWithMaximumCollectorQuality.has(player._id)
            ? "platinum"
            : null;
        const npc: GalleryNpc = {
          _id: createHash("sha256").update(spawnKey).digest("hex").slice(0, 32),
          quality:
            maximumCollectorQuality ??
            getNpcQuality(seededRoll(`${spawnKey}:quality`)),
          attribute_id: attributeId,
          owner_id: player._id,
          owner_name: player.screen_name,
          spawned_at: spawnedAt,
          expiration,
          players_met: [],
          icon: attribute.icon,
          npc_name: attribute.npc_name,
          proc_chance: chance,
        };
        const npcOperations = [
          {
            updateOne: {
              filter: { _id: npc._id },
              update: { $setOnInsert: { ...npc, spawn_key: spawnKey } },
              upsert: true,
            },
          },
        ];
        const companionAttributeId =
          npc.quality === "platinum" &&
          ownersWithCollectorDonorPair.has(player._id)
            ? attributeId === ART_COLLECTOR_ATTRIBUTE_ID
              ? ART_DONOR_ATTRIBUTE_ID
              : attributeId === ART_DONOR_ATTRIBUTE_ID
                ? ART_COLLECTOR_ATTRIBUTE_ID
                : null
            : null;
        const companionAttribute = companionAttributeId
          ? pairedAttributeMap.get(companionAttributeId)
          : null;
        if (companionAttribute) {
          const companionSpawnKey = `${spawnKey}:paired:${companionAttributeId}`;
          const companion: GalleryNpc = {
            _id: createHash("sha256")
              .update(companionSpawnKey)
              .digest("hex")
              .slice(0, 32),
            quality: "bronze",
            attribute_id: companionAttribute._id,
            owner_id: player._id,
            owner_name: player.screen_name,
            spawned_at: spawnedAt,
            expiration,
            players_met: [],
            icon: companionAttribute.icon,
            npc_name: companionAttribute.npc_name,
            proc_chance: chance,
          };
          npcOperations.push({
            updateOne: {
              filter: { _id: companion._id },
              update: {
                $setOnInsert: {
                  ...companion,
                  spawn_key: companionSpawnKey,
                },
              },
              upsert: true,
            },
          });
        }
        return npcOperations;
      });
    });
    const featuredOperations = player.artist_featured && player.artist_id
      ? createFeaturedArtistVisitors(
          player._id, player.screen_name, pairedAttributes, spawnedAt, expiration, featuredArtistVisitorChance,
        ).map(npc => ({
          updateOne: {
            filter: { _id: npc._id },
            update: { $setOnInsert: { ...npc, spawn_key: `featured:${npc._id}` } },
            upsert: true,
          },
        }))
      : [];
    return [...normalOperations, ...featuredOperations];
  });

  if (operations.length > 0) {
    await database.collection<GalleryNpc & { spawn_key: string }>("npcs").bulkWrite(operations, { ordered: false });
  }

  await database.collection("npcs").deleteMany({
    ...(ownerId ? { owner_id: ownerId } : {}),
    tutorial: { $ne: true },
    expiration: { $lte: now },
  });
}

export async function getGalleryNpcs(
  database: Db,
  ownerId: string,
  now = new Date(),
  viewerId?: string,
): Promise<GalleryNpc[]> {
  const visitors = await database
    .collection<GalleryNpc>("npcs")
    .find({ owner_id: ownerId, ...getNpcAvailabilityFilter(now, viewerId) })
    .sort({ quality: 1, npc_name: 1 })
    .toArray();
  return visitors.map(visitor => ({ ...visitor, npc_name: getNpcDisplayName(visitor) }));
}

export function getNpcDisplayName(npc: Pick<GalleryNpc, "tutorial" | "npc_name">): string {
  return npc.tutorial ? npc.npc_name.replace(/^Tutorial /, "") : npc.npc_name;
}

export function createFeaturedArtistVisitors(
  ownerId: string, ownerName: string, attributes: ItemAttribute[],
  spawnedAt: Date, expiration: Date, chance = 0.25,
): GalleryNpc[] {
  return attributes.filter(attribute => attribute.active && attribute.npc_name)
    .flatMap(attribute => {
      const key = `featured-artist:${ownerId}:${spawnedAt.getTime()}:${attribute._id}`;
      if (seededRoll(`${key}:spawn`) >= chance) return [];
      return [{
        _id: createHash("sha256").update(key).digest("hex").slice(0, 32),
        quality: getNpcQuality(seededRoll(`${key}:quality`)),
        attribute_id: attribute._id, owner_id: ownerId, owner_name: ownerName,
        spawned_at: spawnedAt, expiration, players_met: [],
        icon: attribute.icon, npc_name: attribute.npc_name, proc_chance: chance,
      }];
    });
}

export async function visitorUsesOwnGalleryBenefits(database: Db, npc: Pick<GalleryNpc, "owner_id">, playerId: string) {
  if (npc.owner_id === playerId) return true;
  const owner = await database.collection<PlayerRecord>("players").findOne({
    _id: npc.owner_id, active: true, account_deletion: { $ne: true },
    artist_featured: true, artist_id: { $type: "string" },
  }, { projection: { _id: 1, artist_featured: 1, artist_id: 1 } });
  return owner?.artist_featured === true && typeof owner.artist_id === "string";
}

function seededRoll(seed: string): number {
  const bytes = createHash("sha256").update(seed).digest();
  return bytes.readUInt32BE(0) / 0x1_0000_0000;
}

function getGalleryItemAttributes(item: GalleryNpcItem): ItemAttribute[] {
  return [
    ...item.attributes.locked,
    ...item.attributes.unlocked,
    ...item.attributes.special,
  ];
}

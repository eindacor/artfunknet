import { createHash } from "node:crypto";

import type { Db } from "mongodb";

import type { ArtworkRarity, GameItem, ItemAttribute } from "./gameplay.ts";
import { getHighestAvailableCollectorQuality } from "./collector-gameplay.ts";
import {
  ART_COLLECTOR_ATTRIBUTE_ID,
  ART_DONOR_ATTRIBUTE_ID,
  type LegendaryAttribute,
} from "./legendary-attributes.ts";
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
  quality: NpcQuality;
  attribute_id: string;
  owner_id: string;
  owner_name: string;
  spawned_at: Date;
  expiration: Date;
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
  profile: {
    level: number;
    display_cap: number;
    npcs_met?: Partial<Record<NpcQuality, number>>;
  };
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
    const attributes = [
      ...item.attributes.locked,
      ...item.attributes.unlocked,
      ...item.attributes.special,
    ];
    for (const attribute of attributes) {
      const current = totals.get(attribute._id);
      totals.set(attribute._id, {
        attribute,
        total: (current?.total ?? 0) + (attribute.value ?? 0),
      });
    }
  }

  return totals;
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
        const attributeRating = total / displayCap;
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

export async function refreshNpcSpawns(
  database: Db,
  now = new Date(),
  spawnIntervalMinutes = 10,
): Promise<void> {
  const spawnIntervalMs = spawnIntervalMinutes * 60 * 1000;
  const cycleStartMs =
    Math.floor(now.getTime() / spawnIntervalMs) * spawnIntervalMs;
  const spawnedAt = new Date(cycleStartMs);
  const expiration = new Date(cycleStartMs + spawnIntervalMs);
  const [players, rawDisplayedItems, pairedAttributes] = await Promise.all([
    database
      .collection<PlayerRecord>("players")
      .find({ active: true })
      .project<PlayerRecord>({
        _id: 1,
        screen_name: 1,
        active: 1,
        "profile.level": 1,
        "profile.display_cap": 1,
        "profile.npcs_met": 1,
      })
      .toArray(),
    database
      .collection<GameItem>("items")
      .find({ status: "displayed" })
      .toArray(),
    database
      .collection<ItemAttribute>("attributes")
      .find({
        _id: {
          $in: [ART_COLLECTOR_ATTRIBUTE_ID, ART_DONOR_ATTRIBUTE_ID],
        },
      })
      .toArray(),
  ]);
  const displayedItems = await hydrateGameItems(database, rawDisplayedItems);
  const activeLegendaryIds = [
    ...new Set(
      displayedItems
        .map((item) => item.active_unique_attribute)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const collectorEffects =
    activeLegendaryIds.length === 0
      ? []
      : await database
          .collection<LegendaryAttribute>("unique_attributes")
          .find({
            _id: { $in: activeLegendaryIds },
            code: {
              $in: ["COLLECTOR_MAX_QUALITY", "COLLECTOR_DONOR_PAIR"],
            },
            active: true,
          })
          .project<Pick<LegendaryAttribute, "_id" | "code">>({
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
          item.active_unique_attribute &&
          collectorQualityEffectIds.has(item.active_unique_attribute),
      )
      .map((item) => item.owner),
  );
  const ownersWithCollectorDonorPair = new Set(
    displayedItems
      .filter(
        (item) =>
          item.active_unique_attribute &&
          collectorDonorPairEffectIds.has(item.active_unique_attribute),
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

  const operations = players.flatMap((player) => {
    const procMap = getNpcProcMap(
      itemsByOwner.get(player._id) ?? [],
      player.profile.display_cap,
      player.profile.level,
    );
    return [...procMap].flatMap(([attributeId, { attribute, chance }]) => {
      const spawnKey = `${player._id}:${cycleStartMs}:${attributeId}`;
      if (seededRoll(`${spawnKey}:spawn`) >= chance) return [];

      const maximumCollectorQuality =
        attributeId === ART_COLLECTOR_ATTRIBUTE_ID &&
        ownersWithMaximumCollectorQuality.has(player._id)
          ? getHighestAvailableCollectorQuality(
              player.profile.npcs_met ?? {},
            )
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
            filter: { spawn_key: spawnKey },
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
            filter: { spawn_key: companionSpawnKey },
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

  if (operations.length > 0) {
    await database.collection("npcs").bulkWrite(operations, { ordered: false });
  }
}

export async function getGalleryNpcs(
  database: Db,
  ownerId: string,
  now = new Date(),
): Promise<GalleryNpc[]> {
  return database
    .collection<GalleryNpc>("npcs")
    .find({ owner_id: ownerId, expiration: { $gt: now } })
    .sort({ quality: 1, npc_name: 1 })
    .toArray();
}

function seededRoll(seed: string): number {
  const bytes = createHash("sha256").update(seed).digest();
  return bytes.readUInt32BE(0) / 0x1_0000_0000;
}

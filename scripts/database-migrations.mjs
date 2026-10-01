import { LEGENDARY_ATTRIBUTE_PAIRS } from "./legendary-attribute-data.mjs";

export async function migrateHallOfFameAndPlaythroughStorage(database) {
  const now = new Date();
  const socialBatteryResetAt = getNextSocialBatteryResetAt(now).toISOString();

  await database.collection("metadata").updateOne(
    { _id: "hall-of-fame-settings" },
    {
      $setOnInsert: {
        scan_for_candidates: false,
        created_at: now,
      },
      $set: {
        schema_version: 1,
        updated_at: now,
      },
    },
    { upsert: true },
  );

  await database
    .collection("hall_of_fame")
    .createIndex({ item_id: 1 });
  await database
    .collection("hall_of_fame")
    .createIndex(
      { qualifier_id: 1 },
      {
        unique: true,
        partialFilterExpression: { qualifier_id: { $type: "string" } },
      },
    );
  await database
    .collection("hall_of_fame")
    .createIndex({ created_at: -1 });
  await database
    .collection("hall_of_fame_submissions")
    .createIndex({ item_id: 1 });
  await database
    .collection("hall_of_fame_submissions")
    .createIndex({ submitted_at: 1 });
  await database
    .collection("playthrough_snapshots")
    .createIndex({ player_id: 1, playthrough_number: -1 });
  await database.collection("quests").updateMany(
    { fulfilled_targets: { $exists: false } },
    { $set: { fulfilled_targets: [] } },
  );
  await database.collection("quests").createIndex({ owner_id: 1 });

  const activeAuctionIds = (
    await database
      .collection("auctions")
      .find({})
      .project({ _id: 1 })
      .toArray()
  ).map((auction) => auction._id);
  await database.collection("players").updateMany(
    { "profile.dismissed_private_auction_ids": { $exists: true } },
    [
      {
        $set: {
          "profile.dismissed_private_auction_ids": {
            $filter: {
              input: {
                $ifNull: ["$profile.dismissed_private_auction_ids", []],
              },
              as: "auctionId",
              cond: { $in: ["$$auctionId", activeAuctionIds] },
            },
          },
        },
      },
    ],
  );

  await database.collection("players").bulkWrite([
    {
      updateMany: {
        filter: {
          $or: [
            { "profile.social_battery": { $exists: false } },
            { "profile.social_battery_reset_at": { $exists: false } },
          ],
        },
        update: {
          $set: {
            "profile.social_battery": 6_000,
            "profile.social_battery_reset_at": socialBatteryResetAt,
          },
        },
      },
    },
    {
      updateMany: {
        filter: { "profile.playthrough_stats.visitors_met": { $exists: false } },
        update: { $set: { "profile.playthrough_stats.visitors_met": 0 } },
      },
    },
    {
      updateMany: {
        filter: {
          "profile.playthrough_stats.quests_completed": { $exists: false },
        },
        update: { $set: { "profile.playthrough_stats.quests_completed": 0 } },
      },
    },
    {
      updateMany: {
        filter: {
          "profile.playthrough_stats.items_collected": { $exists: false },
        },
        update: { $set: { "profile.playthrough_stats.items_collected": 0 } },
      },
    },
    {
      updateMany: {
        filter: { "profile.playthrough_stats.money_spent": { $exists: false } },
        update: { $set: { "profile.playthrough_stats.money_spent": 0 } },
      },
    },
    {
      updateMany: {
        filter: {
          "profile.playthrough_stats.playthrough_count": { $exists: false },
        },
        update: { $set: { "profile.playthrough_stats.playthrough_count": 0 } },
      },
    },
  ]);

  await database.collection("playthrough_snapshots").updateMany(
    { "stats.quests_completed": { $exists: false } },
    { $set: { "stats.quests_completed": 0 } },
  );
}

const MASTERPIECE_EFFECTS = [
  ["masterpiece-historian-forgery-copy", "Z7wY5jXkDeckwfFLs", "MP_FORGERY_COPY", "Forgery Echo", "Creating a forgery may create a second copy.", { chance: 0.15 }],
  ["masterpiece-historian-archive", "Z7wY5jXkDeckwfFLs", "MP_HISTORIAN_ARCHIVE", "Living Archive", "Quest turn-ins and donations archive their target; Historians are less likely to detect forgeries.", { detection_reduction: 0.35 }],
  ["masterpiece-preservation-mint", "zR2KgxYe4LQZKBAiE", "MP_PRESERVATION_MINT", "Perfect Preservation", "This artwork is always mint and may be displayed without breaking its seal.", {}],
  ["masterpiece-expert-perfect-reroll", "nwMiN3DFBgsKBNSar", "MP_FREE_PERFECT_REROLL", "Perfect Revision", "The first reroll of an item with no prior reroll spending is free and rolls 100%.", {}],
  ["masterpiece-historian-forgery-return", "Z7wY5jXkDeckwfFLs", "MP_FORGERY_RETURN", "Persistent Provenance", "An undetected forgery that leaves play may return briefly to its creator.", { chance: 0.2, expiration_minutes: 10 }],
  ["masterpiece-benefactor-bank-interest", "Lacw8fkPYvSQrmpQN", "MP_BANK_INTEREST", "Patronage Dividend", "Earn daily interest on bank balance excluding escrow.", { rate: 0.03 }],
  ["masterpiece-auctioneer-escrow-interest", "FgRMQA6s24wmTRyrx", "MP_ESCROW_INTEREST", "Escrow Yield", "Earn daily interest on active auction escrow.", { rate: 0.06 }],
  ["masterpiece-collector-buyout", "dTSjqBx45mRTvFJeh", "MP_COLLECTOR_BUYOUT", "Total Acquisition", "Platinum Collectors may buy every item offered for sale.", { chance: 0.2 }],
  ["masterpiece-donor-foil", "Yk2kk2mZtHetvbrY5", "MP_DONOR_FOIL", "Gilded Gift", "Legendary and masterpiece gifts from platinum Donors are always foil.", {}],
  ["masterpiece-dealer-unlocked", "mZH58WpgbKP9o9WZR", "MP_DEALER_UNLOCKED", "Open Edition", "Legendary and masterpiece offers from platinum Dealers are always unlocked.", {}],
  ["masterpiece-enthusiast-uncommon-xp", "T8v35e75v4Hh2JpxQ", "MP_UNCOMMON_GALLERY_XP", "Accessible Enthusiasm", "Displayed uncommon artwork adds an extra gallery XP chunk.", { xp_chunks: 0.5 }],
  ["masterpiece-auctioneer-transferable", "FgRMQA6s24wmTRyrx", "MP_TRANSFERABLE_AUCTION", "Public Commission", "Private auctions can be made public and pay you a commission when sold.", { commission_rate: 0.1 }],
  ["masterpiece-enthusiast-common-substitution", "T8v35e75v4Hh2JpxQ", "MP_COMMON_ATTRIBUTE_SUBSTITUTION", "Curated Commons", "Common displays contribute this effect item's attributes instead of their own.", {}],
  ["masterpiece-enthusiast-rare-double", "T8v35e75v4Hh2JpxQ", "MP_RARE_VISITOR_DOUBLE", "Rare Appeal", "Attributes on rare displays receive two visitor generation passes.", {}],
  ["masterpiece-auctioneer-authentication", "FgRMQA6s24wmTRyrx", "MP_AUCTION_AUTHENTICATION_REFUND", "Guaranteed Provenance", "Auction wins authenticate freely; detected forgeries are destroyed and partially refunded.", { refund_rate: 0.75 }],
];

const LEGACY_MP_CODE_PREFIX = "MASTERPIECE_";
const MP_CODE_PREFIX = "MP_";
const LEGACY_TRANSFERABLE_AUCTION_DESCRIPTION =
  "Reserved definition for transferable private auctions and public commission.";
const TRANSFERABLE_AUCTION_DESCRIPTION =
  "Private auctions can be made public and pay you a commission when sold.";
const LEGACY_QUEST_CONDITION_EFFECT_CODE =
  "QUEST_TARGET_CONDITION_INCREASE";
const QUEST_CONDITION_BONUS_EFFECT = {
  _id: "nLrk4a43tYroaZErk",
  code: "QUEST_COMLETION_CONDITION_BONUS",
  title: "Quest Completion Condition Bonus",
  description:
    "Submitting a quest target above 60% condition awards 10% of the quest's money reward.",
  flavor_text: "It's a revelation. Unlike anything I've ever seen.",
  linked_attributes: ["Z7wY5jXkDeckwfFLs", "zR2KgxYe4LQZKBAiE"],
  parameters: {
    condition_minimum: 0.6,
    reward_coefficient: 0.1,
  },
};
const COLLECTOR_QUEST_ITEM_EFFECT = {
  code: "COLLECTOR_QUEST_ITEM",
  legacy_description:
    "Art Collectors occasionally give quest items in addition to money.",
  description:
    "Art Collectors multiply rewards by 2 when buying quest targets.",
  reward_multiplier: 2,
};
const LEGACY_AUCTION_BUY_NOW_EFFECT_CODE =
  "AUCTION_COUNT_DEALER_BONUS";
const AUCTION_BUY_NOW_EFFECT = {
  _id: "w7ZrD4oEn4Ti6DpZX",
  code: "AUCTION_BUY_NOW",
  title: "Auction Buy Now",
  description:
    "Private auctions created by Auctioneers in your gallery have a buy-now price 10% above the starting bid.",
  flavor_text: "More than deserving of its praise.",
  linked_attributes: ["FgRMQA6s24wmTRyrx", "mZH58WpgbKP9o9WZR"],
  parameters: {
    buy_now_multiplier: 1.1,
  },
};
const LEGACY_ART_COLLECTOR_AUCTION_EFFECT_CODE =
  "ART_COLLECTOR_AUCTION_BONUS";
const ART_COLLECTOR_AUCTION_EFFECT = {
  _id: "Ax59qQtmPfKddruEA",
  code: "ART_COLLECTOR_AUCTION",
  title: "Art Collector Auction",
  description:
    "Artwork sold to Collectors in your gallery has a 20% chance to enter a public auction that pays you a 10% commission when sold.",
  flavor_text: "In a word... sublime.",
  linked_attributes: ["FgRMQA6s24wmTRyrx", "dTSjqBx45mRTvFJeh"],
  parameters: {
    chance: 0.2,
    commission_coefficient: 0.1,
  },
};

function getMpEffectCode(code) {
  return code.startsWith(LEGACY_MP_CODE_PREFIX)
    ? `${MP_CODE_PREFIX}${code.slice(LEGACY_MP_CODE_PREFIX.length)}`
    : code;
}

async function migrateMasterpieceEffectCodes(database, now) {
  await database.collection("artwork_effects").updateMany(
    {
      effect_type: "masterpiece",
      code: { $regex: `^${LEGACY_MP_CODE_PREFIX}` },
    },
    [
      {
        $set: {
          code: {
            $replaceOne: {
              input: "$code",
              find: LEGACY_MP_CODE_PREFIX,
              replacement: MP_CODE_PREFIX,
            },
          },
          updated_at: now,
        },
      },
    ],
  );

  for (const suffix of ["BANK_INTEREST", "ESCROW_INTEREST"]) {
    const legacyPath = `profile.artwork_effect_settlements.${LEGACY_MP_CODE_PREFIX}${suffix}`;
    const currentPath = `profile.artwork_effect_settlements.${MP_CODE_PREFIX}${suffix}`;
    await database.collection("players").updateMany(
      {
        [legacyPath]: { $exists: true },
        [currentPath]: { $exists: false },
      },
      { $rename: { [legacyPath]: currentPath } },
    );
    await database.collection("players").updateMany(
      {
        [legacyPath]: { $exists: true },
        [currentPath]: { $exists: true },
      },
      { $unset: { [legacyPath]: "" } },
    );
  }

  const settlementCollection = database.collection("artwork_effect_settlements");
  const legacySettlements = await settlementCollection
    .find({ effect_code: { $regex: `^${LEGACY_MP_CODE_PREFIX}` } })
    .toArray();
  if (legacySettlements.length > 0) {
    await settlementCollection.bulkWrite(
      legacySettlements.flatMap((settlement) => {
        const effectCode = getMpEffectCode(settlement.effect_code);
        const id = `${settlement.settlement_date}:${settlement.player_id}:${effectCode}`;
        const { _id: legacyId, ...storedSettlement } = settlement;
        return [
          {
            updateOne: {
              filter: { _id: id },
              update: {
                $setOnInsert: {
                  ...storedSettlement,
                  effect_code: effectCode,
                },
              },
              upsert: true,
            },
          },
          { deleteOne: { filter: { _id: legacyId } } },
        ];
      }),
      { ordered: true },
    );
  }
}

async function migrateTransferableAuctionEffect(database, now) {
  await database.collection("artwork_effects").updateMany(
    {
      effect_type: "masterpiece",
      code: "MP_TRANSFERABLE_AUCTION",
      description: LEGACY_TRANSFERABLE_AUCTION_DESCRIPTION,
    },
    {
      $set: {
        description: TRANSFERABLE_AUCTION_DESCRIPTION,
        flavor_text: TRANSFERABLE_AUCTION_DESCRIPTION,
        updated_at: now,
      },
    },
  );
}

async function migrateQuestConditionBonusEffect(database, now) {
  const effects = database.collection("artwork_effects");
  const existing =
    (await effects.findOne({ _id: QUEST_CONDITION_BONUS_EFFECT._id })) ??
    (await effects.findOne({ code: QUEST_CONDITION_BONUS_EFFECT.code })) ??
    (await effects.findOne({ code: LEGACY_QUEST_CONDITION_EFFECT_CODE }));
  const effectId = existing?._id ?? QUEST_CONDITION_BONUS_EFFECT._id;
  if (!existing) {
    await effects.insertOne({
      ...QUEST_CONDITION_BONUS_EFFECT,
      effect_type: "legendary",
      linked_pair: QUEST_CONDITION_BONUS_EFFECT.linked_attributes.join(":"),
      active: true,
      created_at: now,
      updated_at: now,
    });
  } else if (existing.code !== QUEST_CONDITION_BONUS_EFFECT.code) {
    await effects.updateOne(
      { _id: effectId },
      {
        $set: {
          effect_type: "legendary",
          code: QUEST_CONDITION_BONUS_EFFECT.code,
          title: QUEST_CONDITION_BONUS_EFFECT.title,
          description: QUEST_CONDITION_BONUS_EFFECT.description,
          flavor_text: QUEST_CONDITION_BONUS_EFFECT.flavor_text,
          linked_attributes: QUEST_CONDITION_BONUS_EFFECT.linked_attributes,
          linked_pair: QUEST_CONDITION_BONUS_EFFECT.linked_attributes.join(":"),
          parameters: QUEST_CONDITION_BONUS_EFFECT.parameters,
          updated_at: now,
        },
      },
    );
  }

  await database.collection("unique_attributes").updateMany(
    {
      $or: [
        { _id: effectId },
        { code: LEGACY_QUEST_CONDITION_EFFECT_CODE },
      ],
      code: { $ne: QUEST_CONDITION_BONUS_EFFECT.code },
    },
    {
      $set: {
        code: QUEST_CONDITION_BONUS_EFFECT.code,
        title: QUEST_CONDITION_BONUS_EFFECT.title,
        description: QUEST_CONDITION_BONUS_EFFECT.description,
        flavor_text: QUEST_CONDITION_BONUS_EFFECT.flavor_text,
        linked_attributes: QUEST_CONDITION_BONUS_EFFECT.linked_attributes,
        linked_pair: QUEST_CONDITION_BONUS_EFFECT.linked_attributes.join(":"),
        parameters: QUEST_CONDITION_BONUS_EFFECT.parameters,
        catalog_version: 6,
        updated_at: now,
      },
    },
  );
}

async function migrateCollectorQuestItemEffect(database, now) {
  for (const collectionName of ["unique_attributes", "artwork_effects"]) {
    const effects = database.collection(collectionName);
    await effects.updateMany(
      {
        code: COLLECTOR_QUEST_ITEM_EFFECT.code,
        description: COLLECTOR_QUEST_ITEM_EFFECT.legacy_description,
      },
      {
        $set: {
          description: COLLECTOR_QUEST_ITEM_EFFECT.description,
          updated_at: now,
        },
      },
    );
    await effects.updateMany(
      {
        code: COLLECTOR_QUEST_ITEM_EFFECT.code,
        $or: [
          { parameters: { $exists: false } },
          { parameters: null },
        ],
      },
      {
        $set: {
          parameters: {
            reward_multiplier:
              COLLECTOR_QUEST_ITEM_EFFECT.reward_multiplier,
          },
          updated_at: now,
        },
      },
    );
    await effects.updateMany(
      {
        code: COLLECTOR_QUEST_ITEM_EFFECT.code,
        parameters: { $type: "object" },
        "parameters.reward_multiplier": { $exists: false },
      },
      {
        $set: {
          "parameters.reward_multiplier":
            COLLECTOR_QUEST_ITEM_EFFECT.reward_multiplier,
          updated_at: now,
        },
      },
    );
  }
}

async function migrateAuctionBuyNowEffect(database, now) {
  const effects = database.collection("artwork_effects");
  const existing =
    (await effects.findOne({ _id: AUCTION_BUY_NOW_EFFECT._id })) ??
    (await effects.findOne({ code: AUCTION_BUY_NOW_EFFECT.code })) ??
    (await effects.findOne({ code: LEGACY_AUCTION_BUY_NOW_EFFECT_CODE }));
  const effectId = existing?._id ?? AUCTION_BUY_NOW_EFFECT._id;
  if (!existing) {
    await effects.insertOne({
      ...AUCTION_BUY_NOW_EFFECT,
      effect_type: "legendary",
      linked_pair: AUCTION_BUY_NOW_EFFECT.linked_attributes.join(":"),
      active: true,
      created_at: now,
      updated_at: now,
    });
  } else if (existing.code !== AUCTION_BUY_NOW_EFFECT.code) {
    await effects.updateOne(
      { _id: effectId },
      {
        $set: {
          effect_type: "legendary",
          code: AUCTION_BUY_NOW_EFFECT.code,
          title: AUCTION_BUY_NOW_EFFECT.title,
          description: AUCTION_BUY_NOW_EFFECT.description,
          flavor_text: AUCTION_BUY_NOW_EFFECT.flavor_text,
          linked_attributes: AUCTION_BUY_NOW_EFFECT.linked_attributes,
          linked_pair: AUCTION_BUY_NOW_EFFECT.linked_attributes.join(":"),
          parameters: AUCTION_BUY_NOW_EFFECT.parameters,
          updated_at: now,
        },
      },
    );
  }

  await database.collection("unique_attributes").updateMany(
    {
      $or: [
        { _id: effectId },
        { code: LEGACY_AUCTION_BUY_NOW_EFFECT_CODE },
      ],
      code: { $ne: AUCTION_BUY_NOW_EFFECT.code },
    },
    {
      $set: {
        code: AUCTION_BUY_NOW_EFFECT.code,
        title: AUCTION_BUY_NOW_EFFECT.title,
        description: AUCTION_BUY_NOW_EFFECT.description,
        flavor_text: AUCTION_BUY_NOW_EFFECT.flavor_text,
        linked_attributes: AUCTION_BUY_NOW_EFFECT.linked_attributes,
        linked_pair: AUCTION_BUY_NOW_EFFECT.linked_attributes.join(":"),
        parameters: AUCTION_BUY_NOW_EFFECT.parameters,
        catalog_version: 6,
        updated_at: now,
      },
    },
  );
}

async function migrateArtCollectorAuctionEffect(database, now) {
  const effects = database.collection("artwork_effects");
  const existing =
    (await effects.findOne({ _id: ART_COLLECTOR_AUCTION_EFFECT._id })) ??
    (await effects.findOne({ code: ART_COLLECTOR_AUCTION_EFFECT.code })) ??
    (await effects.findOne({
      code: LEGACY_ART_COLLECTOR_AUCTION_EFFECT_CODE,
    }));
  const effectId = existing?._id ?? ART_COLLECTOR_AUCTION_EFFECT._id;
  if (!existing) {
    await effects.insertOne({
      ...ART_COLLECTOR_AUCTION_EFFECT,
      effect_type: "legendary",
      linked_pair: ART_COLLECTOR_AUCTION_EFFECT.linked_attributes.join(":"),
      active: true,
      created_at: now,
      updated_at: now,
    });
  } else if (existing.code !== ART_COLLECTOR_AUCTION_EFFECT.code) {
    await effects.updateOne(
      { _id: effectId },
      {
        $set: {
          effect_type: "legendary",
          code: ART_COLLECTOR_AUCTION_EFFECT.code,
          title: ART_COLLECTOR_AUCTION_EFFECT.title,
          description: ART_COLLECTOR_AUCTION_EFFECT.description,
          flavor_text: ART_COLLECTOR_AUCTION_EFFECT.flavor_text,
          linked_attributes: ART_COLLECTOR_AUCTION_EFFECT.linked_attributes,
          linked_pair:
            ART_COLLECTOR_AUCTION_EFFECT.linked_attributes.join(":"),
          parameters: ART_COLLECTOR_AUCTION_EFFECT.parameters,
          updated_at: now,
        },
      },
    );
  }

  await database.collection("unique_attributes").updateMany(
    {
      $or: [
        { _id: effectId },
        { code: LEGACY_ART_COLLECTOR_AUCTION_EFFECT_CODE },
      ],
      code: { $ne: ART_COLLECTOR_AUCTION_EFFECT.code },
    },
    {
      $set: {
        code: ART_COLLECTOR_AUCTION_EFFECT.code,
        title: ART_COLLECTOR_AUCTION_EFFECT.title,
        description: ART_COLLECTOR_AUCTION_EFFECT.description,
        flavor_text: ART_COLLECTOR_AUCTION_EFFECT.flavor_text,
        linked_attributes: ART_COLLECTOR_AUCTION_EFFECT.linked_attributes,
        linked_pair:
          ART_COLLECTOR_AUCTION_EFFECT.linked_attributes.join(":"),
        parameters: ART_COLLECTOR_AUCTION_EFFECT.parameters,
        catalog_version: 6,
        updated_at: now,
      },
    },
  );
}

async function normalizeArtworkEffectParameters(database) {
  const canonicalDefaults = [
    ...LEGENDARY_ATTRIBUTE_PAIRS.map(([, , code, , , parameters]) => [
      code,
      parameters,
    ]),
    ...MASTERPIECE_EFFECTS.map(([, , code, , , parameters]) => [
      code,
      parameters,
    ]),
  ];

  for (const collectionName of ["artwork_effects", "unique_attributes"]) {
    const effects = database.collection(collectionName);
    for (const [code, parameters] of canonicalDefaults) {
      const defaults = Object.fromEntries(
        Object.entries(parameters).filter(
          ([, value]) =>
            typeof value === "string" ||
            typeof value === "boolean" ||
            (typeof value === "number" && Number.isFinite(value)),
        ),
      );
      if (Object.keys(defaults).length === 0) continue;

      await effects.updateMany(
        {
          code,
          $or: [
            { parameters: { $exists: false } },
            { parameters: null },
          ],
        },
        { $set: { parameters: defaults } },
      );

      for (const [key, value] of Object.entries(defaults)) {
        await effects.updateMany(
          {
            code,
            parameters: { $type: "object" },
            [`parameters.${key}`]: { $exists: false },
          },
          { $set: { [`parameters.${key}`]: value } },
        );
      }
    }
  }
}

export async function migrateArtworkEffects(database) {
  const now = new Date().toISOString();
  const legacy = await database.collection("unique_attributes").find({}).toArray();
  if (legacy.length > 0) {
    await database.collection("artwork_effects").bulkWrite(
      legacy.map((effect) => ({
        updateOne: {
          filter: { _id: effect._id },
          update: {
            $setOnInsert: {
              ...effect,
              effect_type: "legendary",
              linked_attributes: [...new Set(effect.linked_attributes ?? [])].sort(),
              created_at: effect.created_at ?? now,
              updated_at: effect.updated_at ?? now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  await database.collection("artwork_effects").bulkWrite(
    MASTERPIECE_EFFECTS.map(([id, attributeId, code, title, description, parameters]) => ({
      updateOne: {
        filter: { _id: id },
        update: {
          $setOnInsert: {
            effect_type: "masterpiece",
            linked_attributes: [attributeId],
            code,
            title,
            description,
            flavor_text: description,
            active: true,
            parameters,
            created_at: now,
            updated_at: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  await migrateQuestConditionBonusEffect(database, now);
  await migrateCollectorQuestItemEffect(database, now);
  await migrateAuctionBuyNowEffect(database, now);
  await migrateArtCollectorAuctionEffect(database, now);
  await migrateMasterpieceEffectCodes(database, now);
  await migrateTransferableAuctionEffect(database, now);
  await normalizeArtworkEffectParameters(database);

  await database.collection("artwork_effects").createIndex(
    { code: 1 },
    { unique: true },
  );
  await database.collection("artwork_effects").createIndex({
    effect_type: 1,
    active: 1,
  });
  await database.collection("artwork_effects").createIndex({
    linked_attributes: 1,
  });
  await database.collection("artworks").createIndex({ effect_id: 1 });

  const effects = await database.collection("artwork_effects").find({}).toArray();
  const effectById = new Map(effects.map((effect) => [effect._id, effect]));
  const legendaryByPair = new Map(
    effects
      .filter((effect) => effect.effect_type === "legendary")
      .map((effect) => [[...(effect.linked_attributes ?? [])].sort().join(":"), effect._id]),
  );
  const masterpieceByAttribute = new Map();
  for (const effect of effects.filter((candidate) => candidate.effect_type === "masterpiece")) {
    const attributeId = effect.linked_attributes?.[0];
    if (!attributeId) continue;
    masterpieceByAttribute.set(attributeId, [
      ...(masterpieceByAttribute.get(attributeId) ?? []),
      effect._id,
    ]);
  }
  const artworks = await database.collection("artworks").find({
    rarity: { $in: ["legendary", "masterpiece"] },
  }).toArray();
  const operations = [];
  for (const artwork of artworks) {
    const currentEffect =
      typeof artwork.effect_id === "string"
        ? effectById.get(artwork.effect_id)
        : undefined;
    if (currentEffect?.effect_type === artwork.rarity) {
      if (artwork.active === true && currentEffect.active !== true) {
        operations.push({
          updateOne: {
            filter: { _id: artwork._id, active: true },
            update: { $set: { active: false } },
          },
        });
      }
      continue;
    }
    const special = [...new Set(artwork.special_attributes ?? [])];
    let effectId;
    if (artwork.rarity === "legendary") {
      effectId = (artwork.unique_attributes ?? []).find(
        (candidateId) =>
          effectById.get(candidateId)?.effect_type === "legendary",
      );
      effectId ??= legendaryByPair.get([...special].sort().join(":"));
    } else {
      const candidates = special.flatMap(
        (attributeId) => masterpieceByAttribute.get(attributeId) ?? [],
      );
      effectId = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (!effectId) {
      throw new Error(`Unable to backfill ${artwork.rarity} artwork ${artwork._id}.`);
    }
    const effect = effectById.get(effectId);
    operations.push({
      updateOne: {
        filter: { _id: artwork._id },
        update: {
          $set: {
            effect_id: effectId,
            ...(artwork.active === true && effect?.active !== true
              ? { active: false }
              : {}),
          },
        },
      },
    });
  }
  if (operations.length > 0) {
    await database.collection("artworks").bulkWrite(operations, { ordered: false });
  }
  const migratedArtworks = await database.collection("artworks").find({
    rarity: { $in: ["legendary", "masterpiece"] },
  }).project({ _id: 1, rarity: 1, effect_id: 1 }).toArray();
  const invalid = migratedArtworks.filter((artwork) => {
    const effect =
      typeof artwork.effect_id === "string"
        ? effectById.get(artwork.effect_id)
        : undefined;
    return (
      effect?.effect_type !== artwork.rarity ||
      (artwork.active === true && effect.active !== true)
    );
  });
  if (invalid.length > 0) {
    throw new Error(
      `${invalid.length} legendary/masterpiece artwork records remain without matching effects: ${invalid.map((artwork) => artwork._id).join(", ")}.`,
    );
  }
  await database.collection("artworks").updateMany(
    {
      rarity: { $in: ["legendary", "masterpiece"] },
      effect_id: { $type: "string" },
    },
    {
      $unset: {
        special_attributes: "",
        unique_attributes: "",
      },
    },
  );
}

function getNextSocialBatteryResetAt(now) {
  const timeZone = "America/New_York";
  const localNow = getTimeZoneParts(now, timeZone);
  const targetDate = new Date(
    Date.UTC(localNow.year, localNow.month - 1, localNow.day),
  );
  if (localNow.hour >= 7) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }
  return getUtcDateForTimeZone(
    {
      year: targetDate.getUTCFullYear(),
      month: targetDate.getUTCMonth() + 1,
      day: targetDate.getUTCDate(),
      hour: 7,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getUtcDateForTimeZone(target, timeZone) {
  const targetWallClock = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );
  let candidate = targetWallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getTimeZoneParts(new Date(candidate), timeZone);
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate += targetWallClock - actualWallClock;
  }
  return new Date(candidate);
}

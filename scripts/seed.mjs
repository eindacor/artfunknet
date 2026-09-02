import { mkdir } from "node:fs/promises";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";

import { MongoClient, ServerApiVersion } from "mongodb";

import {
  createArtworkSubmission,
  discoverArtworkFiles,
} from "./artwork-import.mjs";
import {
  LEGENDARY_ATTRIBUTE_IDS,
  LEGENDARY_ATTRIBUTE_PAIRS,
  LEGENDARY_ATTRIBUTE_RECORD_IDS,
} from "./legendary-attribute-data.mjs";

const projectRoot = process.cwd();
const artworkImportDirectory = path.resolve(
  projectRoot,
  process.env.ARTWORK_IMPORT_DIR ?? "public/uploaded_images",
);
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error(
    "MONGODB_URI is not configured. Copy .env.example to .env.local.",
  );
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

try {
  await client.connect();
  const database = client.db(databaseName);

  await createIndexes(database);
  await seedGameMetadata(database);
  await seedGameplaySettings(database);
  await seedAttributes(database);
  await seedLegendaryAttributes(database);
  await seedArtworkSpecialAttributes(database);
  const adminSeeded = await seedAdmin(database);
  const playerSeeded = await seedPlayer(database);
  const testPlayersSeeded = await seedTestPlayers(database);
  await migrateCardRenderers(database);
  const artworkResult = await seedArtworkSubmissions(database);
  await migrateItems(database);

  console.log(`Seeded database: ${databaseName}`);
  console.log(`Admin account seeded: ${adminSeeded ? "yes" : "no"}`);
  console.log(`Development player seeded: ${playerSeeded ? "yes" : "no"}`);
  console.log(`Test player accounts available: ${testPlayersSeeded}`);
  console.log(`Artwork import directory: ${artworkImportDirectory}`);
  console.log(`Discovered images: ${artworkResult.discovered}`);
  console.log(`New unverified submissions: ${artworkResult.inserted}`);
  console.log(`Previously imported submissions: ${artworkResult.existing}`);
} finally {
  await client.close();
}

async function createIndexes(database) {
  await database
    .collection("artwork_submissions")
    .createIndex({ status: 1, "review.imported_at": 1 });
  await database
    .collection("artwork_submissions")
    .createIndex({ "image.sha256": 1 }, { unique: true });
  await database
    .collection("artists")
    .createIndex({ artist_name: 1 }, { unique: true, sparse: true });
  await database
    .collection("artworks")
    .createIndex({ artist_id: 1, title: 1 }, { unique: true, sparse: true });
  await database
    .collection("players")
    .createIndex({ email: 1 }, { unique: true });
  await database
    .collection("players")
    .createIndex({ screen_name: 1 }, { unique: true });
  await database
    .collection("players")
    .createIndex({ test_account: 1, screen_name: 1 });
  await database
    .collection("items")
    .createIndex({ owner: 1, status: 1, date_created: -1 });
  await database
    .collection("unique_attributes")
    .createIndex(
      { linked_pair: 1 },
      {
        unique: true,
        partialFilterExpression: { linked_pair: { $type: "string" } },
      },
    );
  await database
    .collection("unique_attributes")
    .createIndex(
      { code: 1 },
      {
        unique: true,
        partialFilterExpression: { code: { $type: "string" } },
      },
    );
  await database
    .collection("player_notifications")
    .createIndex({ user_id: 1, created_at: -1 });
  await database
    .collection("items")
    .updateMany({ debug: { $exists: false } }, { $set: { debug: false } });
  await database
    .collection("npcs")
    .createIndex({ spawn_key: 1 }, { unique: true });
  await database
    .collection("npcs")
    .createIndex({ owner_id: 1, expiration: 1 });
  await database
    .collection("npcs")
    .createIndex({ expiration: 1 }, { expireAfterSeconds: 0 });
  await database
    .collection("quests")
    .createIndex({ owner_id: 1, created_at: -1 });
  await database
    .collection("auctions")
    .createIndex({ viewer: 1, expiration: 1 });
  await database
    .collection("auctions")
    .createIndex({ seller_id: 1, expiration: 1 });
  await database
    .collection("auctions")
    .createIndex({ item_id: 1 }, { unique: true });
}

async function seedAdmin(database) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return false;
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  const now = new Date();

  await database.collection("admin_users").updateOne(
    { _id: email },
    {
      $set: {
        email,
        role: "admin",
        active: true,
        password_salt: salt,
        password_hash: passwordHash,
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true },
  );

  return true;
}

async function seedPlayer(database) {
  const email = process.env.PLAYER_EMAIL?.trim().toLowerCase();
  const password = process.env.PLAYER_PASSWORD;
  const screenName = process.env.PLAYER_SCREEN_NAME?.trim();

  if (!email || !password || !screenName) {
    return false;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  const playerId = createHash("sha256")
    .update(email)
    .digest("hex")
    .slice(0, 24);

  await seedDefaultGalleryFinishes(database);
  await database.collection("players").updateOne(
    { _id: playerId },
    {
      $set: {
        email,
        username: email,
        screen_name: screenName,
        role: "player",
        test_account: false,
        active: true,
        password_salt: salt,
        password_hash: passwordHash,
        updated_at: now,
      },
      $setOnInsert: {
        profile: {
          user_type: "player",
          screen_name: screenName,
          active: true,
          bank_balance: 100_000,
          card_style_consumables: {},
          last_drop: yesterdayIso,
          level: 0,
          xp: 0,
          lottery_tickets: 1,
          entry_fee: "medium",
          inventory_cap: 15,
          display_cap: 5,
          auction_cap: 8,
          ticket_cap: 3,
          pc_cap: 12,
          visitor_cap: 20,
          repairing_cap: 4,
          forgery_contract_cap: 8,
          npcs_met: {
            bronze: 0,
            silver: 0,
            gold: 0,
            platinum: 0,
          },
          completed_quests: 0,
          market_expert: {
            expiration: yesterdayIso,
          },
          last_login: nowIso,
          last_logout: nowIso,
          last_activity: nowIso,
          last_gallery_payout: nowIso,
          gallery_money_remainder: 0,
          gallery_xp_remainder: 0,
          last_name_change: nowIso,
          auction_data: {
            winning: [],
            watching: [],
          },
          expansion_slots: 0,
          money_spent_on_crates: 0,
          vintage_select: false,
          vintage_count: 0,
          visitor_ignore_coefficient: 0,
          visitor_ignore_proc_count: 0,
          favorite_galleries: [],
          notifications: {
            procs: [],
            money: [],
            xp: [],
            loot: [],
            store: [],
          },
          settings: {
            quick_purchase: false,
            auction_items_to_inventory: true,
            animations_enabled: false,
            lottery_eligible: true,
            show_npc_modals: true,
            ignore_archive_recommendations: false,
            auto_archive_upgrades: false,
            show_patreon_status: true,
            show_visitor_tooltips: true,
            quick_sell_options: {
              foil: false,
              legendary: false,
              masterpiece: false,
              original: false,
              quest_items: false,
              seasonal: false,
              standard: true,
              sought: true,
              unfound: false,
              unlocked: false,
              vintage: false,
              lottery: false,
              patreon: false,
            },
          },
          tutorial_data: {
            current_tutorial: "artfunkel basics",
            step: 0,
            completed: [],
          },
          crate_purchases: {},
          knowledge: {
            historical_data: 0,
            contextual_understanding: 0,
            technical_comprehension: 0,
            artistic_vision: 0,
          },
          gallery_finishes: {
            active: {
              floor_finish: "carpet-gray",
              wall_finish: "plaster",
            },
            owned: {
              floor_finishes: {
                "carpet-gray": {
                  filename: "carpet_gray.jpg",
                  saturation: 1,
                  xp_rating: 0.1,
                },
              },
              wall_finishes: {
                plaster: {
                  filename: "plaster.jpg",
                  saturation: 1,
                  xp_rating: 0.1,
                },
              },
            },
            wall_opacity: 1,
            frame_width: 0.5,
            matte_width: 0.5,
            wall_base: "white",
            frame_color: "black",
          },
        },
        created_at: now,
      },
    },
    { upsert: true },
  );

  return true;
}

async function seedTestPlayers(database) {
  const sourceEmail = process.env.PLAYER_EMAIL?.trim().toLowerCase();
  if (!sourceEmail) return 0;

  const sourcePlayer = await database
    .collection("players")
    .findOne({ email: sourceEmail });
  if (!sourcePlayer?.profile) return 0;

  const now = new Date();
  const nowIso = now.toISOString();
  const password = randomBytes(32).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  const players = database.collection("players");
  const testAccountCount = 5;

  for (let index = 1; index <= testAccountCount; index += 1) {
    const email = `test-player-${index}@artfunkel.local`;
    const screenName = `Test Player ${index}`;
    const playerId = createHash("sha256")
      .update(email)
      .digest("hex")
      .slice(0, 24);
    const profile = structuredClone(sourcePlayer.profile);
    profile.screen_name = screenName;
    profile.last_login = nowIso;
    profile.last_logout = nowIso;
    profile.last_activity = nowIso;
    profile.last_gallery_payout = nowIso;

    await players.updateOne(
      { _id: playerId },
      {
        $set: {
          email,
          username: email,
          screen_name: screenName,
          role: "player",
          test_account: true,
          active: true,
          password_salt: salt,
          password_hash: passwordHash,
          updated_at: now,
        },
        $setOnInsert: {
          profile,
          created_at: now,
        },
      },
      { upsert: true },
    );
  }

  return testAccountCount;
}

async function migrateCardRenderers(database) {
  const migration = await database
    .collection("metadata")
    .findOne({ _id: "card-renderer-migrations" });
  const currentVersion = migration?.version ?? 0;

  if (currentVersion < 1) {
    await database.collection("players").updateMany(
      { "profile.card_renderer": "legacy" },
      { $set: { "profile.card_renderer": "museum" } },
    );
    await database.collection("items").updateMany(
      { card_renderer: "legacy" },
      { $set: { card_renderer: "museum" } },
    );
    await database.collection("players").updateMany(
      { "profile.owned_card_renderers": "legacy" },
      { $pull: { "profile.owned_card_renderers": "legacy" } },
    );
    await database.collection("players").updateMany(
      { role: "player" },
      { $addToSet: { "profile.owned_card_renderers": "museum" } },
    );
  }

  if (currentVersion < 2) {
    await database.collection("players").updateMany(
      { role: "player" },
      {
        $set: {
          "profile.card_renderer": "museum",
          "profile.card_style_consumables": {},
        },
        $unset: { "profile.owned_card_renderers": "" },
      },
    );
  }

  if (currentVersion < 3) {
    await database.collection("players").updateMany(
      { role: "player" },
      { $unset: { "profile.card_renderer": "" } },
    );
    await database.collection("items").updateMany(
      { card_renderer: "museum" },
      { $unset: { card_renderer: "" } },
    );
  }

  if (currentVersion >= 3) return;

  const now = new Date();
  await database.collection("metadata").updateOne(
    { _id: "card-renderer-migrations" },
    {
      $set: {
        version: 3,
        updated_at: now,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );
}

async function seedDefaultGalleryFinishes(database) {
  const finishes = [
    {
      _id: "plaster",
      type: "wall finish",
      filename: "plaster.jpg",
      name: "Plaster",
      level: 0,
      quality: "bronze",
      xp_rating: 0.1,
    },
    {
      _id: "carpet-gray",
      type: "floor finish",
      filename: "carpet_gray.jpg",
      name: "Gray Carpet",
      level: 0,
      quality: "bronze",
      xp_rating: 0.1,
    },
  ];

  for (const finish of finishes) {
    await database
      .collection("gallery_finishes")
      .updateOne({ _id: finish._id }, { $setOnInsert: finish }, { upsert: true });
  }
}

async function seedGameMetadata(database) {
  const now = new Date();
  const seasonalRotation = {
    common: now,
    uncommon: now,
    rare: now,
    legendary: now,
    masterpiece: now,
  };

  await database.collection("metadata").updateOne(
    { _id: "loot-data" },
    {
      $setOnInsert: {
        loot_data: {
          rarity_values: {
            common: { min: 5_000, max: 25_000 },
            uncommon: { min: 25_000, max: 65_000 },
            rare: { min: 65_000, max: 225_000 },
            legendary: { min: 225_000, max: 1_505_000 },
            masterpiece: { min: 1_505_000, max: 21_985_000 },
          },
          basic_crate_cost: 30_000_000,
          items_per_basic_crate: 12,
          crate_expense_per_masterpiece: 3_600_000_000,
          seasonal_items: {
            common: [],
            uncommon: [],
            rare: [],
            legendary: [],
            masterpiece: [],
          },
          seasonal_rotation: seasonalRotation,
          global_foil_chance: 0.005,
          global_patreon_chance: 0.05,
          global_unlocked_chance: 0.05,
          global_misprint_chance: 0.0001,
        },
        created_at: now,
      },
      $set: {
        schema_version: 1,
        updated_at: now,
      },
    },
    { upsert: true },
  );
}

async function seedGameplaySettings(database) {
  const now = new Date();
  const existing = await database
    .collection("metadata")
    .findOne({ _id: "gameplay-settings" });
  const lootMetadata = await database
    .collection("metadata")
    .findOne({ _id: "loot-data" });
  const legacy = existing?.gameplay ?? {};
  const legacyFoilProbability =
    lootMetadata?.loot_data?.global_foil_chance ?? 0.005;
  const legacyUnlockedProbability =
    lootMetadata?.loot_data?.global_unlocked_chance ?? 0.05;
  const actualCardStyleWeights = {
    legacy: 1,
    terminal: 200,
    postcard: 160,
    gilded: 80,
    arcade: 60,
    prismatic: 25,
    blueprint: 140,
    zine: 100,
    celestial: 35,
    reliquary: 15,
    baseball: 70,
    minimalist: 180,
    bauhaus: 90,
    abstract: 75,
    circle: 45,
  };
  const debugCardStyleWeights = Object.fromEntries(
    Object.keys(actualCardStyleWeights).map((id) => [id, 1]),
  );
  const actual = {
    daily_drop_cooldown_minutes:
      legacy.daily_drop_cooldown_minutes ?? 5,
    daily_drop_count: legacy.daily_drop_count ?? 6,
    card_renderer_probability: 0.01,
    foil_probability: legacyFoilProbability,
    mint_probability: 0.0005,
    mint_value_multiplier: 2,
    unlocked_probability: legacyUnlockedProbability,
    gallery_payout_interval_minutes:
      legacy.gallery_payout_interval_minutes ?? 60,
    display_level_interval_minutes: 60,
    display_level_cap: 20,
    condition_decay_interval_minutes: 60,
    npc_spawn_interval_minutes: 10,
    rarity_weights: legacy.rarity_weights ?? {
      common: 0.623266875,
      uncommon: 0.267114375,
      rare: 0.09893125,
      legendary: 0.009993056,
      masterpiece: 0.000694444,
    },
    card_style_weights: actualCardStyleWeights,
  };
  const debug = {
    daily_drop_cooldown_minutes: 1,
    daily_drop_count: 20,
    card_renderer_probability: 0.25,
    foil_probability: 0.5,
    mint_probability: 0.25,
    mint_value_multiplier: 2,
    unlocked_probability: 0.5,
    gallery_payout_interval_minutes: 1,
    display_level_interval_minutes: 1,
    display_level_cap: 20,
    condition_decay_interval_minutes: 1,
    npc_spawn_interval_minutes: 1,
    rarity_weights: {
      common: 1,
      uncommon: 1,
      rare: 1,
      legendary: 1,
      masterpiece: 1,
    },
    card_style_weights: debugCardStyleWeights,
  };
  const setter = {
    schema_version: 7,
    updated_at: now,
  };
  if (legacy.debug_enabled === undefined) {
    setter["gameplay.debug_enabled"] = false;
  }
  if (!legacy.configs?.actual) {
    setter["gameplay.configs.actual"] = actual;
  }
  if (!legacy.configs?.debug) {
    setter["gameplay.configs.debug"] = debug;
  }
  if (
    legacy.configs?.actual &&
    legacy.configs.actual.foil_probability === undefined
  ) {
    setter["gameplay.configs.actual.foil_probability"] =
      legacyFoilProbability;
  }
  if (
    legacy.configs?.debug &&
    legacy.configs.debug.foil_probability === undefined
  ) {
    setter["gameplay.configs.debug.foil_probability"] = 0.5;
  }
  if (
    legacy.configs?.actual &&
    legacy.configs.actual.unlocked_probability === undefined
  ) {
    setter["gameplay.configs.actual.unlocked_probability"] =
      legacyUnlockedProbability;
  }
  if (
    legacy.configs?.debug &&
    legacy.configs.debug.unlocked_probability === undefined
  ) {
    setter["gameplay.configs.debug.unlocked_probability"] = 0.5;
  }
  if (
    legacy.configs?.actual &&
    legacy.configs.actual.card_renderer_probability === undefined
  ) {
    setter["gameplay.configs.actual.card_renderer_probability"] = 0.01;
  }
  if (
    legacy.configs?.debug &&
    legacy.configs.debug.card_renderer_probability === undefined
  ) {
    setter["gameplay.configs.debug.card_renderer_probability"] = 0.25;
  }
  if (
    legacy.configs?.actual &&
    legacy.configs.actual.card_style_weights === undefined
  ) {
    setter["gameplay.configs.actual.card_style_weights"] =
      actualCardStyleWeights;
  }
  if (
    legacy.configs?.debug &&
    legacy.configs.debug.card_style_weights === undefined
  ) {
    setter["gameplay.configs.debug.card_style_weights"] =
      debugCardStyleWeights;
  }
  if (
    legacy.configs?.actual &&
    legacy.configs.actual.mint_probability === undefined
  ) {
    setter["gameplay.configs.actual.mint_probability"] = 0.0005;
  }
  if (
    legacy.configs?.debug &&
    legacy.configs.debug.mint_probability === undefined
  ) {
    setter["gameplay.configs.debug.mint_probability"] = 0.25;
  }
  if (
    legacy.configs?.actual &&
    legacy.configs.actual.mint_value_multiplier === undefined
  ) {
    setter["gameplay.configs.actual.mint_value_multiplier"] = 2;
  }
  if (
    legacy.configs?.debug &&
    legacy.configs.debug.mint_value_multiplier === undefined
  ) {
    setter["gameplay.configs.debug.mint_value_multiplier"] = 2;
  }

  await database.collection("metadata").updateOne(
    { _id: "gameplay-settings" },
    {
      $setOnInsert: { created_at: now },
      $set: setter,
    },
    { upsert: true },
  );
  await database.collection("metadata").updateOne(
    { _id: "gameplay-settings" },
    {
      $unset: {
        "gameplay.rarity_override_enabled": "",
        "gameplay.configs.actual.rarity_override_enabled": "",
        "gameplay.configs.debug.rarity_override_enabled": "",
      },
    },
  );
}

async function migrateItems(database) {
  const items = await database.collection("items").find({}).toArray();
  if (items.length === 0) return;

  const artworkIds = [...new Set(items.map((item) => item.artwork_id))];
  const artworks = await database
    .collection("artworks")
    .find({ _id: { $in: artworkIds } })
    .toArray();
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));
  const operations = items.map((item) => {
    const setter = {};
    const unsetter = {};
    if (item.artwork_data) {
      const artwork = artworkById.get(item.artwork_id);
      if (!artwork) {
        throw new Error(
          `Cannot migrate item ${item._id}: artwork ${item.artwork_id} is missing.`,
        );
      }
      const overrides = {};
      if (item.artwork_data.artist !== artwork.artist) {
        overrides.artist = item.artwork_data.artist;
      }
      if (item.artwork_data.title !== artwork.title) {
        overrides.title = item.artwork_data.title;
      }
      setter.misprint = Object.keys(overrides).length > 0;
      if (setter.misprint) {
        setter.artwork_overrides = overrides;
      } else {
        unsetter.artwork_overrides = "";
      }
      unsetter.artwork_data = "";
    } else if (item.misprint === undefined) {
      setter.misprint = false;
    }
    if (!Array.isArray(item.transaction_history)) {
      setter.transaction_history = [
        {
          type: "generation",
          from_owner: null,
          to_owner: item.owner,
          occurred_at: item.date_created ?? new Date().toISOString(),
          source: "legacy migration",
        },
      ];
    }
    if (item.reroll_spent === undefined) {
      setter.reroll_spent = 0;
    }
    if (item.mint === undefined) {
      setter.mint = false;
    }
    if (item.mint_value_multiplier === undefined) {
      setter.mint_value_multiplier = 1;
    }
    const eligibleUniqueAttributes =
      artworkById.get(item.artwork_id)?.unique_attributes ?? [];
    if (eligibleUniqueAttributes.includes(item.active_unique_attribute)) {
      setter.active_unique_attribute = item.active_unique_attribute;
    } else if (eligibleUniqueAttributes.length > 0) {
      setter.active_unique_attribute = eligibleUniqueAttributes[0];
    } else {
      unsetter.active_unique_attribute = "";
    }

    const update = { $set: setter };
    if (Object.keys(unsetter).length > 0) {
      update.$unset = unsetter;
    }
    return { updateOne: { filter: { _id: item._id }, update } };
  });

  await database.collection("items").bulkWrite(operations, { ordered: false });
}

async function seedAttributes(database) {
  const removedAttributeIds = [
    "yTNQsF9KuRqSX5Wwq",
    "9aC5ZcgsepsRjuihA",
    "t2fCtFr2GGGhAzDmT",
  ];
  const attributeData = [
    ["KsQiutk7Qm4DFWLST", "set_xp_visitors", "set xp bonus to visitors", "fa-arrow-circle-up", "Set Bonus", false],
    ["FgRMQA6s24wmTRyrx", "auctioneer_bonus", "auctioneer bonus", "fa-bullhorn", "Auctioneer", true],
    ["mZH58WpgbKP9o9WZR", "dealer_bonus", "dealer bonus", "fa-shopping-cart", "Art Dealer", true],
    ["dTSjqBx45mRTvFJeh", "collector_bonus", "collector bonus", "fa-binoculars", "Art Collector", true],
    ["Yk2kk2mZtHetvbrY5", "donor_bonus", "donor bonus", "fa-share-square fa-flip-horizontal", "Art Donor", true],
    ["Lacw8fkPYvSQrmpQN", "benefactor_bonus", "benefactor bonus", "fa-money", "Benefactor", true],
    ["T8v35e75v4Hh2JpxQ", "enthusiast_bonus", "enthusiast bonus", "fa-smile-o", "Art Enthusiast", true],
    ["d4gvgMcZSbGs44ynr", "forger_bonus", "forger bonus", "fa-user-secret", "Art Forger", false],
    ["nwMiN3DFBgsKBNSar", "art_expert_bonus", "art expert bonus", "fa-info", "Art Expert", true],
    ["Z7wY5jXkDeckwfFLs", "historian_bonus", "historian bonus", "fa-university", "Art Historian", true],
    ["zR2KgxYe4LQZKBAiE", "preservationist_bonus", "preservationist bonus", "fa-wrench", "Preservationist", true],
  ];

  await Promise.all([
    database.collection("attributes").deleteMany({
      _id: { $in: removedAttributeIds },
    }),
    database.collection("npcs").deleteMany({
      attribute_id: { $in: removedAttributeIds },
    }),
    database.collection("items").updateMany(
      {},
      {
        $pull: {
          "attributes.locked": { _id: { $in: removedAttributeIds } },
          "attributes.unlocked": { _id: { $in: removedAttributeIds } },
          "attributes.special": { _id: { $in: removedAttributeIds } },
        },
      },
    ),
  ]);

  for (const [id, title, description, icon, npcName, active] of attributeData) {
    await database.collection("attributes").updateOne(
      { _id: id },
      {
        $set: { active },
        $setOnInsert: {
          _id: id,
          title,
          type: "primary",
          description,
          value: 0,
          icon,
          npc_name: npcName,
        },
      },
      { upsert: true },
    );
  }
}

function normalizeLegendaryPair(attributeIds) {
  return [...attributeIds].sort().join(":");
}

async function seedLegendaryAttributes(database) {
  const removedAttributeIds = [
    "yTNQsF9KuRqSX5Wwq",
    "9aC5ZcgsepsRjuihA",
    "t2fCtFr2GGGhAzDmT",
  ];
  const now = new Date().toISOString();
  const desiredRecords = LEGENDARY_ATTRIBUTE_PAIRS.map(
    ([left, right, code, description, flavorText, parameters]) => {
      const linkedAttributes = [
        LEGENDARY_ATTRIBUTE_IDS[left],
        LEGENDARY_ATTRIBUTE_IDS[right],
      ].sort();
      const linkedPair = normalizeLegendaryPair(linkedAttributes);
      const id = LEGENDARY_ATTRIBUTE_RECORD_IDS[linkedPair];
      if (!id) {
        throw new Error(`Missing original Legendary Attribute ID for ${linkedPair}.`);
      }
      return {
        id,
        linkedAttributes,
        linkedPair,
        code,
        description,
        flavorText,
        parameters,
      };
    },
  );
  await database.collection("unique_attributes").deleteMany({
    linked_attributes: { $in: removedAttributeIds },
  });
  await database.collection("unique_attributes").deleteMany({
    $or: desiredRecords.map((record) => ({
      linked_pair: record.linkedPair,
      _id: { $ne: record.id },
    })),
  });
  await database.collection("unique_attributes").bulkWrite(
    desiredRecords.map((record) => ({
      updateOne: {
        filter: { _id: record.id, catalog_version: { $ne: 5 } },
        update: {
          $set: {
            title: record.code
              .toLowerCase()
              .split("_")
              .map((part) => part[0].toUpperCase() + part.slice(1))
              .join(" "),
            description: record.description,
            flavor_text: record.flavorText,
            code: record.code,
            active: true,
            parameters: record.parameters,
            catalog_version: 5,
            updated_at: now,
          },
        },
      },
    })),
    { ordered: false },
  );
  const operations = LEGENDARY_ATTRIBUTE_PAIRS.map(
    ([, , code, description, flavorText, parameters], index) => {
      const { id, linkedAttributes, linkedPair } = desiredRecords[index];
      return {
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              linked_attributes: linkedAttributes,
              linked_pair: linkedPair,
            },
            $setOnInsert: {
              _id: id,
              title: code
                .toLowerCase()
                .split("_")
                .map((part) => part[0].toUpperCase() + part.slice(1))
                .join(" "),
              description,
              flavor_text: flavorText,
              code,
              active: true,
              parameters,
              catalog_version: 5,
              created_at: now,
              updated_at: now,
            },
          },
          upsert: true,
        },
      };
    },
  );

  await database
    .collection("unique_attributes")
    .bulkWrite(operations, { ordered: false });
}

async function seedArtworkSpecialAttributes(database) {
  const activeAttributes = await database
    .collection("attributes")
    .find({ active: true })
    .sort({ _id: 1 })
    .toArray();
  const artworks = await database
    .collection("artworks")
    .find({})
    .sort({ rarity: 1, _id: 1 })
    .toArray();
  const legendaryAttributes = await database
    .collection("unique_attributes")
    .find({ active: true })
    .toArray();
  const uniqueIdByPair = new Map(
    legendaryAttributes.map((attribute) => [
      attribute.linked_pair,
      attribute._id,
    ]),
  );
  const requiredCounts = {
    common: 0,
    uncommon: 0,
    rare: 1,
    legendary: 2,
    masterpiece: 3,
  };
  const activeAttributeIds = new Set(
    activeAttributes.map((attribute) => attribute._id),
  );

  if (activeAttributes.length === 0) {
    throw new Error("Active attributes must be seeded before artwork.");
  }

  let offset = 0;
  for (const artwork of artworks) {
    const required = requiredCounts[artwork.rarity] ?? 0;
    const existing = Array.isArray(artwork.special_attributes)
      ? artwork.special_attributes
      : [];
    let specialAttributes = existing;
    if (
      existing.length !== required ||
      existing.some((attributeId) => !activeAttributeIds.has(attributeId))
    ) {
      specialAttributes = [];
      for (let index = 0; index < required; index += 1) {
        specialAttributes.push(
          activeAttributes[(offset + index) % activeAttributes.length]._id,
        );
      }
      offset += Math.max(required, 1);
    }

    const uniqueAttributes = [];
    for (let left = 0; left < specialAttributes.length; left += 1) {
      for (let right = left + 1; right < specialAttributes.length; right += 1) {
        const uniqueId = uniqueIdByPair.get(
          normalizeLegendaryPair([
            specialAttributes[left],
            specialAttributes[right],
          ]),
        );
        if (uniqueId) uniqueAttributes.push(uniqueId);
      }
    }

    await database.collection("artworks").updateOne(
      { _id: artwork._id },
      {
        $set: {
          special_attributes: specialAttributes,
          unique_attributes: uniqueAttributes,
        },
      },
    );
  }
}

async function seedArtworkSubmissions(database) {
  await mkdir(artworkImportDirectory, { recursive: true });

  const collection = database.collection("artwork_submissions");
  const imageFiles = await discoverArtworkFiles(artworkImportDirectory);
  let inserted = 0;

  for (const imagePath of imageFiles) {
    const importedAt = new Date();
    const submission = await createArtworkSubmission(
      imagePath,
      projectRoot,
      importedAt,
    );
    const result = await collection.updateOne(
      { _id: submission._id },
      { $setOnInsert: submission },
      { upsert: true },
    );
    await collection.updateOne(
      { _id: submission._id },
      { $addToSet: { "image.sources": submission.image.sources[0] } },
    );

    inserted += result.upsertedCount;
  }

  return {
    discovered: imageFiles.length,
    inserted,
    existing: imageFiles.length - inserted,
  };
}

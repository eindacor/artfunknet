import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { migrateArtworkEffects } from "./database-migrations.mjs";

test("artwork effect migration backfills artwork without mutating item attributes", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("migration");
    await database.collection("unique_attributes").insertOne({
      _id: "legacy-effect",
      code: "LEGACY_EFFECT",
      title: "Legacy",
      description: "Legacy",
      flavor_text: "Legacy",
      active: false,
      linked_attributes: ["a", "b"],
      linked_pair: "a:b",
      parameters: {},
    });
    await database.collection("unique_attributes").insertOne({
      _id: "legacy-market-expert",
      code: "MARKET_EXPERT_QUEST_BONUS",
      title: "Admin-edited market bonus",
      description: "Admin-edited market bonus description",
      flavor_text: "Admin-edited market bonus flavor",
      active: false,
      linked_attributes: ["Z7wY5jXkDeckwfFLs", "FgRMQA6s24wmTRyrx"],
      linked_pair: "FgRMQA6s24wmTRyrx:Z7wY5jXkDeckwfFLs",
      parameters: null,
    });
    await database.collection("artwork_effects").insertOne({
      _id: "masterpiece-historian-forgery-copy",
      effect_type: "masterpiece",
      linked_attributes: ["Z7wY5jXkDeckwfFLs"],
      code: "MASTERPIECE_FORGERY_COPY",
      title: "Admin-edited title",
      description: "Admin-edited description",
      flavor_text: "Admin-edited flavor text",
      active: false,
      parameters: { chance: 0.42 },
    });
    await database.collection("artwork_effects").insertOne({
      _id: "masterpiece-historian-forgery-return",
      effect_type: "masterpiece",
      linked_attributes: ["Z7wY5jXkDeckwfFLs"],
      code: "MP_FORGERY_RETURN",
      title: "Admin-edited forgery return",
      description: "Admin-edited forgery return description",
      flavor_text: "Admin-edited forgery return flavor",
      active: false,
      parameters: { chance: 0.42, admin_tuning: 7 },
    });
    await database.collection("artwork_effects").insertOne({
      _id: "masterpiece-auctioneer-transferable",
      effect_type: "masterpiece",
      linked_attributes: ["FgRMQA6s24wmTRyrx"],
      code: "MP_TRANSFERABLE_AUCTION",
      title: "Public Commission",
      description:
        "Reserved definition for transferable private auctions and public commission.",
      flavor_text:
        "Reserved definition for transferable private auctions and public commission.",
      active: false,
      parameters: {},
    });
    await database.collection("artwork_effects").insertOne({
      _id: "private-auction-price-reduction",
      effect_type: "legendary",
      linked_attributes: ["FgRMQA6s24wmTRyrx", "Lacw8fkPYvSQrmpQN"],
      linked_pair: "FgRMQA6s24wmTRyrx:Lacw8fkPYvSQrmpQN",
      code: "PRIVATE_AUCTION_PRICE_REDUCTION",
      title: "Admin-edited private auction price",
      description: "Admin-edited private auction price description",
      flavor_text: "Admin-edited private auction price flavor",
      active: false,
      parameters: null,
    });
    await database.collection("artwork_effects").insertOne({
      _id: "xp-for-auctions",
      effect_type: "legendary",
      linked_attributes: ["FgRMQA6s24wmTRyrx", "T8v35e75v4Hh2JpxQ"],
      linked_pair: "FgRMQA6s24wmTRyrx:T8v35e75v4Hh2JpxQ",
      code: "XP_FOR_AUCTIONS",
      title: "Admin-edited auction XP",
      description: "Admin-edited auction XP description",
      flavor_text: "Admin-edited auction XP flavor",
      active: false,
    });
    await database.collection("artwork_effects").insertOne({
      _id: "nLrk4a43tYroaZErk",
      effect_type: "legendary",
      linked_attributes: ["Z7wY5jXkDeckwfFLs", "zR2KgxYe4LQZKBAiE"],
      linked_pair: "Z7wY5jXkDeckwfFLs:zR2KgxYe4LQZKBAiE",
      code: "QUEST_TARGET_CONDITION_INCREASE",
      title: "Quest Target Condition Increase",
      description: "Legacy description",
      flavor_text: "Legacy flavor",
      active: false,
      parameters: { condition_target: 0.9 },
    });
    await database.collection("artwork_effects").insertOne({
      _id: "4MyoRmTzkjCHijA5a",
      effect_type: "legendary",
      linked_attributes: ["Z7wY5jXkDeckwfFLs", "dTSjqBx45mRTvFJeh"],
      linked_pair: "Z7wY5jXkDeckwfFLs:dTSjqBx45mRTvFJeh",
      code: "COLLECTOR_QUEST_ITEM",
      title: "Collector Quest Item",
      description:
        "Art Collectors occasionally give quest items in addition to money.",
      flavor_text: "Legacy flavor",
      active: false,
      parameters: {},
    });
    await database.collection("artwork_effects").insertOne({
      _id: "w7ZrD4oEn4Ti6DpZX",
      effect_type: "legendary",
      linked_attributes: ["FgRMQA6s24wmTRyrx", "mZH58WpgbKP9o9WZR"],
      linked_pair: "FgRMQA6s24wmTRyrx:mZH58WpgbKP9o9WZR",
      code: "AUCTION_COUNT_DEALER_BONUS",
      title: "Auction Count Dealer Bonus",
      description:
        "Art Dealers give bonus items based on your number of active auctions.",
      flavor_text: "More than deserving of its praise.",
      active: false,
      parameters: {},
    });
    await database.collection("artwork_effects").insertOne({
      _id: "Ax59qQtmPfKddruEA",
      effect_type: "legendary",
      linked_attributes: ["FgRMQA6s24wmTRyrx", "dTSjqBx45mRTvFJeh"],
      linked_pair: "FgRMQA6s24wmTRyrx:dTSjqBx45mRTvFJeh",
      code: "ART_COLLECTOR_AUCTION_BONUS",
      title: "Art Collector Auction Bonus",
      description:
        "Art Collectors offer bonuses based on your currently auctioned items.",
      flavor_text: "In a word... sublime.",
      active: false,
      parameters: {},
    });
    await database.collection("artworks").insertMany([
      {
        _id: "legendary-art",
        rarity: "legendary",
        active: true,
        special_attributes: ["b", "a"],
        unique_attributes: ["legacy-effect"],
      },
      {
        _id: "legendary-art-null-effect",
        rarity: "legendary",
        effect_id: null,
        unique_attributes: ["legacy-effect"],
      },
      {
        _id: "legendary-art-invalid-effect",
        rarity: "legendary",
        effect_id: "missing-effect",
        special_attributes: ["a", "b"],
      },
      {
        _id: "masterpiece-art",
        rarity: "masterpiece",
        special_attributes: ["Z7wY5jXkDeckwfFLs", "other", "another"],
      },
      {
        _id: "quest-condition-art",
        rarity: "legendary",
        effect_id: "nLrk4a43tYroaZErk",
      },
      {
        _id: "collector-auction-art",
        rarity: "legendary",
        effect_id: "Ax59qQtmPfKddruEA",
      },
    ]);
    const item = {
      _id: "existing-item",
      artwork_id: "masterpiece-art",
      attributes: {
        special: [{ _id: "other", value: 0.91 }],
        unlocked: [{ _id: "x", value: 0.4 }],
        locked: [{ _id: "y", value: 0.8 }],
      },
    };
    await database.collection("items").insertOne(item);
    const legacyMarker = {
      date: "2026-10-01",
      effect_id: "masterpiece-benefactor-bank-interest",
      base: 1000,
      rate: 0.03,
      amount: 30,
    };
    await database.collection("players").insertOne({
      _id: "player",
      profile: {
        artwork_effect_settlements: {
          MASTERPIECE_BANK_INTEREST: legacyMarker,
        },
      },
    });
    await database.collection("artwork_effect_settlements").insertOne({
      _id: "2026-10-01:player:MASTERPIECE_BANK_INTEREST",
      player_id: "player",
      effect_id: "masterpiece-benefactor-bank-interest",
      effect_code: "MASTERPIECE_BANK_INTEREST",
      settlement_date: "2026-10-01",
      status: "completed",
      base: 1000,
      rate: 0.03,
      amount: 30,
    });

    await migrateArtworkEffects(database);
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "nLrk4a43tYroaZErk" },
        {
          projection: {
            _id: 0,
            active: 1,
            code: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        code: "QUEST_COMLETION_CONDITION_BONUS",
        title: "Quest Completion Condition Bonus",
        description:
          "Submitting a quest target above 60% condition awards 10% of the quest's money reward.",
        parameters: {
          condition_minimum: 0.6,
          reward_coefficient: 0.1,
        },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "4MyoRmTzkjCHijA5a" },
        {
          projection: {
            _id: 0,
            active: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        description:
          "Art Collectors multiply rewards by 2 when buying quest targets.",
        parameters: { reward_multiplier: 2 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "w7ZrD4oEn4Ti6DpZX" },
        {
          projection: {
            _id: 0,
            active: 1,
            code: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        code: "AUCTION_BUY_NOW",
        title: "Auction Buy Now",
        description:
          "Private auctions created by Auctioneers in your gallery have a buy-now price 10% above the starting bid.",
        parameters: { buy_now_multiplier: 1.1 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "Ax59qQtmPfKddruEA" },
        {
          projection: {
            _id: 0,
            active: 1,
            code: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        code: "ART_COLLECTOR_AUCTION",
        title: "Art Collector Auction",
        description:
          "Artwork sold to Collectors in your gallery has a 20% chance to enter a public auction that pays you a 10% commission when sold.",
        parameters: {
          chance: 0.2,
          commission_coefficient: 0.1,
        },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "private-auction-price-reduction" },
        {
          projection: {
            _id: 0,
            active: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        title: "Admin-edited private auction price",
        description: "Admin-edited private auction price description",
        parameters: { price_multiplier: 2.5 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "xp-for-auctions" },
        {
          projection: {
            _id: 0,
            active: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        title: "Admin-edited auction XP",
        description: "Admin-edited auction XP description",
        parameters: { xp_chunk_percentage: 0.5 },
      },
    );
    assert.deepEqual(
      await database.collection("unique_attributes").findOne(
        { _id: "legacy-market-expert" },
        {
          projection: {
            _id: 0,
            active: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        title: "Admin-edited market bonus",
        description: "Admin-edited market bonus description",
        parameters: { multiplier_per_winning_auction: 0.1 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "masterpiece-historian-forgery-return" },
        {
          projection: {
            _id: 0,
            active: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        title: "Admin-edited forgery return",
        description: "Admin-edited forgery return description",
        parameters: {
          chance: 0.42,
          expiration_minutes: 10,
          admin_tuning: 7,
        },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "masterpiece-auctioneer-transferable" },
        {
          projection: {
            _id: 0,
            active: 1,
            description: 1,
            flavor_text: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        description:
          "Private auctions can be made public and pay you a commission when sold.",
        flavor_text:
          "Private auctions can be made public and pay you a commission when sold.",
        parameters: { commission_rate: 0.1 },
      },
    );
    const normalizedEffects = await Promise.all([
      database.collection("artwork_effects").findOne({
        _id: "private-auction-price-reduction",
      }),
      database.collection("artwork_effects").findOne({
        _id: "xp-for-auctions",
      }),
      database.collection("unique_attributes").findOne({
        _id: "legacy-market-expert",
      }),
      database.collection("artwork_effects").findOne({
        _id: "masterpiece-historian-forgery-return",
      }),
      database.collection("artwork_effects").findOne({
        _id: "masterpiece-auctioneer-transferable",
      }),
    ]);
    await migrateArtworkEffects(database);
    assert.deepEqual(
      await Promise.all([
        database.collection("artwork_effects").findOne({
          _id: "private-auction-price-reduction",
        }),
        database.collection("artwork_effects").findOne({
          _id: "xp-for-auctions",
        }),
        database.collection("unique_attributes").findOne({
          _id: "legacy-market-expert",
        }),
        database.collection("artwork_effects").findOne({
          _id: "masterpiece-historian-forgery-return",
        }),
        database.collection("artwork_effects").findOne({
          _id: "masterpiece-auctioneer-transferable",
        }),
      ]),
      normalizedEffects,
    );
    await database.collection("artwork_effects").updateOne(
      { _id: "nLrk4a43tYroaZErk" },
      {
        $set: {
          title: "Admin-edited quest bonus",
          parameters: {
            condition_minimum: 0.7,
            reward_coefficient: 0.25,
          },
        },
      },
    );
    await database.collection("artwork_effects").updateOne(
      { _id: "4MyoRmTzkjCHijA5a" },
      {
        $set: {
          description: "Admin-edited Collector quest reward",
          "parameters.reward_multiplier": 3,
        },
      },
    );
    await database.collection("artwork_effects").updateOne(
      { _id: "w7ZrD4oEn4Ti6DpZX" },
      {
        $set: {
          title: "Admin-edited auction buy now",
          "parameters.buy_now_multiplier": 1.25,
        },
      },
    );
    await database.collection("artwork_effects").updateOne(
      { _id: "Ax59qQtmPfKddruEA" },
      {
        $set: {
          title: "Admin-edited Collector auction",
          parameters: {
            chance: 0.35,
            commission_coefficient: 0.2,
          },
        },
      },
    );
    await database.collection("artwork_effects").updateOne(
      { _id: "masterpiece-auctioneer-transferable" },
      {
        $set: {
          description: "Admin-edited public commission",
          flavor_text: "Admin-edited public commission flavor",
          "parameters.commission_rate": 0.3,
        },
      },
    );
    await migrateArtworkEffects(database);

    const legendary = await database
      .collection("artworks")
      .findOne({ _id: "legendary-art" });
    const masterpiece = await database
      .collection("artworks")
      .findOne({ _id: "masterpiece-art" });
    assert.equal(legendary.effect_id, "legacy-effect");
    assert.equal(legendary.active, false);
    assert.equal(
      (
        await database.collection("artworks").findOne({
          _id: "legendary-art-null-effect",
        })
      ).effect_id,
      "legacy-effect",
    );
    assert.equal(
      (
        await database.collection("artworks").findOne({
          _id: "legendary-art-invalid-effect",
        })
      ).effect_id,
      "legacy-effect",
    );
    assert.equal(typeof masterpiece.effect_id, "string");
    assert.equal(legendary.special_attributes, undefined);
    assert.equal(legendary.unique_attributes, undefined);
    assert.equal(masterpiece.special_attributes, undefined);
    assert.equal(masterpiece.unique_attributes, undefined);
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "masterpiece-historian-forgery-copy" },
        { projection: { _id: 0, active: 1, code: 1, parameters: 1, title: 1 } },
      ),
      {
        active: false,
        code: "MP_FORGERY_COPY",
        parameters: { chance: 0.42 },
        title: "Admin-edited title",
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "4MyoRmTzkjCHijA5a" },
        {
          projection: {
            _id: 0,
            active: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        description: "Admin-edited Collector quest reward",
        parameters: { reward_multiplier: 3 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "w7ZrD4oEn4Ti6DpZX" },
        {
          projection: {
            _id: 0,
            active: 1,
            code: 1,
            title: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        code: "AUCTION_BUY_NOW",
        title: "Admin-edited auction buy now",
        parameters: { buy_now_multiplier: 1.25 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "Ax59qQtmPfKddruEA" },
        {
          projection: {
            _id: 0,
            active: 1,
            code: 1,
            title: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        code: "ART_COLLECTOR_AUCTION",
        title: "Admin-edited Collector auction",
        parameters: {
          chance: 0.35,
          commission_coefficient: 0.2,
        },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "masterpiece-auctioneer-transferable" },
        {
          projection: {
            _id: 0,
            active: 1,
            description: 1,
            flavor_text: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        description: "Admin-edited public commission",
        flavor_text: "Admin-edited public commission flavor",
        parameters: { commission_rate: 0.3 },
      },
    );
    assert.deepEqual(
      await database.collection("artwork_effects").findOne(
        { _id: "nLrk4a43tYroaZErk" },
        {
          projection: {
            _id: 0,
            active: 1,
            code: 1,
            title: 1,
            description: 1,
            parameters: 1,
          },
        },
      ),
      {
        active: false,
        code: "QUEST_COMLETION_CONDITION_BONUS",
        title: "Admin-edited quest bonus",
        description:
          "Submitting a quest target above 60% condition awards 10% of the quest's money reward.",
        parameters: {
          condition_minimum: 0.7,
          reward_coefficient: 0.25,
        },
      },
    );
    assert.equal(
      (
        await database.collection("artworks").findOne({
          _id: "quest-condition-art",
        })
      ).effect_id,
      "nLrk4a43tYroaZErk",
    );
    assert.equal(
      (
        await database.collection("artworks").findOne({
          _id: "collector-auction-art",
        })
      ).effect_id,
      "Ax59qQtmPfKddruEA",
    );
    assert.equal(
      await database.collection("artwork_effects").countDocuments({
        code: "QUEST_TARGET_CONDITION_INCREASE",
      }),
      0,
    );
    assert.equal(
      await database.collection("artwork_effects").countDocuments({
        code: "AUCTION_COUNT_DEALER_BONUS",
      }),
      0,
    );
    assert.equal(
      await database.collection("artwork_effects").countDocuments({
        code: "ART_COLLECTOR_AUCTION_BONUS",
      }),
      0,
    );
    assert.deepEqual(
      (await database.collection("items").findOne({ _id: item._id }))
        .attributes,
      item.attributes,
    );
    const player = await database.collection("players").findOne({
      _id: "player",
    });
    assert.equal(
      player.profile.artwork_effect_settlements.MASTERPIECE_BANK_INTEREST,
      undefined,
    );
    assert.deepEqual(
      player.profile.artwork_effect_settlements.MP_BANK_INTEREST,
      legacyMarker,
    );
    assert.equal(
      await database.collection("artwork_effect_settlements").countDocuments({
        _id: "2026-10-01:player:MASTERPIECE_BANK_INTEREST",
      }),
      0,
    );
    assert.deepEqual(
      await database.collection("artwork_effect_settlements").findOne(
        { _id: "2026-10-01:player:MP_BANK_INTEREST" },
        { projection: { _id: 0, effect_code: 1, amount: 1 } },
      ),
      { effect_code: "MP_BANK_INTEREST", amount: 30 },
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

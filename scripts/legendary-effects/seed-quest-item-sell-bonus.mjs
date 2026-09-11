import { MongoClient } from "mongodb";
import { calculateItemValues } from "../../src/server/gameplay.ts";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const playerEmail = process.env.PLAYER_EMAIL?.trim().toLowerCase();

if (!uri || !playerEmail) {
  throw new Error("MONGODB_URI and PLAYER_EMAIL must be configured in .env.local.");
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(databaseName);

const metadata = await db.collection("metadata").findOne({ _id: "loot-data" });
if (!metadata) {
  throw new Error("Metadata has not been seeded. Did you run npm run db:seed?");
}

const player = await db.collection("players").findOne({ email: playerEmail });
if (!player) {
  throw new Error(`Player ${playerEmail} not found. Did you run npm run db:seed?`);
}

// 1. Ensure QUEST_ITEM_SELL_BONUS exists in unique_attributes collection
const QUEST_ITEM_SELL_BONUS_ID = "attr-quest-sell-bonus";
await db.collection("unique_attributes").updateOne(
  { code: "QUEST_ITEM_SELL_BONUS" },
  {
    $setOnInsert: {
      _id: QUEST_ITEM_SELL_BONUS_ID,
    },
    $set: {
      code: "QUEST_ITEM_SELL_BONUS",
      title: "Quest Item Sell Bonus",
      description: "Selling quest items gives double the selling fee.",
      flavor_text: "A truly brilliant piece.",
      active: true,
      parameters: { sell_multiplier: 2 },
      linked_attributes: ["Lacw8fkPYvSQrmpQN", "nwMiN3DFBgsKBNSar"],
      linked_pair: "Lacw8fkPYvSQrmpQN:nwMiN3DFBgsKBNSar",
    },
  },
  { upsert: true }
);

const questSellAttr = await db.collection("unique_attributes").findOne({ code: "QUEST_ITEM_SELL_BONUS" });

// 2. Find or create a legendary artwork for the displayed item
let legendaryArtwork = await db.collection("artworks").findOne({ rarity: "legendary", active: true });
if (!legendaryArtwork) {
  legendaryArtwork = await db.collection("artworks").findOne({ active: true });
}

const attributes = await db.collection("attributes").find({ active: true }).toArray();

// 3. Insert or update a displayed item with QUEST_ITEM_SELL_BONUS active
const legendaryItemBase = {
  _id: "dev-quest-sell-item-" + Date.now(),
  artwork_id: legendaryArtwork._id,
  condition: 1.0,
  mint: false,
  mint_value_multiplier: 1,
  attributes: {
    locked: [],
    unlocked: [],
    special: attributes.slice(0, 2).map((a) => ({ ...a, value: 0.8 })),
  },
  active_unique_attribute: questSellAttr._id,
  tags: [],
  owner: player._id,
  transaction_history: [
    {
      type: "generation",
      from_owner: null,
      to_owner: player._id,
      occurred_at: new Date().toISOString(),
      source: "dev-seed-quest-sell-bonus",
    },
  ],
  status: "displayed",
  source: "dev-seed",
  date_created: new Date().toISOString(),
  date_received: new Date().toISOString(),
  level: 1,
  roll_count: 0,
  reroll_spent: 0,
  foil: false,
  unlocked: true,
  seasonal: false,
  lottery: 0,
  original: false,
  patreon: false,
  vintage: false,
  authenticity: {
    forgery: false,
    forgery_quality: 0,
    liable: player._id,
    liability_pending: false,
    identified: true,
    fee: 0,
    original_owner: player._id,
  },
};

const computedLegendaryValues = calculateItemValues(legendaryItemBase, legendaryArtwork, metadata.loot_data);
const legendaryItem = { ...legendaryItemBase, values: computedLegendaryValues };
await db.collection("items").insertOne(legendaryItem);

// 4. Find target artwork for active quest
const targetArtwork = await db.collection("artworks").findOne({
  _id: { $ne: legendaryArtwork._id },
  active: true,
});

// 5. Ensure an active quest exists for the player targeting targetArtwork
const questId = "dev-quest-target-" + Date.now();
await db.collection("quests").insertOne({
  _id: questId,
  owner_id: player._id,
  target: [targetArtwork._id],
  reward: {
    money: 1000,
    xp: 500,
    xp_chunk_percentage: 0.5,
  },
  created_at: new Date().toISOString(),
});

// 6. Spawn a claimed target item in player's inventory to test selling
const sellableItemBase = {
  _id: "dev-quest-target-item-" + Date.now(),
  artwork_id: targetArtwork._id,
  condition: 1.0,
  mint: false,
  mint_value_multiplier: 1,
  attributes: {
    locked: [],
    unlocked: [],
    special: attributes.slice(0, 2).map((a) => ({ ...a, value: 0.5 })),
  },
  tags: [],
  owner: player._id,
  transaction_history: [
    {
      type: "generation",
      from_owner: null,
      to_owner: player._id,
      occurred_at: new Date().toISOString(),
      source: "dev-seed-quest-target-item",
    },
  ],
  status: "claimed",
  source: "dev-seed",
  date_created: new Date().toISOString(),
  date_received: new Date().toISOString(),
  level: 1,
  roll_count: 0,
  reroll_spent: 0,
  foil: false,
  unlocked: true,
  seasonal: false,
  lottery: 0,
  original: false,
  patreon: false,
  vintage: false,
  authenticity: {
    forgery: false,
    forgery_quality: 0,
    liable: player._id,
    liability_pending: false,
    identified: true,
    fee: 0,
    original_owner: player._id,
  },
};

const computedTargetValues = calculateItemValues(sellableItemBase, targetArtwork, metadata.loot_data);
const sellableItem = { ...sellableItemBase, values: computedTargetValues };
await db.collection("items").insertOne(sellableItem);

console.log("=========================================================");
console.log("QUEST_ITEM_SELL_BONUS Seeding Complete!");
console.log("=========================================================");
console.log(`- Player: ${playerEmail} (${player._id})`);
console.log(`- Displayed Legendary Item ID: ${legendaryItem._id}`);
console.log(`  Perk Active: QUEST_ITEM_SELL_BONUS (${questSellAttr._id})`);
console.log(`- Active Quest ID: ${questId}`);
console.log(`  Quest Target Artwork: "${targetArtwork.title}" by ${targetArtwork.artist} (ID: ${targetArtwork._id})`);
console.log(`- Seeded Sellable Quest Item in Inventory: ${sellableItem._id}`);
console.log(`  Base Sell Value: $${sellableItem.values.sell}`);
console.log(`  Expected Bonus Sell Price (2x): $${sellableItem.values.sell * 2}`);
console.log("\n--- Verification Instructions ---");
console.log(`1. Start dev server: npm run dev`);
console.log(`2. Login as ${playerEmail} and navigate to inventory at /play`);
console.log(`3. Sell item ${sellableItem._id} ("${targetArtwork.title}")`);
console.log(`4. Verify bank balance increases by $${sellableItem.values.sell * 2} instead of base $${sellableItem.values.sell}!`);
console.log("=========================================================");

await client.close();

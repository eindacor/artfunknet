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

// 1. Ensure DEALER_QUEST_ITEM_CHANCE exists in unique_attributes collection
const DEALER_QUEST_ITEM_CHANCE_ID = "C4tXdgANcahxEtScG";
await db.collection("unique_attributes").updateOne(
  { _id: DEALER_QUEST_ITEM_CHANCE_ID },
  {
    $set: {
      _id: DEALER_QUEST_ITEM_CHANCE_ID,
      code: "DEALER_QUEST_ITEM_CHANCE",
      title: "Dealer Quest Item Chance",
      description: "Art Dealers have an increased chance to offer quest items.",
      flavor_text: "Time has done little to dimish the power of this work.",
      active: true,
      parameters: { chance: 1.0 }, // Set to 1.0 for testing guarantee
      linked_attributes: ["mZH58WpgbKP9o9WZR", "Z7wY5jXkDeckwfFLs"],
      linked_pair: "mZH58WpgbKP9o9WZR:Z7wY5jXkDeckwfFLs",
    },
  },
  { upsert: true }
);

// 2. Find or create a legendary artwork for the displayed item
let legendaryArtwork = await db.collection("artworks").findOne({ rarity: "legendary", active: true });
if (!legendaryArtwork) {
  legendaryArtwork = await db.collection("artworks").findOne({ active: true });
}

const attributes = await db.collection("attributes").find({ active: true }).toArray();

// 3. Insert or update a displayed item with DEALER_QUEST_ITEM_CHANCE active
const legendaryItemBase = {
  _id: "dev-dealer-quest-item-" + Date.now(),
  artwork_id: legendaryArtwork._id,
  condition: 1.0,
  mint: false,
  mint_value_multiplier: 1,
  attributes: {
    locked: [],
    unlocked: [],
    special: attributes.slice(0, 2).map((a) => ({ ...a, value: 0.8 })),
  },
  active_unique_attribute: DEALER_QUEST_ITEM_CHANCE_ID,
  tags: [],
  owner: player._id,
  transaction_history: [
    {
      type: "generation",
      from_owner: null,
      to_owner: player._id,
      occurred_at: new Date().toISOString(),
      source: "dev-seed-dealer-quest",
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

const computedValues = calculateItemValues(legendaryItemBase, legendaryArtwork, metadata.loot_data);
const legendaryItem = { ...legendaryItemBase, values: computedValues };
await db.collection("items").insertOne(legendaryItem);

// 4. Find or create a target artwork for active quest
const targetArtwork = await db.collection("artworks").findOne({
  _id: { $ne: legendaryArtwork._id },
  active: true,
});

// 5. Ensure an active quest exists for the player targeting targetArtwork
const questId = "dev-quest-dealer-target-" + Date.now();
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

// 6. Spawn an Art Dealer NPC in the player's gallery
const dealerNpcId = "dev-dealer-npc-" + Date.now();
const ART_DEALER_ATTRIBUTE_ID = "mZH58WpgbKP9o9WZR";
await db.collection("npcs").insertOne({
  _id: dealerNpcId,
  spawn_key: "dev:" + dealerNpcId,
  quality: "gold",
  attribute_id: ART_DEALER_ATTRIBUTE_ID,
  owner_id: player._id,
  owner_name: player.screen_name ?? playerEmail,
  spawned_at: new Date(),
  expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
  players_met: [],
  icon: "/icons/dealer.png",
  npc_name: "Art Dealer (Dev Test)",
  proc_chance: 1.0,
});

console.log("=========================================================");
console.log("DEALER_QUEST_ITEM_CHANCE Seeding Complete!");
console.log("=========================================================");
console.log(`- Player: ${playerEmail} (${player._id})`);
console.log(`- Seeded Displayed Legendary Item: ${legendaryItem._id}`);
console.log(`  Perk Active: DEALER_QUEST_ITEM_CHANCE (${DEALER_QUEST_ITEM_CHANCE_ID})`);
console.log(`- Active Quest Target Artwork: "${targetArtwork.title}" by ${targetArtwork.artist} (ID: ${targetArtwork._id})`);
console.log(`- Spawned Art Dealer NPC ID: ${dealerNpcId}`);
console.log("\n--- Verification Instructions ---");
console.log(`1. Start dev server: npm run dev`);
console.log(`2. Login as ${playerEmail} and navigate to /play`);
console.log(`3. Meet the Art Dealer NPC or send POST /api/play/npcs/${dealerNpcId}/meet`);
console.log(`4. Verify that one of the dealer's offered artworks for sale is "${targetArtwork.title}"!`);
console.log("=========================================================");

await client.close();

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const playerEmail = process.env.PLAYER_EMAIL?.trim().toLowerCase();

if (!uri || !playerEmail) {
  throw new Error("MONGODB_URI and PLAYER_EMAIL must be configured in .env.local.");
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(databaseName);

const player = await db.collection("players").findOne({ email: playerEmail });
if (!player) {
  throw new Error(`Player ${playerEmail} not found. Did you run npm run db:seed?`);
}

const AUCTIONEER_ATTRIBUTE_ID = "FgRMQA6s24wmTRyrx";
const auctioneerNpcId = "dev-auctioneer-npc-" + Date.now();
const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000);

// 1. Spawn an Auctioneer NPC in the player's gallery
await db.collection("npcs").insertOne({
  _id: auctioneerNpcId,
  spawn_key: "dev:" + auctioneerNpcId,
  quality: "gold",
  attribute_id: AUCTIONEER_ATTRIBUTE_ID,
  owner_id: player._id,
  owner_name: player.screen_name ?? playerEmail,
  spawned_at: new Date(),
  expiration,
  players_met: [],
  icon: "fa-gavel",
  npc_name: "Auctioneer (Dev Test)",
  proc_chance: 1.0,
});

// 2. Reset player meeting limit counter for gold visitors
await db.collection("players").updateOne(
  { _id: player._id },
  {
    $set: {
      "profile.npcs_met.gold": 0,
      "profile.npcs_met_reset_at": new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  }
);

console.log("=========================================================");
console.log("Auctioneer Private Auctions Seeding Complete!");
console.log("=========================================================");
console.log(`- Player: ${playerEmail} (${player._id})`);
console.log(`- Spawned Auctioneer NPC ID: ${auctioneerNpcId}`);
console.log(`- Expiration: ${expiration.toISOString()}`);
console.log("\n--- Verification Instructions ---");
console.log(`1. Ensure dev server is running (npm run dev)`);
console.log(`2. Login as ${playerEmail} and navigate to /play`);
console.log(`3. Meet the "Auctioneer (Dev Test)" visitor in your gallery`);
console.log(`4. Verify that the private auctions modal window opens showing each generated item!`);
console.log(`5. Click on an item or "Bid" button in the modal to open item details & place a bid.`);
console.log("=========================================================");

await client.close();

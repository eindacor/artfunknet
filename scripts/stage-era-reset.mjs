import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "artfunkel";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);

    console.log(`Connected to MongoDB database: ${dbName}`);

    // Find first active player
    const player = await db.collection("players").findOne({ active: true });
    if (!player) {
      console.error("No active player account found to stage.");
      process.exit(1);
    }

    console.log(`Staging era reset for player: ${player.screen_name} (${player._id})`);

    // 1. Set level to 50
    await db.collection("players").updateOne(
      { _id: player._id },
      {
        $set: {
          "profile.level": 50,
          "profile.xp": 1000000,
        },
      },
    );

    // 2. Clear any active auctions involving this player
    await db.collection("auctions").deleteMany({
      $or: [{ seller_id: player._id }, { current_winner_id: player._id }],
    });

    // 3. Ensure player has at least 12 eligible items (non-vintage, non-original, status=claimed)
    const existingItems = await db
      .collection("items")
      .find({ owner: player._id, status: "claimed", vintage: { $ne: true }, original: { $ne: true } })
      .toArray();

    console.log(`Existing eligible items: ${existingItems.length}`);

    if (existingItems.length < 12) {
      const artworks = await db.collection("artworks").find({ active: true }).limit(15).toArray();
      const itemsToInsert = [];
      const now = new Date().toISOString();

      for (let i = 0; i < 12 - existingItems.length; i++) {
        const artwork = artworks[i % artworks.length];
        itemsToInsert.push({
          _id: `staged-item-${Date.now()}-${i}`,
          artwork_id: artwork._id,
          condition: 0.95,
          mint: false,
          mint_value_multiplier: 1,
          attributes: { locked: [], unlocked: [], special: [] },
          owner: player._id,
          transaction_history: [],
          status: "claimed",
          source: "dev-staging",
          date_created: now,
          date_received: now,
          level: 1,
          roll_count: 0,
          reroll_spent: 0,
          foil: i % 2 === 0,
          unlocked: true,
          seasonal: false,
          lottery: 0,
          original: false,
          vintage: false,
          authenticity: { forgery: false, forgery_quality: 1, liable: player._id, liability_pending: false, identified: false, fee: 0, original_owner: player._id },
          tags: [],
          misprint: false,
          permanent: false,
          repairing: false,
          odds: "1 in 100",
          values: { sell: 50000, purchase: 100000, actual: 60000, auction_min: 40000, collector: 75000, dealer: 55000 },
          reroll_cost: 1000,
        });
      }

      if (itemsToInsert.length > 0) {
        await db.collection("items").insertMany(itemsToInsert);
        console.log(`Inserted ${itemsToInsert.length} staged items for testing.`);
      }
    }

    console.log("SUCCESS! Player is now Level 50 with 12+ eligible items and 0 active auctions.");
    console.log("You can now log in and click 'Enter a new era'!");
  } finally {
    await client.close();
  }
}

run().catch(console.error);

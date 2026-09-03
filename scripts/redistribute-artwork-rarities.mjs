import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const database = client.db(process.env.MONGODB_DB);
const alreadyChanged = await database
  .collection("artworks")
  .countDocuments({ rarity_redistribution: "2026-09-03" });
if (alreadyChanged >= 21) {
  console.log(JSON.stringify({ changed: 0, message: "Rarity redistribution already applied." }));
  await client.close();
  process.exit(0);
}
const artworks = await database
  .collection("artworks")
  .find(
    { source: "legendary-catalog-seed", rarity: "legendary" },
    { projection: { _id: 1, title: 1 } },
  )
  .sort({ title: 1, _id: 1 })
  .toArray();

if (artworks.length === 0) {
  console.log(JSON.stringify({ changed: 0, message: "Rarity redistribution already applied." }));
  await client.close();
  process.exit(0);
}
if (artworks.length < 21) {
  throw new Error(`Expected at least 21 eligible seeded legendary works, found ${artworks.length}.`);
}

const uncommonIds = artworks.slice(0, 3).map((artwork) => artwork._id);
const rareIds = artworks.slice(3, 21).map((artwork) => artwork._id);
const firstActiveAttribute = await database
  .collection("attributes")
  .findOne({ active: true }, { projection: { _id: 1 }, sort: { _id: 1 } });
if (!firstActiveAttribute) throw new Error("No active special attribute is available.");
const marker = {
  rarity_redistribution: "2026-09-03",
  updated_at: new Date(),
};

const uncommonResult = await database.collection("artworks").updateMany(
  { _id: { $in: uncommonIds }, rarity: "legendary" },
  {
    $set: { rarity: "uncommon", ...marker },
    $unset: { special_attributes: "", unique_attributes: "" },
  },
);
const rareResult = await database.collection("artworks").updateMany(
  { _id: { $in: rareIds }, rarity: "legendary" },
  {
    $set: {
      rarity: "rare",
      special_attributes: [firstActiveAttribute._id],
      ...marker,
    },
    $unset: { unique_attributes: "" },
  },
);

console.log(
  JSON.stringify({
    changedToUncommon: uncommonResult.modifiedCount,
    changedToRare: rareResult.modifiedCount,
  }),
);
await client.close();

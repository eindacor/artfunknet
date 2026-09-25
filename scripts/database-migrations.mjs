export async function migrateHallOfFameAndPlaythroughStorage(database) {
  const now = new Date();

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

  await database.collection("players").bulkWrite([
    {
      updateMany: {
        filter: { "profile.playthrough_stats.visitors_met": { $exists: false } },
        update: { $set: { "profile.playthrough_stats.visitors_met": 0 } },
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
}

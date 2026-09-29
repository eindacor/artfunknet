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

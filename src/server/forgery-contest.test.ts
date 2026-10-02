import assert from "node:assert/strict";
import test from "node:test";

import {
  getForgeryContestFollowingSettlementAt,
  getForgeryContestMoneyReward,
  getForgeryContestNextSettlementAt,
  getForgeryContestSubmissionPermission,
  getForgeryContestVotePermission,
  isForgeryContestActionDay,
  rankForgeryContestEntries,
} from "./forgery-contest.ts";

test("Forgery Contest voting day is Tuesday in New York", () => {
  assert.equal(
    isForgeryContestActionDay(new Date("2026-10-06T14:00:00.000Z")),
    true,
  );
  assert.equal(
    isForgeryContestActionDay(new Date("2026-10-07T03:00:00.000Z")),
    true,
  );
  assert.equal(
    isForgeryContestActionDay(new Date("2026-10-07T05:00:00.000Z")),
    false,
  );
});

test("Forgery Contest settlement advances from Tuesday noon to Tuesday noon", () => {
  assert.equal(
    getForgeryContestNextSettlementAt(
      new Date("2026-10-06T14:00:00.000Z"),
    ).toISOString(),
    "2026-10-06T16:00:00.000Z",
  );
  assert.equal(
    getForgeryContestNextSettlementAt(
      new Date("2026-10-06T18:00:00.000Z"),
    ).toISOString(),
    "2026-10-13T16:00:00.000Z",
  );
  assert.equal(
    getForgeryContestNextSettlementAt(
      new Date("2026-11-03T18:00:00.000Z"),
    ).toISOString(),
    "2026-11-10T17:00:00.000Z",
  );
});

test("forced settlement advances beyond the current contest cycle", () => {
  assert.equal(
    getForgeryContestFollowingSettlementAt(
      "2026-10-06T16:00:00.000Z",
      new Date("2026-10-02T02:30:00.000Z"),
    ).toISOString(),
    "2026-10-13T16:00:00.000Z",
  );
});

test("Forgery Contest cash rewards use submitted estimated value", () => {
  assert.equal(getForgeryContestMoneyReward(1, 17_613.9), 17_613);
  assert.equal(getForgeryContestMoneyReward(2, 17_613.9), 8_806);
  assert.equal(getForgeryContestMoneyReward(3, 17_613.9), 0);
});

test("Forgery Contest ranking uses votes, submission time, then id", () => {
  const ranked = rankForgeryContestEntries([
    {
      id: "later",
      playerId: "p-2",
      submittedAt: "2026-10-06T14:01:00.000Z",
      votes: 4,
    },
    {
      id: "z-id",
      playerId: "p-3",
      submittedAt: "2026-10-06T14:00:00.000Z",
      votes: 4,
    },
    {
      id: "a-id",
      playerId: "p-1",
      submittedAt: "2026-10-06T14:00:00.000Z",
      votes: 4,
    },
    {
      id: "most-votes",
      playerId: "p-4",
      submittedAt: "2026-10-06T15:00:00.000Z",
      votes: 5,
    },
  ]);
  assert.deepEqual(
    ranked.map((entry) => entry.id),
    ["most-votes", "a-id", "z-id", "later"],
  );
});

test("an entry with one vote ranks above entries with no votes", () => {
  const ranked = rankForgeryContestEntries([
    {
      id: "zero-a",
      playerId: "p-1",
      submittedAt: "2026-10-01T12:00:00.000Z",
      votes: 0,
    },
    {
      id: "leader",
      playerId: "p-2",
      submittedAt: "2026-10-01T12:01:00.000Z",
      votes: 1,
    },
    {
      id: "zero-b",
      playerId: "p-3",
      submittedAt: "2026-10-01T12:02:00.000Z",
      votes: 0,
    },
  ]);

  assert.equal(ranked[0]?.id, "leader");
});

test("submission permissions enforce uniqueness and item eligibility", () => {
  assert.deepEqual(
    getForgeryContestSubmissionPermission({
      alreadyEntered: false,
      itemEligible: true,
    }),
    { allowed: true },
  );
  assert.match(
    getForgeryContestSubmissionPermission({
      alreadyEntered: true,
      itemEligible: true,
    }).reason ?? "",
    /already submitted/i,
  );
  assert.match(
    getForgeryContestSubmissionPermission({
      alreadyEntered: false,
      itemEligible: false,
    }).reason ?? "",
    /identified forgery/i,
  );
  assert.deepEqual(
    getForgeryContestSubmissionPermission({
      alreadyEntered: false,
      itemEligible: true,
    }),
    { allowed: true },
  );
});

test("vote permissions reject missing and self-owned entries", () => {
  assert.deepEqual(
    getForgeryContestVotePermission({
      entryExists: true,
      ownsEntry: false,
    }),
    { allowed: true },
  );
  assert.match(
    getForgeryContestVotePermission({
      entryExists: true,
      ownsEntry: true,
    }).reason ?? "",
    /own/i,
  );
  assert.match(
    getForgeryContestVotePermission({
      entryExists: false,
      ownsEntry: false,
    }).reason ?? "",
    /no longer available/i,
  );
});

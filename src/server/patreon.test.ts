import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePatreonIdentity,
  type PatreonIdentityResponse,
} from "./patreon-core.ts";

function identityFixture(
  patronStatus: string,
  entitledAmountCents: number,
): PatreonIdentityResponse {
  return {
    data: {
      id: "patreon-user-1",
      type: "user",
      attributes: {
        email: "SUPPORTER@example.com",
        full_name: "Supporter",
      },
      relationships: {
        memberships: {
          data: [
            { id: "other-member", type: "member" },
            { id: "artfunkel-member", type: "member" },
          ],
        },
      },
    },
    included: [
      {
        id: "other-member",
        type: "member",
        attributes: {
          patron_status: "active_patron",
          currently_entitled_amount_cents: 50_000,
        },
        relationships: {
          campaign: {
            data: { id: "another-campaign", type: "campaign" },
          },
          currently_entitled_tiers: {
            data: [{ id: "other-tier", type: "tier" }],
          },
        },
      },
      {
        id: "artfunkel-member",
        type: "member",
        attributes: {
          patron_status: patronStatus,
          currently_entitled_amount_cents: entitledAmountCents,
        },
        relationships: {
          campaign: {
            data: { id: "artfunkel-campaign", type: "campaign" },
          },
          currently_entitled_tiers: {
            data: [
              { id: "rare-tier", type: "tier" },
              { id: "legendary-tier", type: "tier" },
            ],
          },
        },
      },
      {
        id: "rare-tier",
        type: "tier",
        attributes: {
          title: "Rare Tier",
          amount_cents: 500,
        },
      },
      {
        id: "legendary-tier",
        type: "tier",
        attributes: {
          title: "Legendary Tier",
          amount_cents: 1_500,
        },
      },
      {
        id: "other-tier",
        type: "tier",
        attributes: {
          title: "Other Tier",
          amount_cents: 50_000,
        },
      },
    ],
  };
}

test("Patreon identity parsing selects the configured campaign and highest tier", () => {
  const snapshot = parsePatreonIdentity(
    identityFixture("active_patron", 1_500),
    "artfunkel-campaign",
    "supporter@example.com",
  );

  assert.equal(snapshot.patreonId, "patreon-user-1");
  assert.equal(snapshot.memberId, "artfunkel-member");
  assert.equal(snapshot.email, "supporter@example.com");
  assert.equal(snapshot.emailMatchesPlayer, true);
  assert.equal(snapshot.isSupporter, true);
  assert.equal(snapshot.tierId, "legendary-tier");
  assert.equal(snapshot.tierName, "Legendary Tier");
  assert.equal(snapshot.tierAmountCents, 1_500);
  assert.deepEqual(
    snapshot.tiers.map((tier) => tier.id),
    ["legendary-tier", "rare-tier"],
  );
});

test("Patreon identity parsing does not treat former or free members as supporters", () => {
  const former = parsePatreonIdentity(
    identityFixture("former_patron", 1_500),
    "artfunkel-campaign",
    "different@example.com",
  );
  const free = parsePatreonIdentity(
    identityFixture("active_patron", 0),
    "artfunkel-campaign",
    "supporter@example.com",
  );

  assert.equal(former.isSupporter, false);
  assert.equal(former.emailMatchesPlayer, false);
  assert.equal(former.tierId, null);
  assert.deepEqual(former.tiers, []);
  assert.equal(free.isSupporter, false);
});

test("Patreon identity parsing ignores memberships from other campaigns", () => {
  const snapshot = parsePatreonIdentity(
    identityFixture("active_patron", 1_500),
    "missing-campaign",
    "supporter@example.com",
  );

  assert.equal(snapshot.memberId, null);
  assert.equal(snapshot.isSupporter, false);
  assert.equal(snapshot.patronStatus, null);
  assert.equal(snapshot.tierId, null);
});

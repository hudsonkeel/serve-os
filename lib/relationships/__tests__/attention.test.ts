// Pure-function tests for lib/relationships/attention.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import { getRelationshipAttentionStatus } from "../attention.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Noon Central (CDT, UTC-5) on 2026-07-16 — same reference style as
// lib/residentTimeline/__tests__/grouping.test.ts.
const NOW = new Date("2026-07-16T17:00:00.000Z");

// Boundaries for this NOW, computed the same way getCentralDayBoundaryUtc
// does, so tests assert against known-good instants rather than trusting
// the function under a different name:
//   start of today (Central)  = 2026-07-16T05:00:00.000Z
//   end of today (Central)    = 2026-07-17T05:00:00.000Z
//   end of week (Central, +7) = 2026-07-24T05:00:00.000Z

test("1. closed status wins regardless of due date", () => {
  const status = getRelationshipAttentionStatus(
    { status: "closed", relationshipType: "resident_prospect", nearestOpenActionDueAt: "2020-01-01T00:00:00.000Z" },
    NOW
  );
  assert.equal(status, "closed");
});

test("2. on_hold status wins regardless of due date", () => {
  const status = getRelationshipAttentionStatus(
    { status: "on_hold", relationshipType: "external_prospect", nearestOpenActionDueAt: "2020-01-01T00:00:00.000Z" },
    NOW
  );
  assert.equal(status, "on_hold");
});

test("3. no open action + prospect type -> no_next_action", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "resident_prospect" },
    NOW
  );
  assert.equal(status, "no_next_action");
});

test("4. no open action + non-prospect type -> upcoming, not no_next_action", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "active_client" },
    NOW
  );
  assert.equal(status, "upcoming");
});

test("5. open action with no due date -> upcoming", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: null },
    NOW
  );
  assert.equal(status, "upcoming");
});

test("6. just before start of today -> overdue", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2026-07-16T04:59:00.000Z" },
    NOW
  );
  assert.equal(status, "overdue");
});

test("7. exactly at start of today -> due_today", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2026-07-16T05:00:00.000Z" },
    NOW
  );
  assert.equal(status, "due_today");
});

test("8. just before end of today -> due_today", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2026-07-17T04:59:00.000Z" },
    NOW
  );
  assert.equal(status, "due_today");
});

test("9. exactly at end of today -> due_this_week", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2026-07-17T05:00:00.000Z" },
    NOW
  );
  assert.equal(status, "due_this_week");
});

test("10. just before end of week -> due_this_week", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2026-07-24T04:59:00.000Z" },
    NOW
  );
  assert.equal(status, "due_this_week");
});

test("11. exactly at end of week -> upcoming", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2026-07-24T05:00:00.000Z" },
    NOW
  );
  assert.equal(status, "upcoming");
});

test("12. far future due date -> upcoming", () => {
  const status = getRelationshipAttentionStatus(
    { status: "active", relationshipType: "external_prospect", nearestOpenActionDueAt: "2027-01-01T00:00:00.000Z" },
    NOW
  );
  assert.equal(status, "upcoming");
});

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();

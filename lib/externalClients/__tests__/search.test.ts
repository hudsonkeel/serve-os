// Pure-function tests for lib/externalClients/search.ts. Run with:
//   npm run test:externalClients
import assert from "node:assert/strict";
import {
  countByTab,
  filterByExternalClientTab,
  isExternalWorkspaceRow,
  matchesExternalClientSearch,
  normalizeSearchQuery,
  type ExternalClientWorkspaceRow,
} from "../search.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeRow(overrides: Partial<ExternalClientWorkspaceRow> = {}): ExternalClientWorkspaceRow {
  return {
    id: "row-1",
    displayName: "Smith Family Inquiry",
    relationshipType: "external_prospect",
    stage: "new_inquiry",
    status: "active",
    residentId: null,
    residentName: null,
    ownerLabel: null,
    priority: "normal",
    prospectiveResidentName: null,
    primaryContactName: null,
    primaryContactPhone: null,
    primaryContactEmail: null,
    organizationName: null,
    communityName: null,
    lastMeaningfulTouchAt: null,
    updatedAt: "2026-07-16T00:00:00.000Z",
    nearestActionTitle: null,
    nearestActionDueAt: null,
    attentionStatus: "no_next_action",
    externalClientId: null,
    externalClientStatus: null,
    city: null,
    serviceStartDate: null,
    ...overrides,
  };
}

// ─── isExternalWorkspaceRow ──────────────────────────────────────────

test("1. external_prospect is always an external row", () => {
  assert.equal(isExternalWorkspaceRow({ relationshipType: "external_prospect", residentId: null }), true);
});

test("2. active_client with no resident is an external row", () => {
  assert.equal(isExternalWorkspaceRow({ relationshipType: "active_client", residentId: null }), true);
});

test("3. active_client WITH a resident is not an external row", () => {
  assert.equal(isExternalWorkspaceRow({ relationshipType: "active_client", residentId: "resident-1" }), false);
});

test("4. resident_prospect is never an external row", () => {
  assert.equal(isExternalWorkspaceRow({ relationshipType: "resident_prospect", residentId: null }), false);
});

test("5. referral_source is never an external row (belongs in Relationships)", () => {
  assert.equal(isExternalWorkspaceRow({ relationshipType: "referral_source", residentId: null }), false);
});

// ─── filterByExternalClientTab ───────────────────────────────────────

test("6. prospects tab excludes closed external prospects", () => {
  const rows = [
    makeRow({ id: "a", status: "active" }),
    makeRow({ id: "b", status: "closed" }),
  ];
  const result = filterByExternalClientTab(rows, "prospects");
  assert.deepEqual(result.map((r) => r.id), ["a"]);
});

test("7. active tab matches externalClientStatus active only", () => {
  const rows = [
    makeRow({ id: "a", relationshipType: "active_client", externalClientStatus: "active" }),
    makeRow({ id: "b", relationshipType: "active_client", externalClientStatus: "on_hold" }),
    makeRow({ id: "c", relationshipType: "active_client", externalClientStatus: "former" }),
  ];
  assert.deepEqual(filterByExternalClientTab(rows, "active").map((r) => r.id), ["a"]);
  assert.deepEqual(filterByExternalClientTab(rows, "on_hold").map((r) => r.id), ["b"]);
  assert.deepEqual(filterByExternalClientTab(rows, "former").map((r) => r.id), ["c"]);
});

test("8. lifecycle tabs never match a plain external prospect (externalClientStatus null)", () => {
  const rows = [makeRow({ id: "a", externalClientStatus: null })];
  assert.equal(filterByExternalClientTab(rows, "active").length, 0);
  assert.equal(filterByExternalClientTab(rows, "on_hold").length, 0);
  assert.equal(filterByExternalClientTab(rows, "former").length, 0);
});

// ─── countByTab ───────────────────────────────────────────────────────

test("9. countByTab sums each tab independently", () => {
  const rows = [
    makeRow({ id: "a", status: "active" }),
    makeRow({ id: "b", relationshipType: "active_client", externalClientStatus: "active" }),
    makeRow({ id: "c", relationshipType: "active_client", externalClientStatus: "on_hold" }),
  ];
  const counts = countByTab(rows);
  assert.deepEqual(counts, { prospects: 1, active: 1, on_hold: 1, former: 0 });
});

// ─── search ─────────────────────────────────────────────────────────

test("10. normalizeSearchQuery trims and lowercases", () => {
  assert.equal(normalizeSearchQuery("  Smith  "), "smith");
});

test("11. matchesExternalClientSearch matches display name", () => {
  const row = makeRow({ displayName: "Jennifer Smith Inquiry" });
  assert.equal(matchesExternalClientSearch(row, "smith"), true);
});

test("12. matchesExternalClientSearch matches city", () => {
  const row = makeRow({ city: "Frisco" });
  assert.equal(matchesExternalClientSearch(row, "frisco"), true);
});

test("13. matchesExternalClientSearch returns false when nothing matches", () => {
  const row = makeRow({ displayName: "Jones Family", city: "Plano" });
  assert.equal(matchesExternalClientSearch(row, "smith"), false);
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

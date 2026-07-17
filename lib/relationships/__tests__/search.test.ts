// Pure-function tests for lib/relationships/search.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import {
  filterByRelationshipFilter,
  getProspectOrResidentLabel,
  matchesRelationshipSearch,
  normalizeSearchQuery,
} from "../search.ts";
import type { RelationshipWorkspaceRow } from "../search.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeRow(overrides: Partial<RelationshipWorkspaceRow> = {}): RelationshipWorkspaceRow {
  return {
    id: "row-id",
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── normalizeSearchQuery ───────────────────────────────────────────

test("1. normalizeSearchQuery trims and lowercases", () => {
  assert.equal(normalizeSearchQuery("  Jennifer  "), "jennifer");
});

// ─── matchesRelationshipSearch ───────────────────────────────────────

test("2. matches relationship display name, case-insensitive", () => {
  const row = makeRow({ displayName: "Smith Family Inquiry" });
  assert.equal(matchesRelationshipSearch(row, "smith"), true);
});

test("3. matches resident name", () => {
  const row = makeRow({ residentName: "Margaret Smith" });
  assert.equal(matchesRelationshipSearch(row, "margaret"), true);
});

test("4. matches primary contact name, phone, and email", () => {
  const row = makeRow({
    primaryContactName: "Jennifer Smith",
    primaryContactPhone: "5551234567",
    primaryContactEmail: "jsmith@example.com",
  });
  assert.equal(matchesRelationshipSearch(row, "jennifer"), true);
  assert.equal(matchesRelationshipSearch(row, "5551234567"), true);
  assert.equal(matchesRelationshipSearch(row, "jsmith@example.com"), true);
});

test("5. matches organization and community name", () => {
  const row = makeRow({ organizationName: "Baylor Scott & White", communityName: "Watermere at Frisco" });
  assert.equal(matchesRelationshipSearch(row, "baylor"), true);
  assert.equal(matchesRelationshipSearch(row, "watermere"), true);
});

test("6. returns false when nothing matches", () => {
  const row = makeRow({ displayName: "Jones Family Inquiry" });
  assert.equal(matchesRelationshipSearch(row, "smith"), false);
});

// ─── filterByRelationshipFilter ─────────────────────────────────────

test("7. 'all' returns every row unchanged", () => {
  const rows = [makeRow({ relationshipType: "resident_prospect" }), makeRow({ relationshipType: "active_client" })];
  assert.equal(filterByRelationshipFilter(rows, "all").length, 2);
});

test("8. 'resident_prospects' scopes to resident_prospect type only", () => {
  const rows = [
    makeRow({ id: "a", relationshipType: "resident_prospect" }),
    makeRow({ id: "b", relationshipType: "external_prospect" }),
  ];
  const result = filterByRelationshipFilter(rows, "resident_prospects");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
});

test("9. 'partners_referrals' combines referral_source and community_partner", () => {
  const rows = [
    makeRow({ id: "a", relationshipType: "referral_source" }),
    makeRow({ id: "b", relationshipType: "community_partner" }),
    makeRow({ id: "c", relationshipType: "professional_contact" }),
  ];
  const result = filterByRelationshipFilter(rows, "partners_referrals");
  assert.deepEqual(result.map((r) => r.id).sort(), ["a", "b"]);
});

test("10. 'on_hold' and 'closed' scope by status, not type", () => {
  const rows = [
    makeRow({ id: "a", status: "on_hold" }),
    makeRow({ id: "b", status: "closed" }),
    makeRow({ id: "c", status: "active" }),
  ];
  assert.equal(filterByRelationshipFilter(rows, "on_hold")[0].id, "a");
  assert.equal(filterByRelationshipFilter(rows, "closed")[0].id, "b");
});

// ─── getProspectOrResidentLabel ──────────────────────────────────────

test("11. linked resident wins even if a prospective-resident name is also set", () => {
  const row = makeRow({
    residentId: "res-1",
    residentName: "Doris Kakazu",
    prospectiveResidentName: "Someone Else",
  });
  const label = getProspectOrResidentLabel(row);
  assert.deepEqual(label, { text: "Doris Kakazu", isContact: false });
});

test("12. no resident but a named prospective resident -> shown as the prospect, not a contact", () => {
  const row = makeRow({ prospectiveResidentName: "Margaret Smith", primaryContactName: "Jennifer Smith" });
  const label = getProspectOrResidentLabel(row);
  assert.deepEqual(label, { text: "Margaret Smith", isContact: false });
});

test("13. no resident, no named prospect -> falls back to primary contact, explicitly labeled", () => {
  const row = makeRow({ primaryContactName: "Jennifer Smith" });
  const label = getProspectOrResidentLabel(row);
  assert.deepEqual(label, { text: "Contact: Jennifer Smith", isContact: true });
});

test("14. nothing known at all -> null, never a fabricated label", () => {
  const row = makeRow();
  assert.equal(getProspectOrResidentLabel(row), null);
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

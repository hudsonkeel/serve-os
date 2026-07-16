// Pure-function tests for lib/residents/search.ts. Run with:
//   npm run test:residents
import assert from "node:assert/strict";
import {
  buildBlendedGroups,
  countGroupRecords,
  filterByTab,
  matchesSearch,
  normalizeSearchQuery,
} from "../search.ts";
import type { CommunityResidentRecord } from "../../data/communityMetrics.ts";
import type { Resident } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeResident(overrides: Partial<Resident>): Resident {
  return {
    id: "resident-id",
    external_source_key: null,
    community_name: null,
    community_code: null,
    first_name: null,
    middle_name: null,
    last_name: null,
    preferred_name: null,
    display_name: null,
    full_name: null,
    status: "active",
    relationship_status: null,
    serve_relationship_status: null,
    resident_type: null,
    building: null,
    unit_number: null,
    email: null,
    phone: null,
    phone_raw: null,
    phone_type: null,
    date_of_birth: null,
    date_of_admission: null,
    mobility: null,
    preferred_language: null,
    sex: null,
    gender: null,
    address: null,
    city: null,
    state: null,
    country: null,
    zip_code: null,
    care_needs: null,
    family_contact_name: null,
    family_contact_relationship: null,
    family_contact_phone: null,
    family_contact_email: null,
    source_system: null,
    source_file: null,
    source_status: null,
    notes: null,
    needs_review: null,
    import_batch: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    is_active: true,
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<Omit<CommunityResidentRecord, "resident">> & {
    resident?: Partial<Resident>;
  } = {}
): CommunityResidentRecord {
  const { resident: residentOverrides, ...rest } = overrides;
  const resident = makeResident(residentOverrides ?? {});

  return {
    id: resident.id,
    resident,
    residentName: [resident.first_name, resident.last_name]
      .filter(Boolean)
      .join(" "),
    preferredNickname: null,
    residentDisplayName: [resident.first_name, resident.last_name]
      .filter(Boolean)
      .join(" "),
    familyContact: "No contact on file",
    phone: null,
    email: null,
    unitNumber: resident.unit_number,
    building: null,
    residentType: null,
    needsReview: null,
    importedRelationships: [],
    importedContacts: [],
    importedSourceStatus: null,
    importedServiceModel: null,
    importReviewNotes: [],
    sourceRelationshipStatus: null,
    sourceCinchStatus: null,
    sourceServiceType: null,
    sourceDisplayName: null,
    sourceFullName: null,
    sourceMatchNotes: [],
    sourceNameDiffers: false,
    createdAt: resident.created_at,
    updatedAt: null,
    serveRelationshipStatus: "active_client",
    serveRelationshipLabel: "Active Client",
    source: "Supabase Resident",
    wellnessWatch: null,
    lastWellnessObservedAt: null,
    ...rest,
  };
}

// ─── normalizeSearchQuery ───────────────────────────────────────────

test("1. normalizeSearchQuery trims and lowercases", () => {
  assert.equal(normalizeSearchQuery("  Paulette  "), "paulette");
});

test("2. normalizeSearchQuery treats whitespace-only input as empty", () => {
  assert.equal(normalizeSearchQuery("   \t  "), "");
});

// ─── matchesSearch ───────────────────────────────────────────────────

test("3. matchesSearch is case-insensitive on last name", () => {
  const record = makeRecord({ resident: { last_name: "Paulette" } });
  assert.equal(matchesSearch(record, "paulette"), true);
});

test("4. matchesSearch matches apartment/unit number", () => {
  const record = makeRecord({ resident: { unit_number: "214" } });
  assert.equal(matchesSearch(record, "214"), true);
});

test("5. matchesSearch matches staff-captured nickname", () => {
  const record = makeRecord({
    resident: { first_name: "Michele", last_name: "Helsley" },
    preferredNickname: "Mick",
  });
  assert.equal(matchesSearch(record, "mick"), true);
});

test("6. matchesSearch does not match phone number (unsupported field)", () => {
  const record = makeRecord({ phone: "5551234567" });
  assert.equal(matchesSearch(record, "5551234567"), false);
});

test("7. matchesSearch returns false when nothing matches", () => {
  const record = makeRecord({ resident: { last_name: "Smith" } });
  assert.equal(matchesSearch(record, "paulette"), false);
});

// ─── filterByTab ─────────────────────────────────────────────────────

test("8. filterByTab scopes to active clients", () => {
  const records = [
    makeRecord({ serveRelationshipStatus: "active_client" }),
    makeRecord({ serveRelationshipStatus: "prospect" }),
  ];
  const result = filterByTab(records, "active_clients");
  assert.equal(result.length, 1);
  assert.equal(result[0].serveRelationshipStatus, "active_client");
});

test("9. filterByTab 'all' returns every record unchanged", () => {
  const records = [
    makeRecord({ serveRelationshipStatus: "active_client" }),
    makeRecord({ serveRelationshipStatus: "prospect" }),
  ];
  assert.equal(filterByTab(records, "all").length, 2);
});

// ─── buildBlendedGroups ──────────────────────────────────────────────

test("10. buildBlendedGroups keeps every group (even empty) when there is no query", () => {
  const records = [makeRecord({ serveRelationshipStatus: "active_client" })];
  const groups = buildBlendedGroups(records, "");
  assert.equal(groups.length, 3);
  assert.equal(groups.find((g) => g.key === "prospects")?.records.length, 0);
});

test("11. buildBlendedGroups drops zero-match groups during an active search", () => {
  const records = [
    makeRecord({
      serveRelationshipStatus: "active_client",
      resident: { last_name: "Smith" },
    }),
    makeRecord({
      serveRelationshipStatus: "prospect",
      resident: { last_name: "Jones" },
    }),
    makeRecord({
      serveRelationshipStatus: "hold",
      resident: { last_name: "Paulette" },
    }),
  ];

  const groups = buildBlendedGroups(records, "paulette");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "others");
  assert.equal(groups[0].records.length, 1);
});

test("12. buildBlendedGroups keeps every matching group when a search spans sections", () => {
  const records = [
    makeRecord({
      serveRelationshipStatus: "active_client",
      resident: { last_name: "Paulette" },
    }),
    makeRecord({
      serveRelationshipStatus: "prospect",
      resident: { last_name: "Paulette" },
    }),
    makeRecord({
      serveRelationshipStatus: "hold",
      resident: { last_name: "Smith" },
    }),
  ];

  const groups = buildBlendedGroups(records, "paulette");
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.key),
    ["active", "prospects"]
  );
});

test("13. buildBlendedGroups returns no groups when nothing matches", () => {
  const records = [
    makeRecord({
      serveRelationshipStatus: "active_client",
      resident: { last_name: "Smith" },
    }),
  ];
  assert.equal(buildBlendedGroups(records, "paulette").length, 0);
});

test("14. buildBlendedGroups preserves group order (active, prospects, others)", () => {
  const records = [
    makeRecord({
      serveRelationshipStatus: "hold",
      resident: { last_name: "Paulette" },
    }),
    makeRecord({
      serveRelationshipStatus: "active_client",
      resident: { last_name: "Paulette" },
    }),
    makeRecord({
      serveRelationshipStatus: "prospect",
      resident: { last_name: "Paulette" },
    }),
  ];
  const groups = buildBlendedGroups(records, "paulette");
  assert.deepEqual(
    groups.map((g) => g.key),
    ["active", "prospects", "others"]
  );
});

// ─── countGroupRecords ───────────────────────────────────────────────

test("15. countGroupRecords sums records across groups", () => {
  const groups = buildBlendedGroups(
    [
      makeRecord({
        serveRelationshipStatus: "active_client",
        resident: { last_name: "Paulette" },
      }),
      makeRecord({
        serveRelationshipStatus: "prospect",
        resident: { last_name: "Paulette" },
      }),
    ],
    "paulette"
  );
  assert.equal(countGroupRecords(groups), 2);
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

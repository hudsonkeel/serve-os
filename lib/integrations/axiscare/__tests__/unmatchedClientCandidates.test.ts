import assert from "node:assert/strict";
import { suggestResidentMatchesForAxisCareClient } from "../unmatchedClientCandidates.ts";
import { normalizeName, normalizeLastName } from "../clientIdentityMatching.ts";
import type { NormalizedResidentCandidate } from "../clientIdentityMatching.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function resident(overrides: Partial<NormalizedResidentCandidate> & { id: string }): NormalizedResidentCandidate {
  return {
    displayName: "Test Resident",
    normalizedEmail: null,
    normalizedPhones: [],
    normalizedName: "test resident",
    normalizedLastName: null,
    unitNumber: null,
    communityName: null,
    ...overrides,
  };
}

// The exact live Linda Kaplan / AxisCare Client #7 shape: AxisCare's
// community FIELD is null, but the community is real and named in a
// class tag ("Watermere Frisco") — the deterministic auto-matcher never
// sees it (community field null short-circuits its community tiers
// entirely); this suggestion layer must still surface her.
test("REGRESSION (Linda Kaplan / AxisCare #7): exact name + null community field but a matching class tag still suggests a strong match", () => {
  const linda = resident({
    id: "linda-id",
    displayName: "Linda Kaplan",
    normalizedName: normalizeName("Linda", "Kaplan"),
    normalizedLastName: normalizeLastName("Kaplan"),
    unitNumber: "9203",
    communityName: "Watermere at Frisco",
  });

  const suggestions = suggestResidentMatchesForAxisCareClient(
    {
      normalizedName: normalizeName("Linda", "Kaplan"),
      normalizedLastName: normalizeLastName("Kaplan"),
      normalizedEmail: null,
      normalizedPhones: [],
      communityName: null,
      classes: ["Watermere Frisco", "PC"],
    },
    [linda]
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].residentId, "linda-id");
  assert.equal(suggestions[0].confidence, "strong");
  assert.ok(suggestions[0].reasons.some((r) => r.includes("exactly")));
  assert.ok(suggestions[0].reasons.some((r) => r.toLowerCase().includes("community")));
});

test("exact name with zero corroborating evidence is 'possible', not 'strong' — never a one-click auto-pick without any real evidence", () => {
  const r = resident({ id: "r1", normalizedName: "pat smith", normalizedLastName: "smith" });
  const suggestions = suggestResidentMatchesForAxisCareClient(
    { normalizedName: "pat smith", normalizedLastName: "smith", normalizedEmail: null, normalizedPhones: [], communityName: null, classes: [] },
    [r]
  );
  assert.equal(suggestions[0].confidence, "possible");
});

test("a completely different name with no last-name/near-first-name relationship is never suggested at all", () => {
  const r = resident({ id: "r1", normalizedName: "someone else", normalizedLastName: "else" });
  const suggestions = suggestResidentMatchesForAxisCareClient(
    { normalizedName: "totally different person", normalizedLastName: "person", normalizedEmail: null, normalizedPhones: [], communityName: null, classes: [] },
    [r]
  );
  assert.equal(suggestions.length, 0);
});

test("same last name with a one-character first-name difference is surfaced as a near-name possible match", () => {
  const r = resident({ id: "r1", displayName: "Jon Reyes", normalizedName: "jon reyes", normalizedLastName: "reyes" });
  const suggestions = suggestResidentMatchesForAxisCareClient(
    { normalizedName: "john reyes", normalizedLastName: "reyes", normalizedEmail: null, normalizedPhones: [], communityName: null, classes: [] },
    [r]
  );
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].confidence, "possible");
});

test("phone match alone (no name similarity) never produces a suggestion — name similarity is required first", () => {
  const r = resident({ id: "r1", normalizedName: "unrelated name", normalizedLastName: "name", normalizedPhones: ["5551234567"] });
  const suggestions = suggestResidentMatchesForAxisCareClient(
    { normalizedName: "completely different", normalizedLastName: "different", normalizedEmail: null, normalizedPhones: ["5551234567"], communityName: null, classes: [] },
    [r]
  );
  assert.equal(suggestions.length, 0);
});

test("a resident appearing twice in the canonicalized pool (own name + alias row) is only ever reported once, with its best evidence", () => {
  const ownRow = resident({ id: "r1", normalizedName: "linda kaplan", normalizedLastName: "kaplan", communityName: "Watermere at Frisco" });
  const aliasRow = resident({ id: "r1", normalizedName: "linda kaplan", normalizedLastName: "kaplan", communityName: null });
  const suggestions = suggestResidentMatchesForAxisCareClient(
    { normalizedName: "linda kaplan", normalizedLastName: "kaplan", normalizedEmail: null, normalizedPhones: [], communityName: null, classes: [] },
    [ownRow, aliasRow]
  );
  assert.equal(suggestions.length, 1, "must not list the same resident id twice");
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);

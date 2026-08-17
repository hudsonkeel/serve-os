// Pure-function tests for ../canonicalRecommendation.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { recommendCanonicalResident } from "../canonicalRecommendation.ts";
import type { CanonicalRecommendationInput } from "../canonicalRecommendation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function record(overrides: Partial<CanonicalRecommendationInput> & { id: string }): CanonicalRecommendationInput {
  return {
    firstName: "Jane",
    lastName: "Smith",
    unitNumber: "1101",
    needsReview: null,
    sourceSystem: "Watermere official roster",
    linkedRecordCount: 0,
    ...overrides,
  };
}

test("1. identity quality beats history richness — better apartment/name/flag data wins even with less linked history", () => {
  const better = record({ id: "better", unitNumber: "1101", needsReview: null, linkedRecordCount: 0 });
  const worse = record({ id: "worse", unitNumber: null, needsReview: "stray artifact in name field", linkedRecordCount: 50 });
  const result = recommendCanonicalResident(better, worse);
  assert.equal(result.canonicalResidentId, "better");
});

test("2. source authority is the tie-breaker BEFORE history, never after — equal identity quality, different source, different history", () => {
  const trusted = record({ id: "trusted", sourceSystem: "Watermere official roster", linkedRecordCount: 1 });
  const untrusted = record({ id: "untrusted", sourceSystem: "Watermere resident roster CSV", linkedRecordCount: 50 });
  const result = recommendCanonicalResident(trusted, untrusted);
  assert.equal(result.canonicalResidentId, "trusted");
});

test("3. history richness is only consulted once quality and authority are truly tied", () => {
  const richer = record({ id: "richer", sourceSystem: "Watermere official roster", linkedRecordCount: 12 });
  const leaner = record({ id: "leaner", sourceSystem: "Watermere official roster", linkedRecordCount: 3 });
  const result = recommendCanonicalResident(richer, leaner);
  assert.equal(result.canonicalResidentId, "richer");
});

test("4. the recommendation always explains itself with a non-empty reasons list", () => {
  const a = record({ id: "a", unitNumber: "1101" });
  const b = record({ id: "b", unitNumber: null });
  const result = recommendCanonicalResident(a, b);
  assert.ok(result.reasons.length > 0);
});

test("5. a genuine tie on every tier still returns a deterministic, non-empty-reasons result", () => {
  const a = record({ id: "a" });
  const b = record({ id: "b" });
  const result = recommendCanonicalResident(a, b);
  assert.equal(result.canonicalResidentId, "a");
  assert.ok(result.reasons.length > 0);
});

test("6. REGRESSION (Final Canonical Truth Cleanup): stale needsReview/staging_match_review metadata alone cannot flip which record is recommended canonical — the stronger record on every OTHER dimension still wins even though it carries the flag", () => {
  // "stronger" wins on apartment (populated) and would tie on everything
  // else except that it also carries a stale CINCH-import-era
  // needsReview flag the "weaker" record doesn't have. Before this fix,
  // that flag alone would have flipped the recommendation to "weaker" —
  // historical staging noise must never outrank real identity quality
  // (apartment/name) or outweigh it entirely on its own.
  const stronger = record({ id: "stronger", unitNumber: "1101", needsReview: "staging_match_review", linkedRecordCount: 0 });
  const weaker = record({ id: "weaker", unitNumber: null, needsReview: null, linkedRecordCount: 0 });
  const result = recommendCanonicalResident(stronger, weaker);
  assert.equal(result.canonicalResidentId, "stronger", "apartment-populated record must still win despite a stale staging flag");
});

test("7. REGRESSION: needsReview never appears in the recommendation's own explanation text — 'No outstanding data-quality flag' must not resurface", () => {
  const a = record({ id: "a", unitNumber: "1101", needsReview: null });
  const b = record({ id: "b", unitNumber: "1101", needsReview: "staging_match_review" });
  const result = recommendCanonicalResident(a, b);
  for (const reason of result.reasons) {
    assert.ok(!reason.toLowerCase().includes("data-quality flag"), `reason "${reason}" must not reference the retired data-quality-flag signal`);
  }
});

test("8. two records that differ ONLY by needsReview are now a genuine tie — identical apartment/name/source/history", () => {
  const a = record({ id: "a", needsReview: null });
  const b = record({ id: "b", needsReview: "staging_match_review" });
  const result = recommendCanonicalResident(a, b);
  // Ties default to the first argument (documented, stable, arbitrary) —
  // proving needsReview no longer breaks the tie either direction.
  assert.equal(result.canonicalResidentId, "a");
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

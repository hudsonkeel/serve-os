// Pure-function tests for the AxisCare -> Serve canonical bootstrap's
// one non-negotiable rule: AxisCare only ever fills a gap, never
// silently overwrites a fact Serve already owns.
//
//   node --experimental-strip-types --conditions=react-server lib/integrations/axiscare/__tests__/clientCanonicalReconciliation.test.ts
import assert from "node:assert/strict";
import {
  decideFieldReconciliation,
  classifyFieldForPreview,
  computeUnresolvedFieldConflicts,
  normalizeBootstrapFieldForComparison,
} from "../clientCanonicalReconciliation.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("both null -> not_reviewed (nothing to reconcile yet)", () => {
  assert.equal(decideFieldReconciliation(null, null), "not_reviewed");
});

test("Serve null, AxisCare has a value -> apply", () => {
  assert.equal(decideFieldReconciliation(null, "1950-01-01"), "apply");
});

test("Serve has a value, AxisCare null -> skipped_serve_already_owns", () => {
  assert.equal(decideFieldReconciliation("1950-01-01", null), "skipped_serve_already_owns");
});

test("Serve and AxisCare agree -> skipped_serve_already_owns, not treated as a conflict", () => {
  assert.equal(decideFieldReconciliation("1950-01-01", "1950-01-01"), "skipped_serve_already_owns");
});

test("Serve and AxisCare disagree -> conflict_unresolved, never auto-resolved either direction", () => {
  assert.equal(decideFieldReconciliation("1950-01-01", "1952-06-15"), "conflict_unresolved");
});

test("REGRESSION: a populated Serve value is never eligible for 'apply', even when AxisCare disagrees — apply only ever fills a true gap", () => {
  const outcome = decideFieldReconciliation("Female", "Male");
  assert.notEqual(outcome, "apply");
  assert.equal(outcome, "conflict_unresolved");
});

test("empty-string Serve value is treated the same as null (a genuine gap)", () => {
  assert.equal(decideFieldReconciliation("", "1950-01-01"), "apply");
});

test("whitespace-only Serve value is treated the same as null", () => {
  assert.equal(decideFieldReconciliation("   ", "1950-01-01"), "apply");
});

// ─── classifyFieldForPreview — reporting-only, finer-grained ────────────

test("preview: both empty -> AXISCARE_EMPTY", () => {
  assert.equal(classifyFieldForPreview(null, null), "AXISCARE_EMPTY");
});

test("preview: Serve populated, AxisCare empty -> SERVE_ALREADY_OWNS (distinct from ALREADY_AGREES)", () => {
  assert.equal(classifyFieldForPreview("1950-01-01", null), "SERVE_ALREADY_OWNS");
});

test("preview: Serve empty, AxisCare populated -> WILL_POPULATE", () => {
  assert.equal(classifyFieldForPreview(null, "1950-01-01"), "WILL_POPULATE");
});

test("preview: both populated and equal -> ALREADY_AGREES (distinct from SERVE_ALREADY_OWNS)", () => {
  assert.equal(classifyFieldForPreview("1950-01-01", "1950-01-01"), "ALREADY_AGREES");
});

test("preview: both populated and different -> CONFLICT_REVIEW", () => {
  assert.equal(classifyFieldForPreview("1950-01-01", "1952-06-15"), "CONFLICT_REVIEW");
});

test("REGRESSION: preview never confuses SERVE_ALREADY_OWNS with ALREADY_AGREES — they are different states even though both mean 'no write'", () => {
  const owns = classifyFieldForPreview("Daughter", null);
  const agrees = classifyFieldForPreview("Daughter", "Daughter");
  assert.equal(owns, "SERVE_ALREADY_OWNS");
  assert.equal(agrees, "ALREADY_AGREES");
  assert.notEqual(owns, agrees);
});

// ─── computeUnresolvedFieldConflicts — Closed-Loop UX Pass, Phase 1 ─────

test("a real disagreeing field is surfaced with both values (WHAT/WHY evidence)", () => {
  // Deliberately NOT Elliot's live "Daughter in-law" vs "Daughter in Law"
  // shape — the Final Canonical Truth Cleanup pass's normalization
  // (see below) correctly reclassifies that exact formatting-only case
  // as no longer a conflict at all. This test proves the structural
  // WHAT/WHY fields populate correctly for a genuine disagreement.
  const results = computeUnresolvedFieldConflicts(
    { family_contact_relationship: "Daughter" },
    { family_contact_relationship: "Son" },
    {},
    "2026-08-17T20:21:29.474Z"
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].field, "family_contact_relationship");
  assert.equal(results[0].label, "Family Contact Relationship");
  assert.equal(results[0].serveValue, "Daughter");
  assert.equal(results[0].axiscareValue, "Son");
});

test("a field with no decision on file stays an open conflict", () => {
  const results = computeUnresolvedFieldConflicts({ gender: "F" }, { gender: "M" }, {}, "2026-08-17T00:00:00Z");
  assert.equal(results.length, 1);
});

test("a field reviewed (Keep Serve) against the SAME AxisCare value stays quiet on the next check", () => {
  const results = computeUnresolvedFieldConflicts(
    { gender: "F" },
    { gender: "M" },
    { gender: { decision: "keep_serve", axiscare_value_at_decision: "M", decided_by: "Hud Keel", decided_at: "2026-08-17T00:00:00Z" } },
    "2026-08-17T01:00:00Z"
  );
  assert.equal(results.length, 0, "must not re-surface a conflict already reviewed against this exact AxisCare value");
});

test("REGRESSION: a field reviewed against a PRIOR AxisCare value re-surfaces once AxisCare's value changes again — a stale decision must never suppress a genuinely new disagreement", () => {
  const results = computeUnresolvedFieldConflicts(
    { gender: "F" },
    { gender: "Nonbinary" }, // AxisCare's value changed since the human's decision
    { gender: { decision: "keep_serve", axiscare_value_at_decision: "M", decided_by: "Hud Keel", decided_at: "2026-08-17T00:00:00Z" } },
    "2026-08-18T00:00:00Z"
  );
  assert.equal(results.length, 1, "must re-surface — AxisCare's current value differs from what was reviewed");
  assert.equal(results[0].axiscareValue, "Nonbinary");
});

test("a resolved-to-'use_axiscare' field where Serve was subsequently updated to match no longer conflicts at all (ordinary skipped_serve_already_owns/agrees path, independent of field_decisions)", () => {
  const results = computeUnresolvedFieldConflicts(
    { gender: "M" }, // Serve now matches AxisCare (e.g. the Use AxisCare write already happened)
    { gender: "M" },
    { gender: { decision: "use_axiscare", axiscare_value_at_decision: "M", decided_by: "Hud Keel", decided_at: "2026-08-17T00:00:00Z" } },
    "2026-08-17T01:00:00Z"
  );
  assert.equal(results.length, 0);
});

test("multiple independently-conflicting fields on the same client are each reported — reviewing one must never hide the other", () => {
  const results = computeUnresolvedFieldConflicts(
    { family_contact_name: "Stephanie", family_contact_phone: "(816) 830-7146" },
    { family_contact_name: "Stephanie Helsley", family_contact_phone: "816-830-7146" },
    { family_contact_phone: { decision: "keep_serve", axiscare_value_at_decision: "816-830-7146", decided_by: "Hud Keel", decided_at: "2026-08-17T00:00:00Z" } },
    "2026-08-17T20:21:11.113Z"
  );
  assert.equal(results.length, 1, "only the still-unreviewed field should surface");
  assert.equal(results[0].field, "family_contact_name");
});

// ─── normalizeBootstrapFieldForComparison — Final Canonical Truth Cleanup ─

test("REGRESSION (Elliot Goldberg live case): relationship phrasing differing only in case/hyphenation normalizes to the same comparison value", () => {
  assert.equal(
    normalizeBootstrapFieldForComparison("family_contact_relationship", "Daughter in-law"),
    normalizeBootstrapFieldForComparison("family_contact_relationship", "Daughter in Law")
  );
});

test("REGRESSION (Doris Kakazu / Michele Helsley live case): phone formatting differences normalize to the same comparison value", () => {
  assert.equal(
    normalizeBootstrapFieldForComparison("family_contact_phone", "(214) 223-1930"),
    normalizeBootstrapFieldForComparison("family_contact_phone", "214-223-1930")
  );
});

test("relationship normalization never creates fuzzy semantic equivalence between different words", () => {
  assert.notEqual(
    normalizeBootstrapFieldForComparison("family_contact_relationship", "Daughter"),
    normalizeBootstrapFieldForComparison("family_contact_relationship", "Friend")
  );
  assert.notEqual(
    normalizeBootstrapFieldForComparison("family_contact_relationship", "Child"),
    normalizeBootstrapFieldForComparison("family_contact_relationship", "Daughter")
  );
});

test("a phone number that doesn't reduce to 10 digits is never silently equated with a different malformed number", () => {
  assert.notEqual(
    normalizeBootstrapFieldForComparison("family_contact_phone", "555-CALL-NOW"),
    normalizeBootstrapFieldForComparison("family_contact_phone", "555-OTHER-NUM")
  );
});

test("REGRESSION (Michele Helsley's real conflict): family_contact_name is never normalized away — a partial vs. full name stays genuinely different", () => {
  assert.notEqual(
    normalizeBootstrapFieldForComparison("family_contact_name", "Stephanie"),
    normalizeBootstrapFieldForComparison("family_contact_name", "Stephanie Helsley")
  );
});

test("date_of_birth and every other 'exact' field are untouched (trim only) — no accidental broadening", () => {
  assert.equal(normalizeBootstrapFieldForComparison("date_of_birth", "1950-01-01"), "1950-01-01");
  assert.equal(normalizeBootstrapFieldForComparison("gender", "  F "), "F");
});

// ─── End-to-end through computeUnresolvedFieldConflicts — proves the
// normalization actually eliminates formatting-only conflicts, not just
// the standalone normalizer. ───────────────────────────────────────────

test("REGRESSION (Elliot Goldberg #9, live shape): a formatting-only relationship difference is no longer reported as an open conflict", () => {
  const results = computeUnresolvedFieldConflicts(
    { family_contact_relationship: "Daughter in-law" },
    { family_contact_relationship: "Daughter in Law" },
    {},
    "2026-08-17T20:21:29.474Z"
  );
  assert.equal(results.length, 0);
});

test("REGRESSION (Doris Kakazu #12, live shape): a formatting-only phone difference is no longer reported as an open conflict", () => {
  const results = computeUnresolvedFieldConflicts(
    { family_contact_phone: "(214) 223-1930" },
    { family_contact_phone: "214-223-1930" },
    {},
    "2026-08-17T20:21:12.511Z"
  );
  assert.equal(results.length, 0);
});

test("REGRESSION (Michele Helsley #11, live shape): the phone formatting difference clears, but the genuine name conflict remains and still carries WHAT/WHY evidence", () => {
  const results = computeUnresolvedFieldConflicts(
    { family_contact_name: "Stephanie", family_contact_phone: "(816) 830-7146" },
    { family_contact_name: "Stephanie Helsley", family_contact_phone: "816-830-7146" },
    {},
    "2026-08-17T20:21:11.113Z"
  );
  assert.equal(results.length, 1, "only the genuine name conflict should remain open");
  assert.equal(results[0].field, "family_contact_name");
  assert.equal(results[0].serveValue, "Stephanie", "display value stays the RAW original, never the normalized one");
  assert.equal(results[0].axiscareValue, "Stephanie Helsley");
});

test("a genuinely different relationship word still surfaces as an open, reviewable conflict", () => {
  const results = computeUnresolvedFieldConflicts(
    { family_contact_relationship: "Daughter" },
    { family_contact_relationship: "Friend" },
    {},
    "2026-08-18T00:00:00Z"
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].serveValue, "Daughter");
  assert.equal(results[0].axiscareValue, "Friend");
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err);
    }
  }
  console.log(`\n${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();

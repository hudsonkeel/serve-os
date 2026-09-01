import assert from "node:assert/strict";
import {
  projectServeRelationship,
  applyServeRelationshipCorrection,
  type ServeRelationshipProjectionInput,
  type ServeRelationshipCorrection,
} from "../serveRelationshipProjection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const BASE: ServeRelationshipProjectionInput = {
  legacyResidentStatus: "none",
  activeRelationships: [],
  axiscareMatch: null,
  hasCinchEvidence: false,
};

test("AxisCare active_client match with candidate identity is Active Client (Doris Kakazu case) — identity never hides the relationship", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "12", operationalBucket: "active_client", identityStatus: "candidate" },
  });
  assert.equal(result.relationship, "active_client");
  assert.equal(result.relationshipSource, "axiscare");
  assert.equal(result.deliverySystem, "axiscare");
});

test("AxisCare active_client match with needs_identity_review identity is still Active Client (Fritschen/Fritchen case)", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "29", operationalBucket: "active_client", identityStatus: "needs_identity_review" },
  });
  assert.equal(result.relationship, "active_client");
});

test("AxisCare confirmed active_client + CINCH staged evidence reports both delivery systems", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "17", operationalBucket: "active_client", identityStatus: "confirmed" },
    hasCinchEvidence: true,
  });
  assert.equal(result.relationship, "active_client");
  assert.equal(result.deliverySystem, "both");
});

test("AxisCare inactive_client match is Inactive Client, sourced from AxisCare", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "4", operationalBucket: "inactive_client", identityStatus: "unmatched" },
  });
  assert.equal(result.relationship, "inactive_client");
  assert.equal(result.relationshipSource, "axiscare");
});

test("AxisCare prospect-class match is Prospect, sourced from AxisCare (Lead evidence, not a separate lifecycle)", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "20", operationalBucket: "prospect", identityStatus: "confirmed" },
  });
  assert.equal(result.relationship, "prospect");
});

test("AxisCare needs_review bucket (thin/ambiguous AxisCare record) is Needs Review", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "8", operationalBucket: "needs_review", identityStatus: "unmatched" },
  });
  assert.equal(result.relationship, "needs_review");
});

test("no AxisCare match, but a linked CRM active_client Relationship: still Active Client, sourced from the CRM", () => {
  const result = projectServeRelationship({
    ...BASE,
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "active" }],
  });
  assert.equal(result.relationship, "active_client");
  assert.equal(result.relationshipSource, "crm_relationship");
});

test("no AxisCare match, a linked resident_prospect Relationship: Prospect, with its pipeline stage surfaced", () => {
  const result = projectServeRelationship({
    ...BASE,
    activeRelationships: [{ relationshipType: "resident_prospect", stage: "assessment_scheduled", status: "active" }],
  });
  assert.equal(result.relationship, "prospect");
  assert.equal(result.prospectStage, "assessment_scheduled");
});

test("no AxisCare match, no CRM relationship, legacy status former_client: Inactive Client", () => {
  const result = projectServeRelationship({ ...BASE, legacyResidentStatus: "former_client" });
  assert.equal(result.relationship, "inactive_client");
  assert.equal(result.relationshipSource, "legacy_resident_status");
});

test("no AxisCare match, no CRM relationship, legacy status hold: Active Client, but onHold is FALSE — legacyResidentStatus (possibly CINCH-imported) never sets onHold", () => {
  const result = projectServeRelationship({ ...BASE, legacyResidentStatus: "hold" });
  assert.equal(result.relationship, "active_client");
  assert.equal(result.onHold, false);
});

test("REGRESSION: onHold is governed-CRM-relationship-sourced only — a vendor/import-derived legacyResidentStatus of 'hold' must never independently create an On Hold state", () => {
  const result = projectServeRelationship({ ...BASE, legacyResidentStatus: "hold", activeRelationships: [] });
  assert.equal(result.onHold, false);
});

test("onHold can be true even when the relationship comes from AxisCare (independent dimension)", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "12", operationalBucket: "active_client", identityStatus: "confirmed" },
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "on_hold" }],
  });
  assert.equal(result.relationship, "active_client");
  assert.equal(result.relationshipSource, "axiscare");
  assert.equal(result.onHold, true);
});

test("no AxisCare match, no CRM relationship, legacy status none: No Current Relationship", () => {
  const result = projectServeRelationship(BASE);
  assert.equal(result.relationship, "no_current_relationship");
  assert.equal(result.relationshipSource, "none");
});

test("legacy status wellness_watch (import quirk, not a real relationship signal) collapses to No Current Relationship", () => {
  const result = projectServeRelationship({ ...BASE, legacyResidentStatus: "wellness_watch" });
  assert.equal(result.relationship, "no_current_relationship");
});

test("legacy status prospect (no AxisCare, no CRM relationship) is still Prospect, not collapsed to none", () => {
  const result = projectServeRelationship({ ...BASE, legacyResidentStatus: "prospect" });
  assert.equal(result.relationship, "prospect");
  assert.equal(result.relationshipSource, "legacy_resident_status");
});

test("AxisCare match always wins over a conflicting CRM relationship signal (AxisCare is canonical external client repository)", () => {
  const result = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "4", operationalBucket: "inactive_client", identityStatus: "confirmed" },
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "active" }],
  });
  assert.equal(result.relationship, "inactive_client");
  assert.equal(result.relationshipSource, "axiscare");
});

test("delivery system is 'cinch' when only staged CINCH evidence exists, 'none' when neither exists", () => {
  const cinchOnly = projectServeRelationship({ ...BASE, hasCinchEvidence: true });
  assert.equal(cinchOnly.deliverySystem, "cinch");
  const neither = projectServeRelationship(BASE);
  assert.equal(neither.deliverySystem, "none");
});

// ─── applyServeRelationshipCorrection ──────────────────────────────────
//
// hasConflict semantics: a correction resolves the disagreement that
// existed between the natural/source relationship and the human's chosen
// value AT THE TIME OF CORRECTION. hasConflict therefore compares the
// CURRENT natural/source relationship against correction.previousValue
// (the natural value the human actually reviewed) — never against
// correction.newValue (the human's own chosen override, which by
// construction differs from the natural value for nearly every real
// correction, forever, regardless of whether anything has actually
// changed since). See the "RELATIONSHIP NEEDS REVIEW" infinite-loop
// investigation this fix resolves.

test("no correction: the natural projection passes through unchanged, naturalRelationship mirrors it", () => {
  const natural = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "active_client", identityStatus: "confirmed" },
  });
  const result = applyServeRelationshipCorrection(natural, null);
  assert.equal(result.relationship, "active_client");
  assert.equal(result.relationshipSource, "axiscare");
  assert.equal(result.correction, null);
  assert.equal(result.hasConflict, false);
  assert.equal(result.naturalRelationship, "active_client");
});

test("a correction overrides the natural projection and is sourced as human_correction; naturalRelationship still reflects the live source, not the override", () => {
  const natural = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "inactive_client", identityStatus: "confirmed" },
  });
  const correction: ServeRelationshipCorrection = {
    newValue: "active_client",
    previousValue: "inactive_client",
    actor: "Elizabeth",
    rationale: "Confirmed with the family this is an active client despite AxisCare showing inactive.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(natural, correction);
  assert.equal(result.relationship, "active_client");
  assert.equal(result.relationshipSource, "human_correction");
  assert.equal(result.correction, correction);
  assert.equal(result.naturalRelationship, "inactive_client");
});

// Test 1 — first correction resolves known disagreement
test("Test 1: a correction whose previousValue matches the natural value it reviewed has no conflict, and still governs display", () => {
  const natural = projectServeRelationship({
    ...BASE,
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "active" }],
  });
  assert.equal(natural.relationship, "active_client");

  const correction: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: "active_client",
    actor: "Elizabeth",
    rationale: "Family confirmed services ended; AxisCare hasn't been updated yet.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(natural, correction);
  assert.equal(result.relationship, "no_current_relationship", "the correction still governs the displayed value");
  assert.equal(result.correction, correction);
  assert.equal(result.hasConflict, false, "the source state is exactly what the human reviewed — no conflict");
});

// Test 2 — unchanged source does not re-trigger review
test("Test 2: re-evaluating against the same unchanged natural state keeps hasConflict false (no repeated review)", () => {
  const natural = projectServeRelationship({
    ...BASE,
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "active" }],
  });
  const correction: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: "active_client",
    actor: "Elizabeth",
    rationale: "Family confirmed services ended; AxisCare hasn't been updated yet.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  // A later, independent evaluation of the same natural input and the
  // same correction — simulating another page render with no upstream
  // change at all. Must not flip to a conflict.
  const result = applyServeRelationshipCorrection(natural, correction);
  assert.equal(result.hasConflict, false);
});

// Test 3 — new upstream source value reopens review
test("Test 3: the natural/source relationship changing after correction reopens hasConflict, while the correction still governs display", () => {
  const naturalAfterChange = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "inactive_client", identityStatus: "confirmed" },
  });
  assert.equal(naturalAfterChange.relationship, "inactive_client");

  // The existing correction still reflects what was true when it was made.
  const correction: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: "active_client",
    actor: "Elizabeth",
    rationale: "Family confirmed services ended; AxisCare hasn't been updated yet.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(naturalAfterChange, correction);
  assert.equal(result.relationship, "no_current_relationship", "the existing correction still governs display");
  assert.equal(result.hasConflict, true, "the source has materially moved since this correction was reviewed");
});

// Test 4 — second correction captures the new natural value
test("Test 4: a second correction recorded against the new natural value has no conflict while the source stays at that new value", () => {
  const naturalAfterChange = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "inactive_client", identityStatus: "confirmed" },
  });
  const secondCorrection: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    // Correctly captured from the NEW natural value, not the prior
    // correction's own newValue ("no_current_relationship") — this is
    // exactly what the naturalRelationship/naturalValue prop-wiring fix
    // guarantees at the UI layer.
    previousValue: "inactive_client",
    actor: "Elizabeth",
    rationale: "Re-confirmed after AxisCare updated to inactive.",
    createdAt: "2026-08-09T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(naturalAfterChange, secondCorrection);
  assert.equal(result.relationship, "no_current_relationship");
  assert.equal(result.hasConflict, false, "matches the source state this second correction actually reviewed");
});

// Test 5 — repeated corrections remain stable across cycles
test("Test 5: two full correction cycles each compare against the source state reviewed in that cycle, never a prior correction's own displayed value", () => {
  // Cycle 1: active_client -> corrected to no_current_relationship.
  const naturalCycle1 = projectServeRelationship({
    ...BASE,
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "active" }],
  });
  const correctionCycle1: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: naturalCycle1.relationship, // "active_client" — captured correctly the first time
    actor: "Elizabeth",
    rationale: "Cycle 1 correction.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const resultCycle1 = applyServeRelationshipCorrection(naturalCycle1, correctionCycle1);
  assert.equal(resultCycle1.hasConflict, false);

  // Source changes materially -> conflict reopens against the still-active correction.
  const naturalCycle2Source = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "inactive_client", identityStatus: "confirmed" },
  });
  const stillCycle1 = applyServeRelationshipCorrection(naturalCycle2Source, correctionCycle1);
  assert.equal(stillCycle1.hasConflict, true);

  // Cycle 2: human re-corrects. The new correction must capture the
  // natural value at THIS moment (inactive_client) — never
  // correctionCycle1.newValue ("no_current_relationship").
  const correctionCycle2: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: naturalCycle2Source.relationship, // "inactive_client"
    actor: "Elizabeth",
    rationale: "Cycle 2 correction.",
    createdAt: "2026-08-09T00:00:00.000Z",
  };
  const resultCycle2 = applyServeRelationshipCorrection(naturalCycle2Source, correctionCycle2);
  assert.equal(resultCycle2.hasConflict, false, "cycle 2 must be stable against the source it actually reviewed");

  // Prove the failure mode this test guards against: if previousValue had
  // been wrongly seeded from the prior correction's own displayed/newValue
  // instead of the true natural value, this same natural state would
  // incorrectly show a conflict.
  const wronglySeededCorrection: ServeRelationshipCorrection = {
    ...correctionCycle2,
    previousValue: correctionCycle1.newValue,
  };
  const buggyResult = applyServeRelationshipCorrection(naturalCycle2Source, wronglySeededCorrection);
  assert.equal(buggyResult.hasConflict, true, "demonstrates the exact contamination bug the naturalValue prop-wiring fix prevents");
});

// Test 6 — no correction: behavior is unchanged
test("Test 6: with no correction on record, natural projection and conflict semantics are unaffected by this fix", () => {
  const natural = projectServeRelationship(BASE);
  const result = applyServeRelationshipCorrection(natural, null);
  assert.equal(result.relationship, natural.relationship);
  assert.equal(result.relationshipSource, natural.relationshipSource);
  assert.equal(result.correction, null);
  assert.equal(result.hasConflict, false);
  assert.equal(result.naturalRelationship, natural.relationship);
});

// Test 7 — correction continues to govern display even during conflict
test("Test 7: hasConflict=true never changes which value is displayed — the latest correction still governs until a new human decision is made", () => {
  const naturalAfterChange = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "inactive_client", identityStatus: "confirmed" },
  });
  const correction: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: "active_client",
    actor: "Elizabeth",
    rationale: "Family confirmed services ended.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(naturalAfterChange, correction);
  assert.equal(result.hasConflict, true);
  assert.equal(result.relationship, "no_current_relationship", "the correction, not the natural value, must still be what's displayed");
  assert.equal(result.relationshipSource, "human_correction");
});

// Defensive: a correction record with no captured previousValue (the app
// itself never writes one, but the schema allows it) must never silently
// suppress review, per "do not hide legitimate future conflicts."
test("a correction with a null previousValue (no captured baseline) is conservatively treated as still needing review", () => {
  const natural = projectServeRelationship({
    ...BASE,
    activeRelationships: [{ relationshipType: "active_client", stage: "won", status: "active" }],
  });
  const correction: ServeRelationshipCorrection = {
    newValue: "no_current_relationship",
    previousValue: null,
    actor: "Elizabeth",
    rationale: "Legacy correction with no captured baseline.",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(natural, correction);
  assert.equal(result.hasConflict, true);
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

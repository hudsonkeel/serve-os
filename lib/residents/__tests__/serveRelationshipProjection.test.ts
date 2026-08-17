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

test("no correction: the natural projection passes through unchanged", () => {
  const natural = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "active_client", identityStatus: "confirmed" },
  });
  const result = applyServeRelationshipCorrection(natural, null);
  assert.equal(result.relationship, "active_client");
  assert.equal(result.relationshipSource, "axiscare");
  assert.equal(result.correction, null);
  assert.equal(result.hasConflict, false);
});

test("a correction overrides the natural projection and is sourced as human_correction", () => {
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
});

test("REGRESSION: a correction wins even when later vendor evidence disagrees, and the disagreement is surfaced as a conflict, not silently resolved either direction", () => {
  // Natural (uncorrected) projection now says inactive_client (new
  // AxisCare evidence), but a human previously corrected this resident
  // to active_client.
  const natural = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "inactive_client", identityStatus: "confirmed" },
  });
  const correction: ServeRelationshipCorrection = {
    newValue: "active_client",
    previousValue: "prospect",
    actor: "Elizabeth",
    rationale: "Reviewed and confirmed active with the family directly.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(natural, correction);
  assert.equal(result.relationship, "active_client", "the correction must still win for display");
  assert.equal(result.hasConflict, true, "the disagreement must be surfaced, not silently dropped");
});

test("a correction that still agrees with the current natural projection has no conflict", () => {
  const natural = projectServeRelationship({
    ...BASE,
    axiscareMatch: { axiscareId: "1", operationalBucket: "active_client", identityStatus: "confirmed" },
  });
  const correction: ServeRelationshipCorrection = {
    newValue: "active_client",
    previousValue: "needs_review",
    actor: "Elizabeth",
    rationale: "Confirmed active.",
    createdAt: "2026-08-08T00:00:00.000Z",
  };
  const result = applyServeRelationshipCorrection(natural, correction);
  assert.equal(result.hasConflict, false);
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

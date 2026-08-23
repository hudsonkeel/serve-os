// Pure-function tests for Audit Readiness's stricter reading of the
// canonical ServeRelationshipProjection — the one extra gate on top of
// /residents' own "Active Clients" definition (see
// auditEligibleActiveClient.ts's own comment for why).
//
//   node --experimental-strip-types --conditions=react-server lib/residents/__tests__/auditEligibleActiveClient.test.ts
import assert from "node:assert/strict";
import { isAuditEligibleActiveClient } from "../auditEligibleActiveClient.ts";
import type { ServeRelationship, ServeRelationshipSource } from "../serveRelationshipProjection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function projection(relationship: ServeRelationship, relationshipSource: ServeRelationshipSource) {
  return { relationship, relationshipSource };
}

test("confirmed AxisCare active client -> included", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "axiscare"), "confirmed"), true);
});

test("candidate AxisCare active client -> excluded from the Audit Readiness denominator", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "axiscare"), "candidate"), false);
});

test("needs_identity_review AxisCare match -> excluded", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "axiscare"), "needs_identity_review"), false);
});

test("unmatched AxisCare identity status -> excluded (defensive; relationshipSource='axiscare' implies a real match in practice)", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "axiscare"), "unmatched"), false);
});

test("null identity status on an AxisCare-sourced relationship -> excluded, never defaults to included", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "axiscare"), null), false);
});

test("confirmed prospect -> excluded (not an active client at all)", () => {
  assert.equal(isAuditEligibleActiveClient(projection("prospect", "axiscare"), "confirmed"), false);
});

test("CRM-derived active client -> included per the existing canonical projection rules, no identity gate applies", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "crm_relationship"), null), true);
});

test("legacy serve_relationship_status fallback-derived active client -> included, same as /residents trusts it", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "legacy_resident_status"), null), true);
});

test("human-corrected active client -> included; a reviewed human correction already outranks raw identity confidence", () => {
  assert.equal(isAuditEligibleActiveClient(projection("active_client", "human_correction"), "candidate"), true);
});

test("inactive_client -> excluded (covers both a genuinely former/discharged client and an established standby client — the gate reads only relationship, never why it's inactive)", () => {
  assert.equal(isAuditEligibleActiveClient(projection("inactive_client", "axiscare"), "confirmed"), false);
});

// REGRESSION (Frisco Needs Review investigation, 2026-08-23): standby
// inactive_client residents (e.g. an AxisCare "Active No Visits" class
// signal) must stay fully excluded from the Audit Readiness population —
// their record readiness is resident-profile-only, never an Audit
// Readiness denominator/numerator, requirement-completion count, or Needs
// Attention issue. isAuditEligibleActiveClient() requires
// relationship === 'active_client' as its very first check, so this is
// already guaranteed with no code change: an inactive_client resident
// never passes that check regardless of identity status.
test("REGRESSION: an established standby inactive_client (confirmed AxisCare identity) is still excluded from the Audit Readiness population", () => {
  assert.equal(isAuditEligibleActiveClient(projection("inactive_client", "axiscare"), "confirmed"), false);
});

test("no_current_relationship -> excluded", () => {
  assert.equal(isAuditEligibleActiveClient(projection("no_current_relationship", "none"), null), false);
});

test("needs_review relationship -> excluded", () => {
  assert.equal(isAuditEligibleActiveClient(projection("needs_review", "axiscare"), "confirmed"), false);
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

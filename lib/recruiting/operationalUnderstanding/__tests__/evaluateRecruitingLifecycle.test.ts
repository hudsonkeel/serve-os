import assert from "node:assert/strict";
import { evaluateRecruitingLifecycle } from "../evaluateRecruitingLifecycle.ts";
import type { RecruitingEvidenceBundle } from "../types.ts";
import type { RecruitingLeadObservation, RecruitingLeadVendorIdentity } from "../../../supabase/types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

let counter = 0;
function obs(overrides: Partial<RecruitingLeadObservation>): RecruitingLeadObservation {
  counter++;
  return {
    id: `obs-${counter}`,
    collector_run_id: "run-1",
    recruiting_lead_id: "lead-1",
    observation_key: "apploi.candidate_name",
    raw_label: null,
    normalized_value: null,
    visibility: "directly_observed",
    observed_at: "2026-07-30T00:00:00.000Z",
    created_at: "2026-07-30T00:00:00.000Z",
    source_system: "apploi",
    source_record_id: null,
    collected_at: "2026-07-30T00:00:00.000Z",
    source_location: null,
    extractor_version: null,
    extraction_confidence: null,
    match_method: null,
    failure_reason: null,
    sensitivity: "standard",
    collection_method: "automatic_dom",
    ...overrides,
  };
}

function vendorIdentity(overrides: Partial<RecruitingLeadVendorIdentity>): RecruitingLeadVendorIdentity {
  return {
    id: `vid-${++counter}`,
    recruiting_lead_id: "lead-1",
    source_system: "apploi",
    vendor_record_id: "candidate-123",
    vendor_display_name: "Alma Dhora Owolabi",
    match_method: "vendor_id",
    match_confidence: "high",
    is_human_confirmed: true,
    linked_by: "Hud",
    linked_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function almaBundle(includeApplicationExists: boolean): RecruitingEvidenceBundle {
  const observations = [
    obs({ observation_key: "apploi.candidate_name", normalized_value: "Alma Dhora Owolabi" }),
    obs({ observation_key: "apploi.position", normalized_value: "Independent Living Community Caregiver" }),
    obs({ observation_key: "apploi.resume_availability", normalized_value: "not_available" }),
    obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
  ];
  if (includeApplicationExists) {
    observations.push(obs({ observation_key: "apploi.application_exists", normalized_value: "true" }));
  }
  return {
    observations,
    inferences: [],
    humanConfirmations: [],
    vendorIdentities: [vendorIdentity({})],
  };
}

// ─── Alma worked example (per the approved corrected design) ──────────────
test("Alma without application_exists: Lead Identified satisfied, everything else unknown/not_applicable, no fabricated blocking", () => {
  const results = evaluateRecruitingLifecycle(almaBundle(false));
  const byKey = new Map(results.map((r) => [r.desiredStateKey, r]));

  assert.equal(byKey.get("recruiting.desired_state.lead_identified")?.status, "satisfied");
  assert.equal(byKey.get("recruiting.desired_state.application_received")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.candidate_evaluation_complete")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.hiring_decision_confirmed")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.employment_record_confirmed")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.employment_requirements_complete")?.status, "not_applicable");
  assert.equal(byKey.get("recruiting.desired_state.scheduling_ready")?.status, "not_applicable");

  // No stage anywhere is 'blocked' — resume absence and the Viventium
  // integration report must never fabricate a block.
  assert.ok(!results.some((r) => r.status === "blocked"));
});

test("Alma WITH application_exists = true: Application Received becomes satisfied, later stages remain honestly unresolved", () => {
  const results = evaluateRecruitingLifecycle(almaBundle(true));
  const byKey = new Map(results.map((r) => [r.desiredStateKey, r]));

  assert.equal(byKey.get("recruiting.desired_state.lead_identified")?.status, "satisfied");
  assert.equal(byKey.get("recruiting.desired_state.application_received")?.status, "satisfied");
  assert.equal(byKey.get("recruiting.desired_state.candidate_evaluation_complete")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.hiring_decision_confirmed")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.employment_record_confirmed")?.status, "unknown");
  assert.equal(byKey.get("recruiting.desired_state.employment_requirements_complete")?.status, "not_applicable");
  assert.equal(byKey.get("recruiting.desired_state.scheduling_ready")?.status, "not_applicable");
});

test("Gap taxonomy for Alma: a Policy-Dependent Consideration for resume, an Integration Gap for Viventium, Evidence/Human-Decision-Required gaps for what's not yet collected, zero Blocking Gaps", () => {
  const results = evaluateRecruitingLifecycle(almaBundle(true));
  const allGaps = results.flatMap((r) => r.gaps);
  const blocking = allGaps.filter((g) => g.kind === "blocking");
  const conflicting = allGaps.filter((g) => g.kind === "conflicting");
  const integration = allGaps.filter((g) => g.kind === "integration");
  const policyDependent = allGaps.filter((g) => g.kind === "policy_dependent_consideration");
  const evidence = allGaps.filter((g) => g.kind === "evidence");
  const humanDecisionRequired = allGaps.filter((g) => g.kind === "human_decision_required");

  assert.equal(blocking.length, 0);
  assert.equal(conflicting.length, 0);
  assert.equal(integration.length, 1);
  assert.equal(policyDependent.length, 1);
  assert.ok(evidence.length > 0, "missing observation-kind requirements should surface as Evidence Gaps");
  assert.ok(humanDecisionRequired.length > 0, "missing human_confirmation-kind requirements should surface as Human Decision Required gaps");
  assert.ok(/does not establish whether a Viventium employee record exists/i.test(integration[0].description));
  assert.ok(/has not adopted a requirement/i.test(policyDependent[0].description));
});

test("determinism: identical input produces an identical result", () => {
  const bundle = almaBundle(true);
  const first = evaluateRecruitingLifecycle(bundle);
  const second = evaluateRecruitingLifecycle(bundle);
  assert.deepEqual(first, second);
});

test("no unsupported hiring/interview-completion/onboarding/payroll/scheduling inference from Alma's evidence alone", () => {
  const results = evaluateRecruitingLifecycle(almaBundle(true));
  const byKey = new Map(results.map((r) => [r.desiredStateKey, r]));
  assert.notEqual(byKey.get("recruiting.desired_state.hiring_decision_confirmed")?.status, "satisfied");
  assert.notEqual(byKey.get("recruiting.desired_state.candidate_evaluation_complete")?.status, "satisfied");
  assert.notEqual(byKey.get("recruiting.desired_state.employment_record_confirmed")?.status, "satisfied");
  assert.notEqual(byKey.get("recruiting.desired_state.employment_requirements_complete")?.status, "satisfied");
  assert.notEqual(byKey.get("recruiting.desired_state.scheduling_ready")?.status, "satisfied");
});

console.log(`\n${passed}/${passed} passed`);

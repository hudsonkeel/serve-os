import assert from "node:assert/strict";
import { evaluateDesiredState } from "../evaluateDesiredState.ts";
import {
  LEAD_IDENTIFIED,
  APPLICATION_RECEIVED,
  CANDIDATE_EVALUATION_COMPLETE,
  HIRING_DECISION_CONFIRMED,
  EMPLOYMENT_RECORD_CONFIRMED,
  EMPLOYMENT_REQUIREMENTS_COMPLETE,
} from "../desiredStates.ts";
import type { DesiredStateStatus, RecruitingEvidenceBundle } from "../types.ts";
import type {
  RecruitingLeadObservation,
  RecruitingLeadHumanConfirmation,
  RecruitingLeadVendorIdentity,
} from "../../../supabase/types.ts";
import type { InferenceWithEvidence } from "../../../data/recruitingLeadEvidence.ts";

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

function confirmation(overrides: Partial<RecruitingLeadHumanConfirmation>): RecruitingLeadHumanConfirmation {
  return {
    id: `hc-${++counter}`,
    recruiting_lead_id: "lead-1",
    confirmation_key: "hiring_decision",
    confirmed_value: "hired",
    rationale: "test",
    actor: "Hud",
    confirmed_at: "2026-07-30T00:00:00.000Z",
    created_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function vendorIdentity(overrides: Partial<RecruitingLeadVendorIdentity>): RecruitingLeadVendorIdentity {
  return {
    id: `vid-${++counter}`,
    recruiting_lead_id: "lead-1",
    source_system: "apploi",
    vendor_record_id: "candidate-123",
    vendor_display_name: "Test Candidate",
    match_method: "vendor_id",
    match_confidence: "high",
    is_human_confirmed: true,
    linked_by: "Hud",
    linked_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function inference(overrides: Partial<InferenceWithEvidence>): InferenceWithEvidence {
  return {
    id: `inf-${++counter}`,
    recruiting_lead_id: "lead-1",
    rule_version_id: "rv-1",
    signal_key: "recruiting.possible_pipeline_stage_inconsistency",
    explanation: "test",
    strength: "moderate",
    unresolved_alternatives: [],
    evidence_needed_to_resolve: [],
    computed_at: "2026-07-30T00:00:00.000Z",
    created_at: "2026-07-30T00:00:00.000Z",
    supportingObservationIds: [],
    ...overrides,
  };
}

function emptyBundle(): RecruitingEvidenceBundle {
  return { observations: [], inferences: [], humanConfirmations: [], vendorIdentities: [] };
}

const NO_PRIOR = new Map<string, DesiredStateStatus>();

// ─── Lead Identified ───────────────────────────────────────────────────────
test("Lead Identified is unknown with zero evidence", () => {
  const result = evaluateDesiredState(LEAD_IDENTIFIED, emptyBundle(), NO_PRIOR);
  assert.equal(result.status, "unknown");
});

test("Lead Identified is satisfied by a confirmed vendor identity alone", () => {
  const bundle = { ...emptyBundle(), vendorIdentities: [vendorIdentity({ is_human_confirmed: true })] };
  const result = evaluateDesiredState(LEAD_IDENTIFIED, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
});

test("Lead Identified is NOT satisfied by an unconfirmed vendor identity alone", () => {
  const bundle = { ...emptyBundle(), vendorIdentities: [vendorIdentity({ is_human_confirmed: false })] };
  const result = evaluateDesiredState(LEAD_IDENTIFIED, bundle, NO_PRIOR);
  assert.notEqual(result.status, "satisfied");
});

// ─── Application Received — the core correction from Decision 1 ──────────
test("Application Received is NOT satisfied by a confirmed vendor identity alone", () => {
  const bundle = { ...emptyBundle(), vendorIdentities: [vendorIdentity({ is_human_confirmed: true })] };
  const result = evaluateDesiredState(APPLICATION_RECEIVED, bundle, NO_PRIOR);
  assert.notEqual(result.status, "satisfied");
  assert.equal(result.status, "unknown");
});

test("Application Received IS satisfied by apploi.application_exists = true", () => {
  const bundle = { ...emptyBundle(), observations: [obs({ observation_key: "apploi.application_exists", normalized_value: "true" })] };
  const result = evaluateDesiredState(APPLICATION_RECEIVED, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
});

test("Missing application_exists evidence produces unknown, never blocked", () => {
  const result = evaluateDesiredState(APPLICATION_RECEIVED, emptyBundle(), NO_PRIOR);
  assert.equal(result.status, "unknown");
  assert.equal(result.gaps.filter((g) => g.kind === "blocking").length, 0);
});

// ─── Candidate Evaluation Complete — resume absence must never block ──────
test("Resume absence (not_available) does NOT block Candidate Evaluation Complete — it's a Potential Gap only", () => {
  const bundle = { ...emptyBundle(), observations: [obs({ observation_key: "apploi.resume_availability", normalized_value: "not_available" })] };
  const result = evaluateDesiredState(CANDIDATE_EVALUATION_COMPLETE, bundle, NO_PRIOR);
  assert.notEqual(result.status, "blocked");
  const blockingGaps = result.gaps.filter((g) => g.kind === "blocking");
  assert.equal(blockingGaps.length, 0);
  const potentialGaps = result.gaps.filter((g) => g.kind === "policy_dependent_consideration");
  assert.equal(potentialGaps.length, 1);
  assert.ok(/has not adopted a requirement/i.test(potentialGaps[0].description));
});

test("Proposed requirements remain non-blocking regardless of the observed value", () => {
  const bundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "apploi.resume_availability", normalized_value: "not_available" }),
      obs({ observation_key: "apploi.interview_completed_evidence", normalized_value: "false_not_a_real_value" }),
    ],
  };
  const result = evaluateDesiredState(CANDIDATE_EVALUATION_COMPLETE, bundle, NO_PRIOR);
  assert.equal(result.status !== "blocked", true);
});

// ─── Employment Record Confirmed — Viventium source-limited evidence ──────
test("Source-limited Viventium integration evidence cannot block Employment Record Confirmed", () => {
  const bundle = {
    ...emptyBundle(),
    observations: [obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" })],
  };
  const result = evaluateDesiredState(EMPLOYMENT_RECORD_CONFIRMED, bundle, NO_PRIOR);
  assert.notEqual(result.status, "blocked");
  assert.equal(result.status, "unknown");
  const integrationGaps = result.gaps.filter((g) => g.kind === "integration");
  assert.equal(integrationGaps.length, 1);
  assert.ok(!/no.*employee exists|not transferred|employment record is missing|onboarding has not started/i.test(integrationGaps[0].description));
  assert.ok(/does not establish whether a Viventium employee record exists/i.test(integrationGaps[0].description));
});

test("Employment Record Confirmed IS satisfied by a direct positive Viventium observation", () => {
  const bundle = { ...emptyBundle(), observations: [obs({ observation_key: "viventium.employee_record_exists", normalized_value: "true" })] };
  const result = evaluateDesiredState(EMPLOYMENT_RECORD_CONFIRMED, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
});

// ─── Cross-system reconciliation wording (Phase 3 of the Assisted
// Cross-System Flight plan) ──────────────────────────────────────────────
test("reconciliation wording fires when Viventium shows a positive record AND Apploi's integration view still says no record", () => {
  const bundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "viventium.employee_record_exists", normalized_value: "true" }),
      obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
    ],
  };
  const result = evaluateDesiredState(EMPLOYMENT_RECORD_CONFIRMED, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
  const integrationGaps = result.gaps.filter((g) => g.kind === "integration");
  assert.equal(integrationGaps.length, 1);
  assert.ok(/reconciliation issue, not proof that either system is wrong/i.test(integrationGaps[0].description));
  assert.ok(/Viventium contains an employee\/new-hire record/i.test(integrationGaps[0].description));
});

test("without a positive Viventium record, the same negative Apploi observation keeps the generic (non-reconciliation) wording", () => {
  const bundle = {
    ...emptyBundle(),
    observations: [obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" })],
  };
  const result = evaluateDesiredState(EMPLOYMENT_RECORD_CONFIRMED, bundle, NO_PRIOR);
  const integrationGaps = result.gaps.filter((g) => g.kind === "integration");
  assert.equal(integrationGaps.length, 1);
  assert.ok(!/reconciliation issue/i.test(integrationGaps[0].description));
  assert.ok(/does not establish whether a Viventium employee record exists/i.test(integrationGaps[0].description));
});

test("Employment Record Confirmed IS satisfied by an authorized human confirmation", () => {
  const bundle = { ...emptyBundle(), humanConfirmations: [confirmation({ confirmation_key: "employment_record_confirmed", confirmed_value: "true" })] };
  const result = evaluateDesiredState(EMPLOYMENT_RECORD_CONFIRMED, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
});

// ─── Direct, adopted, blocking evidence — the one case that SHOULD block ──
test("Direct authoritative negative evidence blocks only when the requirement is adopted and blocking — classified as Conflicting Evidence, since two sources disagree", () => {
  const bundle = { ...emptyBundle(), inferences: [inference({ signal_key: "recruiting.possible_pipeline_stage_inconsistency" })] };
  const result = evaluateDesiredState(HIRING_DECISION_CONFIRMED, bundle, NO_PRIOR);
  assert.equal(result.status, "blocked");
  assert.equal(result.gaps.filter((g) => g.kind === "conflicting").length, 1);
  assert.equal(result.gaps.filter((g) => g.kind === "blocking").length, 0);
});

test("Hiring Decision Confirmed is satisfied by a human confirmation with no unresolved inconsistency", () => {
  const bundle = { ...emptyBundle(), humanConfirmations: [confirmation({})] };
  const result = evaluateDesiredState(HIRING_DECISION_CONFIRMED, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
});

test("Hiring Decision Confirmed is unknown, never satisfied, with zero evidence — no unsupported hiring inference", () => {
  const result = evaluateDesiredState(HIRING_DECISION_CONFIRMED, emptyBundle(), NO_PRIOR);
  assert.equal(result.status, "unknown");
});

// ─── Prerequisite gating ──────────────────────────────────────────────────
test("Prerequisite gating produces not_applicable when the gating stage isn't satisfied", () => {
  const prior = new Map<string, DesiredStateStatus>([["recruiting.desired_state.employment_record_confirmed", "unknown"]]);
  const result = evaluateDesiredState(EMPLOYMENT_REQUIREMENTS_COMPLETE, emptyBundle(), prior);
  assert.equal(result.status, "not_applicable");
});

test("Gating passes through once the prerequisite is satisfied", () => {
  const prior = new Map<string, DesiredStateStatus>([["recruiting.desired_state.employment_record_confirmed", "satisfied"]]);
  const result = evaluateDesiredState(EMPLOYMENT_REQUIREMENTS_COMPLETE, emptyBundle(), prior);
  assert.notEqual(result.status, "not_applicable");
  assert.equal(result.status, "unknown"); // no I-9/W-4/direct-deposit evidence collected
});

// ─── Explainability ────────────────────────────────────────────────────────
test("Every evaluation cites its supporting observation ids when evidence exists", () => {
  const observation = obs({ observation_key: "apploi.application_exists", normalized_value: "true" });
  const bundle = { ...emptyBundle(), observations: [observation] };
  const result = evaluateDesiredState(APPLICATION_RECEIVED, bundle, NO_PRIOR);
  assert.deepEqual(result.supportingObservationIds, [observation.id]);
});

// ─── Precedence: blocked > unknown > in_progress > satisfied ──────────────
import type { DesiredStateDefinition } from "../types.ts";

function syntheticDefinition(overrides: Partial<DesiredStateDefinition>): DesiredStateDefinition {
  return {
    key: "test.synthetic",
    version: 1,
    title: "Synthetic",
    purpose: "test",
    evidenceCombinator: "all",
    requiredEvidence: [],
    optionalSupportingEvidence: [],
    gatedBy: [],
    operationalOwner: "test",
    completionCriteria: "test",
    ...overrides,
  };
}

const ADOPTED_BLOCKING = {
  establishedBy: "test",
  requirementClass: "organizational" as const,
  effectiveFrom: "2026-01-01",
  applicabilityConditions: null,
  blockingEffect: "blocking" as const,
  authoritativeEvidenceSource: "test",
  status: "adopted" as const,
};

test("precedence: blocked wins over unknown and satisfied in an 'all' combinator", () => {
  const definition = syntheticDefinition({
    requiredEvidence: [
      { key: "a", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
      {
        key: "b",
        kind: "observation",
        scopeJustification: "t",
        negativeEvidence: { values: ["no"], evidenceClass: "direct", scopeNote: "t" },
        governance: ADOPTED_BLOCKING,
      },
      { key: "c", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
    ],
  });
  const bundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "a", normalized_value: "yes" }),
      obs({ observation_key: "b", normalized_value: "no" }),
      // c has no evidence at all — would be "unknown"
    ],
  };
  const result = evaluateDesiredState(definition, bundle, NO_PRIOR);
  assert.equal(result.status, "blocked");
});

test("precedence: unknown wins over in_progress when nothing is blocked and nothing is fully satisfied", () => {
  const definition = syntheticDefinition({
    requiredEvidence: [
      { key: "a", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
      { key: "b", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
    ],
  });
  const result = evaluateDesiredState(definition, emptyBundle(), NO_PRIOR);
  assert.equal(result.status, "unknown");
});

test("precedence: in_progress when some are satisfied and some are unknown, none blocked", () => {
  const definition = syntheticDefinition({
    requiredEvidence: [
      { key: "a", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
      { key: "b", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
    ],
  });
  const bundle = { ...emptyBundle(), observations: [obs({ observation_key: "a", normalized_value: "yes" })] };
  const result = evaluateDesiredState(definition, bundle, NO_PRIOR);
  assert.equal(result.status, "in_progress");
});

test("precedence: satisfied only when every required entry in an 'all' combinator is satisfied", () => {
  const definition = syntheticDefinition({
    requiredEvidence: [
      { key: "a", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
      { key: "b", kind: "observation", scopeJustification: "t", satisfiedByValues: ["yes"], governance: ADOPTED_BLOCKING },
    ],
  });
  const bundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "a", normalized_value: "yes" }),
      obs({ observation_key: "b", normalized_value: "yes" }),
    ],
  };
  const result = evaluateDesiredState(definition, bundle, NO_PRIOR);
  assert.equal(result.status, "satisfied");
});

test("an unadopted requirement's negative value never contributes 'blocked', only a Potential Gap", () => {
  const definition = syntheticDefinition({
    requiredEvidence: [
      {
        key: "a",
        kind: "observation",
        scopeJustification: "t",
        negativeEvidence: { values: ["no"], evidenceClass: "direct", scopeNote: "t" },
        governance: { ...ADOPTED_BLOCKING, status: "proposed" },
      },
    ],
  });
  const bundle = { ...emptyBundle(), observations: [obs({ observation_key: "a", normalized_value: "no" })] };
  const result = evaluateDesiredState(definition, bundle, NO_PRIOR);
  assert.notEqual(result.status, "blocked");
  assert.equal(result.gaps.filter((g) => g.kind === "policy_dependent_consideration").length, 1);
  assert.equal(result.gaps.filter((g) => g.kind === "blocking").length, 0);
});

console.log(`\n${passed}/${passed} passed`);

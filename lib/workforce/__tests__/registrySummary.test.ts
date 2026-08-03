// Pure-function tests for Workforce's lifecycle-aware compliance
// interpretation — see lib/workforce/registrySummary.ts.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/registrySummary.test.ts
import assert from "node:assert/strict";
import { resolveRequirementDisplay, summarizeWorkforceRegistry, isEligibleForComplianceFilters } from "../registrySummary.ts";
import type { RequirementEvaluation, RequirementSetEvaluation } from "../../compliance/requirementSetStatus.ts";
import type { PersonEvidence, PersonRequirement } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function requirement(overrides: Partial<PersonRequirement> = {}): PersonRequirement {
  return {
    id: "req-nar",
    requirement_code: "TX_NAR_SEARCH",
    name: "Nurse Aide Registry Search",
    description: null,
    category: "registry_check",
    requires_document: true,
    requires_verification: true,
    is_active: true,
    required_score: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function evidence(overrides: Partial<PersonEvidence> = {}): PersonEvidence {
  return {
    id: "ev-1",
    subject_type: "workforce_member",
    subject_id: "member-1",
    requirement_id: "req-nar",
    document_id: "doc-1",
    verification_status: "verified",
    lifecycle_status: "active",
    lifecycle_status_reason: null,
    lifecycle_status_changed_by: null,
    lifecycle_status_changed_at: null,
    result: "no_record_returned",
    source_system: "manual_upload",
    performed_at: null,
    effective_date: "2026-01-01",
    review_due_date: null,
    expiration_date: null,
    entered_by: "staff@example.com",
    verified_by: "reviewer@example.com",
    verified_at: "2026-01-02T00:00:00Z",
    notes: null,
    supersedes_evidence_id: null,
    numeric_score: null,
    authoritative_source_system: null,
    collection_method: null,
    verification_method: null,
    attestation_result: null,
    external_reference: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function requirementEvaluation(overrides: Partial<RequirementEvaluation> = {}): RequirementEvaluation {
  return {
    requirement: requirement(),
    status: "missing",
    latestEvidence: null,
    explanation: "Nurse Aide Registry Search is missing — no evidence has been recorded.",
    ...overrides,
  };
}

function registryEvaluation(overrides: Partial<RequirementSetEvaluation> = {}): RequirementSetEvaluation {
  return {
    status: "incomplete",
    explanation: "Incomplete because Nurse Aide Registry Search is missing — no evidence has been recorded.",
    requirements: [requirementEvaluation()],
    ...overrides,
  };
}

// ─── resolveRequirementDisplay ─────────────────────────────────────────────
test("missing requirement for a terminated caregiver displays as not_currently_required", () => {
  const display = resolveRequirementDisplay(requirementEvaluation({ status: "missing" }), "terminated");
  assert.equal(display.displayStatus, "not_currently_required");
  assert.equal(display.displayExplanation, "Not currently required — caregiver terminated.");
});

test("missing requirement for an active caregiver is unaffected", () => {
  const evaluation = requirementEvaluation({ status: "missing" });
  const display = resolveRequirementDisplay(evaluation, "active");
  assert.equal(display.displayStatus, "missing");
  assert.equal(display.displayExplanation, evaluation.explanation);
});

test("terminated caregiver's satisfied (verified) evidence is preserved and displayed unchanged — never suppressed", () => {
  const ev = evidence({ verification_status: "verified" });
  const evaluation = requirementEvaluation({ status: "satisfied", latestEvidence: ev, explanation: "Nurse Aide Registry Search is satisfied — verified." });
  const display = resolveRequirementDisplay(evaluation, "terminated");
  assert.equal(display.displayStatus, "satisfied");
  assert.equal(display.latestEvidence, ev);
  assert.equal(display.latestEvidence?.verified_by, "reviewer@example.com");
});

test("terminated caregiver's awaiting_verification/requires_review/expired evidence also pass through unchanged", () => {
  for (const status of ["awaiting_verification", "requires_review", "expired"] as const) {
    const ev = evidence({ verification_status: status === "requires_review" ? "rejected" : "unverified" });
    const evaluation = requirementEvaluation({ status, latestEvidence: ev, explanation: `some explanation for ${status}` });
    const display = resolveRequirementDisplay(evaluation, "terminated");
    assert.equal(display.displayStatus, status, `${status} should not be overridden for terminated caregivers`);
    assert.equal(display.latestEvidence, ev);
  }
});

// ─── summarizeWorkforceRegistry: lifecycle counts ─────────────────────────
test("summarizeWorkforceRegistry counts each lifecycle bucket independently", () => {
  const summary = summarizeWorkforceRegistry([
    { lifecycleStatus: "active", registry: registryEvaluation() },
    { lifecycleStatus: "active", registry: registryEvaluation() },
    { lifecycleStatus: "inactive", registry: registryEvaluation() },
    { lifecycleStatus: "terminated", registry: registryEvaluation() },
    { lifecycleStatus: "pending_start", registry: registryEvaluation() },
  ]);
  assert.equal(summary.active, 2);
  assert.equal(summary.inactive, 1);
  assert.equal(summary.terminated, 1);
  assert.equal(summary.pendingStart, 1);
});

// ─── Terminated caregivers excluded from compliance summary denominators ──
test("terminated caregivers excluded from missingEvidence, awaitingVerification, bothComplete, narComplete, emrComplete, and the eligible denominator", () => {
  const narReq = requirement({ id: "req-nar", requirement_code: "TX_NAR_SEARCH" });
  const emrReq = requirement({ id: "req-emr", requirement_code: "TX_EMR_SEARCH", name: "Employee Misconduct Registry Search" });

  const activeIncomplete = {
    lifecycleStatus: "active" as const,
    registry: registryEvaluation({
      status: "incomplete",
      requirements: [requirementEvaluation({ requirement: narReq, status: "missing" })],
    }),
  };
  const activeAwaiting = {
    lifecycleStatus: "active" as const,
    registry: registryEvaluation({
      status: "awaiting_verification",
      requirements: [requirementEvaluation({ requirement: narReq, status: "awaiting_verification" })],
    }),
  };
  const activeComplete = {
    lifecycleStatus: "active" as const,
    registry: registryEvaluation({
      status: "complete",
      requirements: [
        requirementEvaluation({ requirement: narReq, status: "satisfied" }),
        requirementEvaluation({ requirement: emrReq, status: "satisfied" }),
      ],
    }),
  };
  // A terminated caregiver with genuinely missing evidence — must not
  // count toward missingEvidence, narComplete/emrComplete denominators, or
  // complianceEligibleCount, even though their raw registry.status would
  // otherwise read "incomplete".
  const terminatedIncomplete = {
    lifecycleStatus: "terminated" as const,
    registry: registryEvaluation({
      status: "incomplete",
      requirements: [requirementEvaluation({ requirement: narReq, status: "missing" })],
    }),
  };
  // A terminated caregiver who *does* have complete verified evidence —
  // also excluded from the "current" bothComplete count, per the mission's
  // explicit instruction that terminated caregivers never count toward
  // "Registry Evidence Complete denominator."
  const terminatedComplete = {
    lifecycleStatus: "terminated" as const,
    registry: registryEvaluation({
      status: "complete",
      requirements: [
        requirementEvaluation({ requirement: narReq, status: "satisfied" }),
        requirementEvaluation({ requirement: emrReq, status: "satisfied" }),
      ],
    }),
  };

  const summary = summarizeWorkforceRegistry([
    activeIncomplete,
    activeAwaiting,
    activeComplete,
    terminatedIncomplete,
    terminatedComplete,
  ]);

  assert.equal(summary.missingEvidence, 1, "only the active incomplete caregiver should count");
  assert.equal(summary.awaitingVerification, 1, "only the active awaiting caregiver should count");
  assert.equal(summary.bothComplete, 1, "terminatedComplete must not count toward bothComplete");
  assert.equal(summary.narComplete, 1, "terminatedComplete's satisfied NAR must not count toward narComplete");
  assert.equal(summary.emrComplete, 1, "terminatedComplete's satisfied EMR must not count toward emrComplete");
  assert.equal(summary.complianceEligibleCount, 3, "denominator excludes both terminated entries");
  assert.equal(summary.terminated, 2, "the lifecycle bucket itself still counts both terminated caregivers");
});

test("isEligibleForComplianceFilters excludes only terminated", () => {
  assert.equal(isEligibleForComplianceFilters("active"), true);
  assert.equal(isEligibleForComplianceFilters("inactive"), true);
  assert.equal(isEligibleForComplianceFilters("pending_start"), true);
  assert.equal(isEligibleForComplianceFilters("terminated"), false);
});

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

import assert from "node:assert/strict";
import type { RecruitingLeadObservation } from "../../supabase/types.ts";
import { deriveHiringSynthesis, type VendorEvidenceInput } from "../deriveHiringSynthesis.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

let obsCounter = 0;
function makeObservation(overrides: Partial<RecruitingLeadObservation>): RecruitingLeadObservation {
  obsCounter++;
  return {
    id: `obs-${obsCounter}`,
    collector_run_id: "run-1",
    recruiting_lead_id: "lead-1",
    observation_key: "apploi.application_submitted",
    raw_label: null,
    normalized_value: "true",
    visibility: "directly_observed",
    observed_at: "2026-07-20T19:00:00.000Z",
    created_at: "2026-07-20T19:00:00.000Z",
    source_system: "apploi",
    source_record_id: null,
    collected_at: "2026-07-20T19:00:00.000Z",
    source_location: null,
    extractor_version: null,
    extraction_confidence: null,
    match_method: null,
    failure_reason: null,
    sensitivity: "standard",
    collection_method: "guided_manual",
    ...overrides,
  };
}

function vendorEvidence(overrides: Partial<VendorEvidenceInput>): VendorEvidenceInput {
  return {
    runStatus: "success",
    matchStatus: "found",
    observations: [],
    observedAt: "2026-07-20T19:00:00.000Z",
    ...overrides,
  };
}

test("no evidence at all produces a neutral state, no fabricated exceptions or requirements", () => {
  const result = deriveHiringSynthesis({ leadStatus: "new", apploi: null, viventium: null });
  assert.equal(result.currentState, "No vendor evidence has been collected yet for this lead.");
  assert.equal(result.requirements.length, 0);
  assert.ok(result.unknowns.includes("No Apploi search has been performed yet."));
  assert.ok(result.unknowns.includes("No Viventium search has been performed yet."));
  assert.equal(result.exceptions.length, 0);
});

test("Apploi 'not_found' produces an exception, never a negative requirement", () => {
  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: vendorEvidence({ matchStatus: "not_found", observations: [] }),
    viventium: null,
  });
  assert.equal(result.requirements.length, 0, "no requirements should be derived when the candidate wasn't found");
  assert.ok(
    result.exceptions.some((e) => e.includes("no matching record was found") && e.includes("not evidence the candidate never applied")),
    "must explicitly say not-found is not proof of non-occurrence"
  );
});

test("a 'not_visible' field observation yields 'unknown', never 'unmet'", () => {
  const submitted = makeObservation({ observation_key: "apploi.application_submitted", normalized_value: "true" });
  const interviewCompleted = makeObservation({
    observation_key: "apploi.interview_completed",
    normalized_value: null,
    visibility: "not_visible",
    raw_label: null,
  });
  const scheduled = makeObservation({ observation_key: "apploi.interview_scheduled", normalized_value: "true" });

  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: vendorEvidence({ observations: [submitted, scheduled, interviewCompleted] }),
    viventium: null,
  });

  const completedReq = result.requirements.find((r) => r.key === "apploi_interview_completed");
  assert.ok(completedReq);
  assert.equal(completedReq!.status, "unknown");
  assert.ok(result.unknowns.some((u) => u.includes("Apploi interview completed")));
});

test("a directly_observed negative value is a legitimate 'unmet', not 'unknown'", () => {
  const submitted = makeObservation({
    observation_key: "apploi.application_submitted",
    normalized_value: "false",
    visibility: "directly_observed",
  });
  const result = deriveHiringSynthesis({
    leadStatus: "new",
    apploi: vendorEvidence({ observations: [submitted] }),
    viventium: null,
  });
  const req = result.requirements.find((r) => r.key === "apploi_application_submitted");
  assert.equal(req!.status, "unmet");
});

test("Viventium found with I-9 completed produces the onboarding-underway synthesis", () => {
  const i9 = makeObservation({ observation_key: "viventium.i9_status", normalized_value: "completed" });
  const result = deriveHiringSynthesis({
    leadStatus: "hired",
    apploi: null,
    viventium: vendorEvidence({ observations: [i9] }),
  });
  assert.equal(result.currentState, "Onboarding is underway in Viventium (I-9 on file).");
});

test("a failed collector run produces an exception, not a not_found conclusion", () => {
  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: vendorEvidence({ runStatus: "failed", matchStatus: null, observations: [] }),
    viventium: null,
  });
  assert.ok(result.exceptions.some((e) => e.includes("could not be reached")));
  assert.ok(!result.exceptions.some((e) => e.includes("no matching record was found")));
});

test("every requirement's basedOn carries the observation's observedAt", () => {
  const submitted = makeObservation({ observation_key: "apploi.application_submitted", observed_at: "2026-07-19T12:00:00.000Z" });
  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: vendorEvidence({ observations: [submitted] }),
    viventium: null,
  });
  const req = result.requirements.find((r) => r.key === "apploi_application_submitted");
  assert.equal(req!.basedOn[0].observedAt, "2026-07-19T12:00:00.000Z");
  assert.equal(req!.basedOn[0].sourceSystem, "apploi");
});

test("'why' always includes the current Serve OS recruiting status as its own labeled source", () => {
  const result = deriveHiringSynthesis({ leadStatus: "contacted", apploi: null, viventium: null });
  assert.ok(result.why.some((r) => r.sourceSystem === "serve_os" && r.label.includes("contacted")));
});

test("determinism: identical input produces an identical result", () => {
  const submitted = makeObservation({ observation_key: "apploi.application_submitted" });
  const input = {
    leadStatus: "applied" as const,
    apploi: vendorEvidence({ observations: [submitted] }),
    viventium: null,
  };
  const a = deriveHiringSynthesis(input);
  const b = deriveHiringSynthesis(input);
  assert.deepEqual(a, b);
});

// ─── Three-class evidence separation (docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md) ──

test("a cross-system inconsistency inference drives currentState and appears as an exception, distinct from unknowns/requirements", () => {
  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: vendorEvidence({ observations: [] }),
    viventium: vendorEvidence({ observations: [] }),
    inferences: [
      {
        signalKey: "recruiting.cross_system_stage_inconsistency",
        explanation: "Apploi shows Requested Interview while Viventium shows a new-hire record.",
        strength: "strong",
        unresolvedAlternatives: ["Apploi may be stale."],
        evidenceNeededToResolve: ["A human-confirmed hiring decision."],
        computedAt: "2026-07-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(result.currentState, "Apploi shows Requested Interview while Viventium shows a new-hire record.");
  assert.ok(result.exceptions.includes("Apploi shows Requested Interview while Viventium shows a new-hire record."));
  assert.ok(result.unknowns.includes("A human-confirmed hiring decision."));
  assert.equal(result.inferences.length, 1);
});

test("inferences are returned as their own structurally separate field, never merged into requirements or observations", () => {
  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: null,
    viventium: null,
    inferences: [
      {
        signalKey: "recruiting.positive_candidate_assessment_present",
        explanation: "A positive vendor rating is directly observed.",
        strength: "strong",
        unresolvedAlternatives: [],
        evidenceNeededToResolve: [],
        computedAt: "2026-07-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(result.inferences.length, 1);
  assert.equal(result.requirements.length, 0);
  // A non-exception-signal inference must not itself become an exception.
  assert.ok(!result.exceptions.some((e) => e.includes("positive vendor rating")));
});

test("human confirmations appear in 'why' with actor and are a separate field from inferences/observations", () => {
  const result = deriveHiringSynthesis({
    leadStatus: "applied",
    apploi: null,
    viventium: null,
    humanConfirmations: [
      {
        id: "conf-1",
        recruiting_lead_id: "lead-1",
        confirmation_key: "identity_link.apploi_viventium",
        confirmed_value: "same_person",
        rationale: "Confirmed by comparing full name and community assignment.",
        actor: "Hud",
        confirmed_at: "2026-07-21T00:00:00.000Z",
        created_at: "2026-07-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(result.humanConfirmations.length, 1);
  assert.ok(result.why.some((r) => r.label.includes("Human confirmed") && r.label.includes("Hud")));
});

test("omitting inferences/humanConfirmations entirely is still safe — both default to empty, backward compatible", () => {
  const result = deriveHiringSynthesis({ leadStatus: "new", apploi: null, viventium: null });
  assert.deepEqual(result.inferences, []);
  assert.deepEqual(result.humanConfirmations, []);
});

console.log(`\n${passed}/${passed} passed`);

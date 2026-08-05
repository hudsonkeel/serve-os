import assert from "node:assert/strict";
import { generateOperationalBrief } from "../generateOperationalBrief.ts";
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
    observed_at: "2026-07-31T00:00:00.000Z",
    created_at: "2026-07-31T00:00:00.000Z",
    source_system: "apploi",
    source_record_id: null,
    collected_at: "2026-07-31T00:00:00.000Z",
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
    linked_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function emptyBundle(): RecruitingEvidenceBundle {
  return { observations: [], inferences: [], humanConfirmations: [], vendorIdentities: [] };
}

test("current-evidence-only brief (no Viventium data yet) stays modest — no fabricated claims", () => {
  const bundle: RecruitingEvidenceBundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "apploi.candidate_name", normalized_value: "Alma Dhora Owolabi" }),
      obs({ observation_key: "apploi.application_exists", normalized_value: "true" }),
    ],
    vendorIdentities: [vendorIdentity({})],
  };
  const results = evaluateRecruitingLifecycle(bundle);
  const brief = generateOperationalBrief(results, "Alma Dhora Owolabi");
  assert.ok(!/employee record/i.test(brief.currentUnderstanding));
  assert.ok(!/hired|not hired/i.test(brief.currentUnderstanding));
});

test("cross-system brief: Viventium positive record + Apploi negative integration view produces the reconciliation sentence and action", () => {
  const bundle: RecruitingEvidenceBundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "apploi.candidate_name", normalized_value: "Alma Dhora Owolabi" }),
      obs({ observation_key: "apploi.application_exists", normalized_value: "true" }),
      obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
      obs({ observation_key: "viventium.employee_record_exists", normalized_value: "true" }),
    ],
    vendorIdentities: [vendorIdentity({})],
  };
  const results = evaluateRecruitingLifecycle(bundle);
  const brief = generateOperationalBrief(results, "Alma Dhora Owolabi");

  assert.ok(/active Apploi application/i.test(brief.currentUnderstanding));
  assert.ok(/Viventium employee record/i.test(brief.currentUnderstanding));
  assert.ok(/reconciliation issue/i.test(brief.currentUnderstanding));
  assert.ok(/not proof that either system is wrong/i.test(brief.currentUnderstanding));
  assert.equal(brief.nextAction, "Confirm the hiring decision and reconcile the Apploi–Viventium linkage.");
});

test("brief never claims a remediation of a confirmed failure when only Integration/Potential gaps exist", () => {
  const bundle: RecruitingEvidenceBundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "apploi.resume_availability", normalized_value: "not_available" }),
      obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
    ],
    vendorIdentities: [vendorIdentity({})],
  };
  const results = evaluateRecruitingLifecycle(bundle);
  const brief = generateOperationalBrief(results, "Alma Dhora Owolabi");
  assert.ok(!/failed|has not been hired|rejected/i.test(brief.currentUnderstanding));
});

test("whyThisMatters is capped at 3 and uncertainty is capped at 3", () => {
  const bundle: RecruitingEvidenceBundle = {
    ...emptyBundle(),
    observations: [
      obs({ observation_key: "apploi.application_exists", normalized_value: "true" }),
      obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
      obs({ observation_key: "viventium.employee_record_exists", normalized_value: "true" }),
    ],
    vendorIdentities: [vendorIdentity({})],
  };
  const results = evaluateRecruitingLifecycle(bundle);
  const brief = generateOperationalBrief(results, "Alma Dhora Owolabi");
  assert.ok(brief.whyThisMatters.length <= 3);
  assert.ok(brief.uncertainty.length <= 3);
});

console.log(`\n${passed}/${passed} passed`);

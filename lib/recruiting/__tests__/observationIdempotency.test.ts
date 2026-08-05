import assert from "node:assert/strict";
import { planStateObservationWrites } from "../observationIdempotency.ts";
import type { ObservationInput } from "../../data/recruitingLeadCollector.ts";
import type { RecruitingLeadObservation } from "../../supabase/types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

let counter = 0;
function existingObs(overrides: Partial<RecruitingLeadObservation>): RecruitingLeadObservation {
  counter++;
  return {
    id: `obs-${counter}`,
    collector_run_id: "run-1",
    recruiting_lead_id: "lead-1",
    observation_key: "apploi.position",
    raw_label: "Independent Living Community Caregiver",
    normalized_value: "Independent Living Community Caregiver",
    visibility: "directly_observed",
    observed_at: "2026-07-21T00:00:00.000Z",
    created_at: "2026-07-21T00:00:00.000Z",
    source_system: "apploi",
    source_record_id: "candidate-123",
    collected_at: "2026-07-21T00:00:00.000Z",
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

function candidate(overrides: Partial<ObservationInput>): ObservationInput {
  return {
    observationKey: "apploi.position",
    rawLabel: "Independent Living Community Caregiver",
    normalizedValue: "Independent Living Community Caregiver",
    visibility: "directly_observed",
    observedAt: "2026-07-22T00:00:00.000Z",
    sourceSystem: "apploi",
    sourceRecordId: "candidate-123",
    ...overrides,
  };
}

test("unchanged state observation is not re-recorded on a repeat run", () => {
  const existing = [existingObs({})];
  const plan = planStateObservationWrites(existing, [candidate({})]);
  assert.equal(plan.toInsert.length, 0);
  assert.deepEqual(plan.skippedUnchanged, ["apploi.position"]);
});

test("changed state observation inserts a new row, preserving the old one (history never overwritten)", () => {
  const existing = [existingObs({ normalized_value: "Independent Living Community Caregiver" })];
  const plan = planStateObservationWrites(existing, [candidate({ normalizedValue: "Caregiver II" })]);
  assert.equal(plan.toInsert.length, 1);
  assert.equal(plan.toInsert[0].normalizedValue, "Caregiver II");
  assert.deepEqual(plan.skippedUnchanged, []);
  // The prior row itself is never mutated or removed by this function —
  // it only ever decides what to insert.
  assert.equal(existing[0].normalized_value, "Independent Living Community Caregiver");
});

test("a brand-new observation key with no prior history is always inserted", () => {
  const plan = planStateObservationWrites([], [candidate({})]);
  assert.equal(plan.toInsert.length, 1);
});

test("non-directly-observed outcomes (not_visible/unknown/ambiguous) are always recorded, never deduplicated", () => {
  const existing = [existingObs({ visibility: "not_visible", normalized_value: null })];
  const plan = planStateObservationWrites(existing, [
    candidate({ visibility: "not_visible", normalizedValue: null }),
  ]);
  assert.equal(plan.toInsert.length, 1);
  assert.deepEqual(plan.skippedUnchanged, []);
});

test("identity is scoped per (source_system, source_record_id, observation_key) — a different candidate's identical value is not deduplicated against", () => {
  const existing = [existingObs({ source_record_id: "candidate-OTHER" })];
  const plan = planStateObservationWrites(existing, [candidate({ sourceRecordId: "candidate-123" })]);
  assert.equal(plan.toInsert.length, 1);
});

test("a different observation key for the same candidate is never deduplicated against another key's value", () => {
  const existing = [existingObs({ observation_key: "apploi.candidate_name", normalized_value: "Independent Living Community Caregiver" })];
  const plan = planStateObservationWrites(existing, [candidate({ observationKey: "apploi.position" })]);
  assert.equal(plan.toInsert.length, 1);
});

console.log(`\n${passed}/${passed} passed`);

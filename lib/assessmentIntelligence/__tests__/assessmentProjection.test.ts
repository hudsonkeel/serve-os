import assert from "node:assert/strict";
import {
  buildAssessmentProjection,
  mergeEffectiveFacts,
  type EffectiveFact,
} from "../assessmentProjection.ts";
import { FIELD_REGISTRY } from "../domainRegistry.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fact(overrides: Partial<EffectiveFact> & { fieldPath: string }): EffectiveFact {
  return { value: true, assertionState: "confirmed_yes", source: "assessment", ...overrides };
}

function fieldIn(sections: ReturnType<typeof buildAssessmentProjection>, fieldPath: string) {
  for (const section of sections) {
    const found = section.fields.find((f) => f.fieldPath === fieldPath);
    if (found) return found;
  }
  return undefined;
}

test("a confirmed_yes boolean fact projects as state 'yes' with no display value", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "daily_life.bathing", value: true, assertionState: "confirmed_yes" })]);
  const field = fieldIn(sections, "daily_life.bathing");
  assert.equal(field?.state, "yes");
  assert.equal(field?.displayValue, null);
});

test("a confirmed_no boolean fact projects as state 'no'", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "daily_life.bathing", value: false, assertionState: "confirmed_no" })]);
  const field = fieldIn(sections, "daily_life.bathing");
  assert.equal(field?.state, "no");
});

test("an uncertain fact projects as state 'uncertain', distinct from both yes/no and not_discussed", () => {
  const sections = buildAssessmentProjection([
    fact({ fieldPath: "cognition.short_term_memory_change", value: null, assertionState: "uncertain" }),
  ]);
  const field = fieldIn(sections, "cognition.short_term_memory_change");
  assert.equal(field?.state, "uncertain");
});

test("a non-boolean confirmed value (e.g. a name) projects as state 'value' showing the actual text, never forced into yes/no", () => {
  const sections = buildAssessmentProjection([
    fact({ fieldPath: "important_people.physician_name", value: "Dr. Lee", assertionState: "confirmed_yes" }),
  ]);
  const field = fieldIn(sections, "important_people.physician_name");
  assert.equal(field?.state, "value");
  assert.equal(field?.displayValue, "Dr. Lee");
});

test("not_applicable projects as state 'value' with an explicit 'Not applicable' label", () => {
  const sections = buildAssessmentProjection([
    fact({ fieldPath: "daily_life.transportation_errands", value: null, assertionState: "not_applicable" }),
  ]);
  const field = fieldIn(sections, "daily_life.transportation_errands");
  assert.equal(field?.state, "value");
  assert.equal(field?.displayValue, "Not applicable");
});

test("a field with no fact at all projects as 'not_discussed', with no source", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "daily_life.bathing" })]);
  // daily_life has other fields (e.g. dressing) that were never given a fact.
  const field = fieldIn(sections, "daily_life.dressing");
  assert.equal(field?.state, "not_discussed");
  assert.equal(field?.source, null);
  assert.equal(field?.displayValue, null);
});

test("PROVENANCE: an assessment-sourced field is tagged source 'assessment'", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "identity.phone", value: "9725551234", source: "assessment" })]);
  assert.equal(fieldIn(sections, "identity.phone")?.source, "assessment");
});

test("PROVENANCE: a profile-sourced field is tagged source 'profile', never silently relabeled 'assessment'", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "identity.phone", value: "9725551234", source: "profile" })]);
  assert.equal(fieldIn(sections, "identity.phone")?.source, "profile");
});

test("mergeEffectiveFacts: assessment always wins over profile for the same field_path -- a profile fact never overrides what this conversation actually said", () => {
  const merged = mergeEffectiveFacts(
    [fact({ fieldPath: "identity.phone", value: "NEW-NUMBER", source: "assessment" })],
    [fact({ fieldPath: "identity.phone", value: "OLD-PROFILE-NUMBER", source: "profile" })]
  );
  const phoneFact = merged.find((f) => f.fieldPath === "identity.phone");
  assert.equal(phoneFact?.source, "assessment");
  assert.equal(phoneFact?.value, "NEW-NUMBER");
});

test("mergeEffectiveFacts: a profile fact fills a genuine gap when the assessment never addressed that field", () => {
  const merged = mergeEffectiveFacts([], [fact({ fieldPath: "identity.date_of_birth", value: "1938-04-12", source: "profile" })]);
  const dobFact = merged.find((f) => f.fieldPath === "identity.date_of_birth");
  assert.equal(dobFact?.source, "profile");
  assert.equal(dobFact?.value, "1938-04-12");
});

test("serve_relationship_intelligence fields never appear in the projection at all, regardless of facts supplied for them", () => {
  const serveRelFields = FIELD_REGISTRY.filter((f) => f.domain === "serve_relationship_intelligence").map((f) => f.fieldPath);
  assert.ok(serveRelFields.length > 0, "sanity check: the registry actually has serve_relationship_intelligence fields");
  const facts = serveRelFields.map((fieldPath) => fact({ fieldPath, value: "something", assertionState: "confirmed_yes" }));
  const sections = buildAssessmentProjection(facts);
  assert.ok(!sections.some((s) => s.domain === "serve_relationship_intelligence"));
  for (const fieldPath of serveRelFields) {
    assert.equal(fieldIn(sections, fieldPath), undefined, `${fieldPath} must not appear anywhere in the projection`);
  }
});

test("a domain with zero real content (every field not_discussed) is omitted entirely -- e.g. Advance Planning, untouched", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "daily_life.bathing" })]);
  assert.ok(!sections.some((s) => s.domain === "advance_planning"));
});

test("a domain with at least one real fact is included, and shows its other, not-yet-discussed fields too (not just the established ones)", () => {
  const sections = buildAssessmentProjection([fact({ fieldPath: "daily_life.bathing", value: true, assertionState: "confirmed_yes" })]);
  const dailyLife = sections.find((s) => s.domain === "daily_life");
  assert.ok(dailyLife, "daily_life section should be present -- it has real content");
  const dressing = dailyLife?.fields.find((f) => f.fieldPath === "daily_life.dressing");
  assert.equal(dressing?.state, "not_discussed", "an untouched sibling field within an otherwise-substantive domain should still show, as not_discussed");
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

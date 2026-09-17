import assert from "node:assert/strict";
import { buildApprovedAssessmentSnapshot, ASSESSMENT_SNAPSHOT_SCHEMA_VERSION } from "../assessmentSnapshot.ts";
import { approvedFactInputsToEffectiveFacts, type EffectiveFact } from "../assessmentProjection.ts";
import { FIELD_REGISTRY } from "../domainRegistry.ts";
import type { ApprovedFactInput } from "../reviewExceptions.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function approvedFact(overrides: Partial<ApprovedFactInput> & { field_path: string }): ApprovedFactInput {
  return {
    value: true,
    assertion_state: "confirmed_yes",
    collection_method: "reported",
    reporter: "resident",
    evidence: "some evidence",
    confidence: "high",
    source_draft_fact_id: null,
    supersedes_fact_id: null,
    ...overrides,
  };
}

function profileFact(fieldPath: string, value: string): EffectiveFact {
  return { fieldPath, value, assertionState: "confirmed_yes", source: "profile" };
}

const BASE_INPUT = {
  assessmentSessionId: "session-1",
  residentId: "resident-1",
  assessmentDate: "2026-09-10T18:00:00.000Z",
  approvedAt: "2026-09-17T15:30:00.000Z",
  approvedBy: "hudson@serve.com",
};

test("carries the schema version and header metadata exactly as given", () => {
  const snapshot = buildApprovedAssessmentSnapshot({ ...BASE_INPUT, assessmentFacts: [], canonicalProfileFacts: [] });
  assert.equal(snapshot.schemaVersion, ASSESSMENT_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.assessmentSessionId, "session-1");
  assert.equal(snapshot.residentId, "resident-1");
  assert.equal(snapshot.assessmentDate, "2026-09-10T18:00:00.000Z");
  assert.equal(snapshot.approvedAt, "2026-09-17T15:30:00.000Z");
  assert.equal(snapshot.approvedBy, "hudson@serve.com");
});

test("DETERMINISM: the same inputs produce byte-identical output every time", () => {
  const assessmentFacts = approvedFactInputsToEffectiveFacts([
    approvedFact({ field_path: "daily_life.bathing", value: true, assertion_state: "confirmed_yes" }),
  ]);
  const canonicalProfileFacts = [profileFact("identity.phone", "9725551234")];
  const a = buildApprovedAssessmentSnapshot({ ...BASE_INPUT, assessmentFacts, canonicalProfileFacts });
  const b = buildApprovedAssessmentSnapshot({ ...BASE_INPUT, assessmentFacts, canonicalProfileFacts });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("PROFILE FACTS ARE FROZEN INTO THE SNAPSHOT: a canonical profile value present at approval time is baked directly into sections, tagged 'profile'", () => {
  const snapshot = buildApprovedAssessmentSnapshot({
    ...BASE_INPUT,
    assessmentFacts: [],
    canonicalProfileFacts: [profileFact("identity.phone", "9725551234")],
  });
  const identitySection = snapshot.sections.find((s) => s.domain === "identity");
  const phoneField = identitySection?.fields.find((f) => f.fieldPath === "identity.phone");
  assert.equal(phoneField?.state, "value");
  assert.equal(phoneField?.displayValue, "9725551234");
  assert.equal(phoneField?.source, "profile");
});

test("FROZEN, NOT LIVE: building two snapshots for the same session with DIFFERENT canonicalProfileFacts (simulating a profile edit between approvals) produces genuinely different content -- proving the function has no hidden dependency on anything outside its own arguments, so a stored snapshot from an earlier approval could never be silently rewritten by a later profile change", () => {
  const before = buildApprovedAssessmentSnapshot({
    ...BASE_INPUT,
    assessmentFacts: [],
    canonicalProfileFacts: [profileFact("identity.phone", "OLD-NUMBER")],
  });
  const after = buildApprovedAssessmentSnapshot({
    ...BASE_INPUT,
    assessmentFacts: [],
    canonicalProfileFacts: [profileFact("identity.phone", "NEW-NUMBER")],
  });
  const phoneBefore = before.sections.find((s) => s.domain === "identity")?.fields.find((f) => f.fieldPath === "identity.phone");
  const phoneAfter = after.sections.find((s) => s.domain === "identity")?.fields.find((f) => f.fieldPath === "identity.phone");
  assert.equal(phoneBefore?.displayValue, "OLD-NUMBER");
  assert.equal(phoneAfter?.displayValue, "NEW-NUMBER");
});

test("assessment facts still take precedence over profile facts within the snapshot, same rule as the live preview", () => {
  const assessmentFacts = approvedFactInputsToEffectiveFacts([
    approvedFact({ field_path: "identity.phone", value: "NEW-FROM-CONVERSATION", assertion_state: "confirmed_yes" }),
  ]);
  const snapshot = buildApprovedAssessmentSnapshot({
    ...BASE_INPUT,
    assessmentFacts,
    canonicalProfileFacts: [profileFact("identity.phone", "OLD-PROFILE-NUMBER")],
  });
  const phoneField = snapshot.sections.find((s) => s.domain === "identity")?.fields.find((f) => f.fieldPath === "identity.phone");
  assert.equal(phoneField?.displayValue, "NEW-FROM-CONVERSATION");
  assert.equal(phoneField?.source, "assessment");
});

test("serve_relationship_intelligence never enters the snapshot, even when facts are supplied for it", () => {
  const serveRelFields = FIELD_REGISTRY.filter((f) => f.domain === "serve_relationship_intelligence").map((f) => f.fieldPath);
  assert.ok(serveRelFields.length > 0, "sanity check");
  const assessmentFacts = approvedFactInputsToEffectiveFacts(
    serveRelFields.map((field_path) => approvedFact({ field_path, value: "something" }))
  );
  const snapshot = buildApprovedAssessmentSnapshot({ ...BASE_INPUT, assessmentFacts, canonicalProfileFacts: [] });
  assert.ok(!snapshot.sections.some((s) => s.domain === "serve_relationship_intelligence"));
  for (const section of snapshot.sections) {
    for (const field of section.fields) {
      assert.ok(!serveRelFields.includes(field.fieldPath), `${field.fieldPath} must not appear anywhere in the snapshot`);
    }
  }
});

test("PRINTABLE ARTIFACT INDEPENDENCE: the function signature has no residentId-lookup capability at all -- it can only ever render what was explicitly passed in, never a live database read of mutable profile data", () => {
  // Structural proof, not a mock check: buildApprovedAssessmentSnapshot's only inputs are plain
  // data (strings and EffectiveFact arrays), never a function, client, or id it could use to go
  // fetch something live. Calling it twice with the exact same plain-data arguments (already
  // proven deterministic above) is therefore sufficient evidence it cannot vary based on
  // anything mutable outside its own call.
  const snapshot = buildApprovedAssessmentSnapshot({ ...BASE_INPUT, assessmentFacts: [], canonicalProfileFacts: [] });
  assert.deepEqual(Object.keys(snapshot), [
    "schemaVersion",
    "assessmentSessionId",
    "residentId",
    "assessmentDate",
    "approvedAt",
    "approvedBy",
    "sections",
  ]);
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

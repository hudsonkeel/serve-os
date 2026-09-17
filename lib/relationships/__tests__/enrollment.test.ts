import assert from "node:assert/strict";
import { decideClientEnrollmentAction, type EnrollmentRelationshipSummary } from "../enrollment.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("no existing relationships: creates a Resident Prospect then converts it", () => {
  const decision = decideClientEnrollmentAction([]);
  assert.equal(decision.kind, "create_then_convert");
});

test("an existing, non-closed Resident Prospect relationship: converts that same row, never creates a second one", () => {
  const relationships: EnrollmentRelationshipSummary[] = [
    { id: "r1", relationshipType: "resident_prospect", status: "active" },
  ];
  const decision = decideClientEnrollmentAction(relationships);
  assert.equal(decision.kind, "convert_existing");
  assert.equal(decision.kind === "convert_existing" && decision.relationshipId, "r1");
});

test("a CLOSED Resident Prospect relationship is not reused — treated as if none exists, so a fresh one is created", () => {
  const relationships: EnrollmentRelationshipSummary[] = [
    { id: "r1", relationshipType: "resident_prospect", status: "closed" },
  ];
  const decision = decideClientEnrollmentAction(relationships);
  assert.equal(decision.kind, "create_then_convert");
});

test("already inactive_client: no-op — recording another Service Agreement never duplicates enrollment", () => {
  const relationships: EnrollmentRelationshipSummary[] = [
    { id: "r1", relationshipType: "inactive_client", status: "active" },
  ];
  const decision = decideClientEnrollmentAction(relationships);
  assert.equal(decision.kind, "already_enrolled");
  assert.equal(decision.kind === "already_enrolled" && decision.relationshipId, "r1");
});

test("already active_client: no-op — recording a Service Agreement must never downgrade an Active Client back to Inactive", () => {
  const relationships: EnrollmentRelationshipSummary[] = [
    { id: "r1", relationshipType: "active_client", status: "active" },
  ];
  const decision = decideClientEnrollmentAction(relationships);
  assert.equal(decision.kind, "already_enrolled");
  assert.equal(decision.kind === "already_enrolled" && decision.relationshipId, "r1");
});

test("active_client takes priority over a co-existing resident_prospect row (defensive — should not happen by construction, but never regress toward prospect)", () => {
  const relationships: EnrollmentRelationshipSummary[] = [
    { id: "old-prospect", relationshipType: "resident_prospect", status: "closed" },
    { id: "r-active", relationshipType: "active_client", status: "active" },
  ];
  const decision = decideClientEnrollmentAction(relationships);
  assert.equal(decision.kind, "already_enrolled");
  assert.equal(decision.kind === "already_enrolled" && decision.relationshipId, "r-active");
});

test("an unrelated relationship type (e.g. former_client) with no prospect row present: creates a new enrollment rather than reusing an unrelated row", () => {
  const relationships: EnrollmentRelationshipSummary[] = [
    { id: "r1", relationshipType: "former_client", status: "closed" },
  ];
  const decision = decideClientEnrollmentAction(relationships);
  assert.equal(decision.kind, "create_then_convert");
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

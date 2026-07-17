// Pure-function tests for lib/relationships/duplicateDetection.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import {
  findActiveResidentProspect,
  hasActiveResidentProspect,
  type DuplicateCandidateRelationship,
} from "../duplicateDetection.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function rel(overrides: Partial<DuplicateCandidateRelationship> & { id: string }): DuplicateCandidateRelationship {
  return {
    relationshipType: "resident_prospect",
    residentId: "resident-1",
    status: "active",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("1. no relationships at all -> no duplicate", () => {
  assert.equal(findActiveResidentProspect([], "resident-1"), null);
  assert.equal(hasActiveResidentProspect([], "resident-1"), false);
});

test("2. an active resident_prospect Relationship for this resident is detected", () => {
  const active = rel({ id: "a" });
  const result = findActiveResidentProspect([active], "resident-1");
  assert.equal(result?.id, "a");
  assert.equal(hasActiveResidentProspect([active], "resident-1"), true);
});

test("3. an on_hold resident_prospect Relationship still counts as active/blocking", () => {
  const onHold = rel({ id: "a", status: "on_hold" });
  assert.equal(findActiveResidentProspect([onHold], "resident-1")?.id, "a");
});

test("4. a closed resident_prospect Relationship does not block a new one", () => {
  const closed = rel({ id: "a", status: "closed" });
  assert.equal(findActiveResidentProspect([closed], "resident-1"), null);
  assert.equal(hasActiveResidentProspect([closed], "resident-1"), false);
});

test("5. an active_client Relationship for the same resident does not count as a duplicate prospect", () => {
  const client = rel({ id: "a", relationshipType: "active_client" });
  assert.equal(findActiveResidentProspect([client], "resident-1"), null);
});

test("6. an external_prospect Relationship does not count (not resident-linked in the same way)", () => {
  const external = rel({ id: "a", relationshipType: "external_prospect" });
  assert.equal(findActiveResidentProspect([external], "resident-1"), null);
});

test("7. a resident_prospect Relationship for a DIFFERENT resident does not block this one", () => {
  const other = rel({ id: "a", residentId: "resident-2" });
  assert.equal(findActiveResidentProspect([other], "resident-1"), null);
});

test("8. multiple active candidates -> the most recently updated one wins, deterministically", () => {
  const older = rel({ id: "older", updatedAt: "2026-01-01T00:00:00.000Z" });
  const newer = rel({ id: "newer", updatedAt: "2026-02-01T00:00:00.000Z" });
  assert.equal(findActiveResidentProspect([older, newer], "resident-1")?.id, "newer");
  assert.equal(findActiveResidentProspect([newer, older], "resident-1")?.id, "newer");
});

test("9. a closed historical Relationship coexists with an active one — the active one is returned", () => {
  const closed = rel({ id: "closed", status: "closed", updatedAt: "2026-03-01T00:00:00.000Z" });
  const active = rel({ id: "active", status: "active", updatedAt: "2026-01-01T00:00:00.000Z" });
  // Closed is more recently updated but must never win over a genuinely active one.
  assert.equal(findActiveResidentProspect([closed, active], "resident-1")?.id, "active");
});

test("10. mixed relationship types and residents -> only the matching resident_prospect for the target resident is found", () => {
  const relationships: DuplicateCandidateRelationship[] = [
    rel({ id: "wrong-resident", residentId: "resident-9" }),
    rel({ id: "wrong-type", relationshipType: "referral_source" }),
    rel({ id: "closed", status: "closed" }),
    rel({ id: "match", status: "active" }),
  ];
  assert.equal(findActiveResidentProspect(relationships, "resident-1")?.id, "match");
});

// ─── Runner ──────────────────────────────────────────────────────────

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

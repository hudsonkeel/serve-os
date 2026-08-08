import assert from "node:assert/strict";
import { deriveEffectiveRecruitingStatus } from "../pipelineStatus.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("REGRESSION (Alma Owolabi general case): a non-terminal status with a confirmed, active workforce link resolves to hired", () => {
  const result = deriveEffectiveRecruitingStatus("in_review", "active");
  assert.equal(result.effectiveStatus, "hired");
  assert.equal(result.isDerivedFromWorkforceLink, true);
});

test("every non-terminal status resolves to hired when actively linked", () => {
  for (const status of ["new", "contacted", "in_review", "applied"] as const) {
    const result = deriveEffectiveRecruitingStatus(status, "active");
    assert.equal(result.effectiveStatus, "hired", `expected ${status} + active link to resolve to hired`);
  }
});

test("REGRESSION: an unresolved candidate (no workforce link) keeps its stored status unchanged", () => {
  const result = deriveEffectiveRecruitingStatus("in_review", null);
  assert.equal(result.effectiveStatus, "in_review");
  assert.equal(result.isDerivedFromWorkforceLink, false);
});

test("REGRESSION: a linked-but-not-yet-active workforce member (pending_start/inactive/terminated) does not force hired", () => {
  for (const lifecycle of ["pending_start", "inactive", "terminated"] as const) {
    const result = deriveEffectiveRecruitingStatus("in_review", lifecycle);
    assert.equal(result.effectiveStatus, "in_review", `expected lifecycle ${lifecycle} to leave status unchanged`);
    assert.equal(result.isDerivedFromWorkforceLink, false);
  }
});

test("REGRESSION: an already-terminal status (archived/not_a_fit/hired) is never overridden, even with an active link", () => {
  for (const status of ["archived", "not_a_fit", "hired"] as const) {
    const result = deriveEffectiveRecruitingStatus(status, "active");
    assert.equal(result.effectiveStatus, status, `expected terminal status ${status} to remain unchanged`);
    assert.equal(result.isDerivedFromWorkforceLink, false);
  }
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

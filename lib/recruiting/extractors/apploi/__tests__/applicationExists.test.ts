import assert from "node:assert/strict";
import { evaluateApplicationExists, type ApplicationExistsContext } from "../applicationExists.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

function ctx(overrides: Partial<ApplicationExistsContext>): ApplicationExistsContext {
  return {
    applicationIdFromUrl: "QXBwbGljYXRpb246MjgzNTc1OTE2",
    candidateIdFromUrl: "Q2FuZGlkYXRlOjc2MzY0MTEy",
    confirmedCandidateId: "Q2FuZGlkYXRlOjc2MzY0MTEy",
    dialogCount: 1,
    identityConfirmed: true,
    applicationSectionCount: 1,
    positionObserved: true,
    ...overrides,
  };
}

test("all conditions satisfied produces observed=true", () => {
  const result = evaluateApplicationExists(ctx({}), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "observed");
  assert.equal(result.normalizedValue, "true");
});

test("missing applicationID in URL produces not_visible, never false", () => {
  const result = evaluateApplicationExists(ctx({ applicationIdFromUrl: null }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "not_visible");
  assert.notEqual(result.normalizedValue, "false");
  assert.equal(result.normalizedValue, null);
});

test("missing candidateID in URL produces not_visible", () => {
  const result = evaluateApplicationExists(ctx({ candidateIdFromUrl: null }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "not_visible");
});

test("candidateID mismatch (defense in depth) produces not_visible, never a fabricated value", () => {
  const result = evaluateApplicationExists(ctx({ candidateIdFromUrl: "different-id" }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "not_visible");
  assert.equal(result.normalizedValue, null);
});

test("dialog count !== 1 produces not_visible", () => {
  assert.equal(evaluateApplicationExists(ctx({ dialogCount: 0 }), "test@1", new Date().toISOString()).outcome, "not_visible");
  assert.equal(evaluateApplicationExists(ctx({ dialogCount: 2 }), "test@1", new Date().toISOString()).outcome, "not_visible");
});

test("identity not confirmed produces not_visible", () => {
  const result = evaluateApplicationExists(ctx({ identityConfirmed: false }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "not_visible");
});

test("zero application sections found produces not_visible", () => {
  const result = evaluateApplicationExists(ctx({ applicationSectionCount: 0 }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "not_visible");
});

test("multiple application sections found produces ambiguous, never guessed", () => {
  const result = evaluateApplicationExists(ctx({ applicationSectionCount: 2 }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "ambiguous");
  assert.equal(result.normalizedValue, null);
});

test("position not observed produces unknown (something found, not confidently associated) — never blocked or false", () => {
  const result = evaluateApplicationExists(ctx({ positionObserved: false }), "test@1", new Date().toISOString());
  assert.equal(result.outcome, "unknown");
  assert.equal(result.normalizedValue, null);
});

test("outcome vocabulary never includes false/true-as-negative/incomplete/not_done", () => {
  const scenarios = [
    ctx({}),
    ctx({ applicationIdFromUrl: null }),
    ctx({ dialogCount: 2 }),
    ctx({ identityConfirmed: false }),
    ctx({ applicationSectionCount: 0 }),
    ctx({ applicationSectionCount: 2 }),
    ctx({ positionObserved: false }),
  ];
  const allowed = new Set(["observed", "unknown", "ambiguous", "not_visible"]);
  for (const s of scenarios) {
    const result = evaluateApplicationExists(s, "test@1", new Date().toISOString());
    assert.ok(allowed.has(result.outcome), `unexpected outcome: ${result.outcome}`);
  }
});

console.log(`\n${passed}/${passed} passed`);

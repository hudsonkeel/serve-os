import assert from "node:assert/strict";
import { classifyContactMatch, type ContactForMatching } from "../identityMatch.ts";
import { normalizeContactEmail, normalizeContactPhone } from "../normalization.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function contact(overrides: Partial<ContactForMatching> = {}): ContactForMatching {
  return {
    firstName: "Susan",
    lastName: "Carter",
    normalizedEmail: null,
    normalizedPhone: null,
    ...overrides,
  };
}

test("exact strong email match, agreeing names -> exact_strong_match, with human-readable email + name evidence", () => {
  const a = contact({ normalizedEmail: normalizeContactEmail("Susan@Example.com") });
  const b = contact({ normalizedEmail: normalizeContactEmail("susan@example.com") });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "exact_strong_match");
  assert.ok(result.evidence.some((e) => e.signalType === "email"));
  assert.ok(result.evidence.some((e) => e.signalType === "name"));
  assert.ok(result.evidence.every((e) => typeof e.description === "string" && e.description.length > 0));
});

test("exact strong phone match, agreeing names -> exact_strong_match", () => {
  const a = contact({ normalizedPhone: normalizeContactPhone("214-555-0187") });
  const b = contact({ normalizedPhone: normalizeContactPhone("(214) 555-0187") });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "exact_strong_match");
  assert.ok(result.evidence.some((e) => e.signalType === "phone"));
});

test("exact strong match with names unknown on one side still resolves as exact_strong_match (no conflict to react to)", () => {
  const a = contact({ firstName: null, lastName: null, normalizedPhone: "2145550187" });
  const b = contact({ firstName: "Susan", lastName: "Carter", normalizedPhone: "2145550187" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "exact_strong_match");
});

test("same strong identifier (phone) but CONFLICTING names -> conflicting_identity_requires_review, never auto-merged", () => {
  const a = contact({ firstName: "Susan", lastName: "Carter", normalizedPhone: "2145550187" });
  const b = contact({ firstName: "Robert", lastName: "Carter", normalizedPhone: "2145550187" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "conflicting_identity_requires_review");
  assert.ok(result.evidence.some((e) => e.signalType === "name_conflict"));
});

test("same strong identifier (email) but conflicting names -> conflicting_identity_requires_review", () => {
  const a = contact({ firstName: "Susan", lastName: "Carter", normalizedEmail: "susan@example.com" });
  const b = contact({ firstName: "Not Susan", lastName: "Different", normalizedEmail: "susan@example.com" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "conflicting_identity_requires_review");
});

test("conflicting strong identifiers (different confirmed phones) with AGREEING names -> conflicting_identity_requires_review, never outvoted by name agreement", () => {
  const a = contact({ normalizedPhone: "2145550187" });
  const b = contact({ normalizedPhone: "2145559999" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "conflicting_identity_requires_review");
  assert.ok(result.evidence.some((e) => e.signalType === "phone_conflict"));
});

test("conflicting strong identifiers (different confirmed emails) -> conflicting_identity_requires_review", () => {
  const a = contact({ normalizedEmail: "susan@example.com" });
  const b = contact({ normalizedEmail: "susan.carter@example.com" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "conflicting_identity_requires_review");
  assert.ok(result.evidence.some((e) => e.signalType === "email_conflict"));
});

test("full name match with no strong identifier at all -> name_only_no_merge, never treated as sufficient to merge", () => {
  const a = contact({ firstName: "Susan", lastName: "Carter" });
  const b = contact({ firstName: "Susan", lastName: "Carter" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "name_only_no_merge");
});

test("partial match: shared last name only, no full-name match, no strong identifier -> proposed_match_requires_review, never auto-merged", () => {
  const a = contact({ firstName: "Susan", lastName: "Carter" });
  const b = contact({ firstName: "Sue", lastName: "Carter" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "proposed_match_requires_review");
  assert.ok(result.evidence.some((e) => e.signalType === "surname_only"));
});

test("partial match: shared last name, first name missing entirely on one side -> proposed_match_requires_review", () => {
  const a = contact({ firstName: null, lastName: "Carter" });
  const b = contact({ firstName: "Susan", lastName: "Carter" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "proposed_match_requires_review");
});

test("no match: different names, no strong identifiers, no surname overlap -> no_match", () => {
  const a = contact({ firstName: "Susan", lastName: "Carter" });
  const b = contact({ firstName: "Maria", lastName: "Lopez" });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "no_match");
  assert.deepEqual(result.evidence, []);
});

test("no match: no identifying information at all on either side beyond a shared blank state", () => {
  const a = contact({ firstName: null, lastName: null });
  const b = contact({ firstName: null, lastName: null });
  const result = classifyContactMatch(a, b);
  assert.equal(result.tier, "no_match");
});

test("never a numeric fuzzy score: ContactMatchResult carries only a named tier and human-readable evidence strings", () => {
  const result = classifyContactMatch(contact(), contact());
  assert.equal(typeof result.tier, "string");
  for (const signal of result.evidence) {
    assert.equal(typeof signal.description, "string");
    assert.ok(["strong", "corroborating", "weak"].includes(signal.strength));
    assert.equal(typeof (signal as unknown as { score?: unknown }).score, "undefined");
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

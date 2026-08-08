import assert from "node:assert/strict";
import { evaluateRecruitingToWorkforceResolution } from "../workforceResolution.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const baseLead = {
  id: "lead-1",
  normalizedEmail: null as string | null,
  normalizedPhone: null as string | null,
  normalizedName: "alma owolabi",
  linkedWorkforceMemberId: null as string | null,
};

const baseCandidate = {
  workforceMemberId: "wm-1",
  normalizedEmail: null as string | null,
  normalizedPhone: null as string | null,
  normalizedName: "alma owolabi",
  hasConfirmedActiveAxisCareLink: true,
  hasCorroboratingEvidence: false,
};

test("an already-structurally-linked lead always resolves, without review", () => {
  const result = evaluateRecruitingToWorkforceResolution(
    { ...baseLead, linkedWorkforceMemberId: "wm-1" },
    null
  );
  assert.equal(result.shouldResolve, true);
  assert.equal(result.basis, "confirmed_workforce_link");
  assert.equal(result.requiresReview, false);
});

test("no candidate found -> never resolves", () => {
  const result = evaluateRecruitingToWorkforceResolution(baseLead, null);
  assert.equal(result.shouldResolve, false);
});

test("candidate exists but has no confirmed active AxisCare link -> never resolves", () => {
  const result = evaluateRecruitingToWorkforceResolution(baseLead, {
    ...baseCandidate,
    hasConfirmedActiveAxisCareLink: false,
  });
  assert.equal(result.shouldResolve, false);
});

test("exact email match with an active workforce link -> resolves without review", () => {
  const result = evaluateRecruitingToWorkforceResolution(
    { ...baseLead, normalizedEmail: "alma@example.com" },
    { ...baseCandidate, normalizedEmail: "alma@example.com" }
  );
  assert.equal(result.shouldResolve, true);
  assert.equal(result.basis, "exact_email");
  assert.equal(result.requiresReview, false);
});

test("exact phone match with an active workforce link -> resolves without review", () => {
  const result = evaluateRecruitingToWorkforceResolution(
    { ...baseLead, normalizedPhone: "5551234567" },
    { ...baseCandidate, normalizedPhone: "5551234567" }
  );
  assert.equal(result.shouldResolve, true);
  assert.equal(result.basis, "exact_phone");
});

test("name match plus corroborating evidence -> proposes resolution but still requires review (matches Alma's real case)", () => {
  const result = evaluateRecruitingToWorkforceResolution(baseLead, {
    ...baseCandidate,
    hasCorroboratingEvidence: true,
  });
  assert.equal(result.shouldResolve, true);
  assert.equal(result.basis, "name_plus_corroborating_evidence");
  assert.equal(result.requiresReview, true);
});

test("name match alone, no corroborating evidence, no email/phone -> never auto-resolves", () => {
  const result = evaluateRecruitingToWorkforceResolution(baseLead, baseCandidate);
  assert.equal(result.shouldResolve, false);
  assert.equal(result.basis, "name_only");
  assert.equal(result.requiresReview, true);
});

test("no match at all (different name, no email/phone) -> no resolution, no review", () => {
  const result = evaluateRecruitingToWorkforceResolution(baseLead, {
    ...baseCandidate,
    normalizedName: "someone else",
  });
  assert.equal(result.shouldResolve, false);
  assert.equal(result.requiresReview, false);
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

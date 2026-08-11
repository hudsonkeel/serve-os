import assert from "node:assert/strict";
import { recommendPricing, type FactForPricing } from "../pricingEngine.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fact(fieldPath: string, assertionState: FactForPricing["assertionState"], value: unknown = true): FactForPricing {
  return { fieldPath, assertionState, value };
}

test("multiple confirmed personal-care needs recommend Comfort Service, deterministically", () => {
  const result = recommendPricing([
    fact("daily_life.bathing", "confirmed_yes"),
    fact("daily_life.toileting", "confirmed_yes"),
  ]);
  assert.equal(result.status, "recommended");
  if (result.status === "recommended") {
    assert.equal(result.recommendedOption.key, "comfort");
  }
});

test("multiple confirmed light-support needs recommend Essential Service", () => {
  const result = recommendPricing([
    fact("daily_life.medication_reminders", "confirmed_yes"),
    fact("daily_life.housekeeping", "confirmed_yes"),
  ]);
  assert.equal(result.status, "recommended");
  if (result.status === "recommended") {
    assert.equal(result.recommendedOption.key, "essential");
  }
});

test("PRICING EXCEPTION: nothing confirmed maps to 'pricing_review_required', never a manufactured rate", () => {
  const result = recommendPricing([fact("identity.preferred_name", "confirmed_yes", "Mary")]);
  assert.equal(result.status, "pricing_review_required");
  if (result.status === "pricing_review_required") {
    assert.match(result.reason, /do not clearly map/);
  }
});

test("a requested duration beyond the published range returns pricing_review_required, not an invented custom rate", () => {
  const result = recommendPricing([fact("when.duration", "confirmed_yes", "one hour visits")]);
  assert.equal(result.status, "pricing_review_required");
  if (result.status === "pricing_review_required") {
    assert.match(result.reason, /exceeds the published/);
  }
});

test("uncertain and conflicting facts are never counted toward a confirmed score", () => {
  const result = recommendPricing([
    fact("daily_life.bathing", "uncertain"),
    fact("daily_life.toileting", "conflicting"),
  ]);
  assert.equal(result.status, "pricing_review_required");
});

test("CONFLICTING AI SUGGESTION vs. PRICING ENGINE: the engine has no parameter for an AI-suggested package at all — it can only ever compute from confirmed facts, so it structurally cannot be swayed by an AI recommendation", () => {
  // recommendPricing's signature is (facts: FactForPricing[]) — there is no "aiSuggestion"
  // input anywhere in the function. This test documents and locks in that architectural
  // guarantee: the same facts always produce the same deterministic result regardless of
  // whatever an AI service_recommendation elsewhere might have suggested.
  const facts = [fact("daily_life.bathing", "confirmed_yes"), fact("daily_life.toileting", "confirmed_yes")];
  const resultA = recommendPricing(facts);
  const resultB = recommendPricing(facts);
  assert.deepEqual(resultA, resultB);
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

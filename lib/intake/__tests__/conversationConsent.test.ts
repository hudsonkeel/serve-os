// Pure-function tests for lib/intake/conversationConsent.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { deriveContactCaptureStatus } from "../conversationConsent.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. no name, no contact method -> none", () => {
  const result = deriveContactCaptureStatus({ hasContactName: false, hasContactMethod: false, consentGiven: false });
  assert.equal(result, "none");
});

test("2. name only, no contact method -> none (not enough to be a partial draft)", () => {
  const result = deriveContactCaptureStatus({ hasContactName: true, hasContactMethod: false, consentGiven: false });
  assert.equal(result, "none");
});

test("3. contact method only, no name -> none", () => {
  const result = deriveContactCaptureStatus({ hasContactName: false, hasContactMethod: true, consentGiven: false });
  assert.equal(result, "none");
});

test("4. name + contact method, no consent -> partial_contact_captured", () => {
  const result = deriveContactCaptureStatus({ hasContactName: true, hasContactMethod: true, consentGiven: false });
  assert.equal(result, "partial_contact_captured");
});

test("5. name + contact method + consent -> consented_for_followup", () => {
  const result = deriveContactCaptureStatus({ hasContactName: true, hasContactMethod: true, consentGiven: true });
  assert.equal(result, "consented_for_followup");
});

test("6. consent alone never overrides missing contact info -> none", () => {
  const result = deriveContactCaptureStatus({ hasContactName: false, hasContactMethod: false, consentGiven: true });
  assert.equal(result, "none");
});

test("7. deterministic: identical inputs always produce an identical result", () => {
  const input = { hasContactName: true, hasContactMethod: true, consentGiven: true } as const;
  assert.equal(deriveContactCaptureStatus(input), deriveContactCaptureStatus(input));
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

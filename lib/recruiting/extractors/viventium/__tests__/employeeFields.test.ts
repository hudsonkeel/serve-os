import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { extractField } from "../../apploi/extraction.ts";
import {
  EMPLOYEE_NAME_FIELD,
  I9_STATUS_FIELD,
  evaluateEmployeeRecordExists,
  finalizeI9Status,
  type EmployeeRecordExistsContext,
} from "../employeeFields.ts";
import type { RawObservation } from "../../../../collectors/types.ts";

let passed = 0;
function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`ok - ${passed}. ${name}`);
  });
}

// ─── evaluateEmployeeRecordExists — pure, composite gate ──────────────────
function ctx(overrides: Partial<EmployeeRecordExistsContext>): EmployeeRecordExistsContext {
  return {
    employeeUuid: "9c858901-8a57-4791-81fe-4c455b099bc9",
    originVerified: true,
    singleRecordConfirmed: true,
    identityConfirmed: true,
    ...overrides,
  };
}

function testEmployeeRecordExists() {
  const observed = evaluateEmployeeRecordExists(ctx({}), "test@1", new Date().toISOString());
  assert.equal(observed.outcome, "observed");
  assert.equal(observed.normalizedValue, "true");

  const noOrigin = evaluateEmployeeRecordExists(ctx({ originVerified: false }), "test@1", new Date().toISOString());
  assert.equal(noOrigin.outcome, "not_visible");

  const noSingleRecord = evaluateEmployeeRecordExists(ctx({ singleRecordConfirmed: false }), "test@1", new Date().toISOString());
  assert.equal(noSingleRecord.outcome, "not_visible");

  const noIdentity = evaluateEmployeeRecordExists(ctx({ identityConfirmed: false }), "test@1", new Date().toISOString());
  assert.equal(noIdentity.outcome, "not_visible");

  const noUrl = evaluateEmployeeRecordExists(ctx({ employeeUuid: null }), "test@1", new Date().toISOString());
  assert.equal(noUrl.outcome, "not_visible");
  assert.equal(noUrl.normalizedValue, null);
}

// ─── finalizeI9Status — pure normalization ─────────────────────────────────
function observedRaw(rawLabel: string): RawObservation {
  return {
    observationKey: "viventium.i9_status",
    outcome: "observed",
    rawLabel,
    normalizedValue: rawLabel,
    sourceLocation: "test",
    extractorVersion: "test@1",
    extractionConfidence: "low",
    matchMethod: "text_content",
    failureReason: null,
    sensitivity: "standard",
    collectionMethod: "automatic_dom",
    observedAt: new Date().toISOString(),
  };
}

function testFinalizeI9Status() {
  const notVerified = finalizeI9Status(observedRaw("Not Verified"));
  assert.equal(notVerified.normalizedValue, "not_verified");

  const verified = finalizeI9Status(observedRaw("Verified"));
  assert.equal(verified.normalizedValue, "completed");

  const unrecognized = finalizeI9Status(observedRaw("Pending Review Next Steps"));
  assert.equal(unrecognized.outcome, "unknown");
  assert.equal(unrecognized.normalizedValue, null);

  const notVisible: RawObservation = { ...observedRaw("anything"), outcome: "not_visible", rawLabel: null };
  assert.deepEqual(finalizeI9Status(notVisible), notVisible);
}

// ─── Selector fixtures — offline, static HTML, same pattern as
// dialogFields.test.ts. Fictional markup, not a claim of real Viventium
// structure — these selectors are provisional per the collector's own
// header comment.
const FIXTURE_HTML = `
<html><body>
  <div>
    <h1>Fixture Employee Name</h1>
    <section>
      <p>I-9 Verification</p>
      <p>Not Verified</p>
    </section>
  </div>
</body></html>
`;

async function withFixturePage(fn: (page: Page) => Promise<void>): Promise<void> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML);
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function run() {
  await test("evaluateEmployeeRecordExists is a pure composite gate (all conditions checked)", testEmployeeRecordExists);
  await test("finalizeI9Status normalizes known values and marks unknown ones unknown, never guessed", testFinalizeI9Status);

  await test("EMPLOYEE_NAME_FIELD selector reads the first h1/h2 (provisional)", async () => {
    await withFixturePage(async (page) => {
      const result = await extractField(page, EMPLOYEE_NAME_FIELD, "test@1");
      assert.equal(result.outcome, "observed");
      assert.equal(result.normalizedValue, "Fixture Employee Name");
    });
  });

  await test("I9_STATUS_FIELD selector finds text following an I-9 label (provisional)", async () => {
    await withFixturePage(async (page) => {
      const result = await extractField(page, I9_STATUS_FIELD, "test@1");
      assert.equal(result.outcome, "observed");
      assert.equal(result.rawLabel, "Not Verified");
    });
  });

  console.log(`\n${passed}/${passed} passed`);
}

run().catch((err) => {
  console.error("Test run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

// Pure-function tests for lib/relationships/validation.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import {
  normalizeActionTitle,
  normalizeDisplayName,
  normalizeOptionalText,
  normalizeTouchSummary,
  parseOptionalDate,
  validateDueDateNotPast,
} from "../validation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. normalizeDisplayName trims and rejects blank", () => {
  assert.equal(normalizeDisplayName("  Smith Family Inquiry  ").value, "Smith Family Inquiry");
  assert.ok(normalizeDisplayName("   ").error);
});

test("2. normalizeActionTitle trims and rejects blank", () => {
  assert.equal(normalizeActionTitle("  Call Jennifer  ").value, "Call Jennifer");
  assert.ok(normalizeActionTitle("").error);
});

test("3. normalizeTouchSummary trims and rejects blank", () => {
  assert.equal(
    normalizeTouchSummary("  Spoke with Cary about visits.  ").value,
    "Spoke with Cary about visits."
  );
  assert.ok(normalizeTouchSummary("").error);
});

test("4. parseOptionalDate returns null iso when nothing supplied", () => {
  const result = parseOptionalDate(undefined);
  assert.equal(result.iso, null);
  assert.equal(result.error, undefined);
});

test("5. parseOptionalDate parses a valid date", () => {
  const result = parseOptionalDate("2026-07-22");
  assert.ok(result.iso?.startsWith("2026-07-22"));
});

test("6. parseOptionalDate rejects an invalid date", () => {
  const result = parseOptionalDate("not-a-date");
  assert.ok(result.error);
});

test("7. validateDueDateNotPast rejects a newly-chosen past date", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-20T00:00:00.000Z",
    now
  );
  assert.ok(result.error);
});

test("8. validateDueDateNotPast allows an unchanged past date", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-01T00:00:00.000Z",
    now
  );
  assert.equal(result.error, undefined);
});

test("9. normalizeOptionalText trims and treats blank as null", () => {
  assert.equal(normalizeOptionalText("  Elizabeth Butler  "), "Elizabeth Butler");
  assert.equal(normalizeOptionalText("   "), null);
  assert.equal(normalizeOptionalText(undefined), null);
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

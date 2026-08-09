// Pure-function tests for ../normalization.ts. Run with:
//   npm run test:importResidentSourceNotes
import assert from "node:assert/strict";
import { containsKeyword, normalizeName, normalizeUnit, parseNameParts } from "../normalization.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── normalizeName ──────────────────────────────────────────────────────

test("1. normalizeName lowercases and trims", () => {
  assert.equal(normalizeName("  Jerald Maxwell  "), "jerald maxwell");
});

test("2. normalizeName strips periods (initials)", () => {
  assert.equal(normalizeName("E. Goldberg"), "e goldberg");
});

test("3. normalizeName collapses internal whitespace", () => {
  assert.equal(normalizeName("Kathryn   Morshed"), "kathryn morshed");
});

test("4. normalizeName handles null/undefined", () => {
  assert.equal(normalizeName(null), "");
  assert.equal(normalizeName(undefined), "");
});

// ─── normalizeUnit ──────────────────────────────────────────────────────

test("5. normalizeUnit trims whitespace", () => {
  assert.equal(normalizeUnit("  7313  "), "7313");
});

test("6. normalizeUnit treats blank/missing as unavailable", () => {
  assert.equal(normalizeUnit(""), null);
  assert.equal(normalizeUnit("   "), null);
  assert.equal(normalizeUnit(null), null);
  assert.equal(normalizeUnit(undefined), null);
});

// ─── parseNameParts ─────────────────────────────────────────────────────

test("7. parseNameParts splits a full two-token name", () => {
  const parsed = parseNameParts("Jerald Maxwell");
  assert.equal(parsed.isInitialForm, false);
  assert.equal(parsed.firstToken, "jerald");
  assert.equal(parsed.lastName, "maxwell");
});

test("8. parseNameParts detects initial-form names", () => {
  const parsed = parseNameParts("E. Goldberg");
  assert.equal(parsed.isInitialForm, true);
  assert.equal(parsed.firstToken, "e");
  assert.equal(parsed.lastName, "goldberg");
});

test("9. parseNameParts handles a single-token (last-name-only) input", () => {
  const parsed = parseNameParts("Kakazu");
  assert.equal(parsed.isInitialForm, false);
  assert.equal(parsed.firstToken, "");
  assert.equal(parsed.lastName, "kakazu");
});

test("10. parseNameParts handles empty input", () => {
  const parsed = parseNameParts("");
  assert.equal(parsed.lastName, "");
});

// ─── containsKeyword ────────────────────────────────────────────────────

test("11. containsKeyword matches case-insensitively", () => {
  assert.equal(containsKeyword("Resident needs Medication reminders daily.", ["medication"]), true);
});

test("12. containsKeyword returns false when no keyword is present", () => {
  assert.equal(containsKeyword("Resident enjoys reading.", ["walker", "medication"]), false);
});

test("13. containsKeyword matches any keyword in the set", () => {
  assert.equal(containsKeyword("Assist with laundry weekly.", ["washing machine", "laundry"]), true);
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

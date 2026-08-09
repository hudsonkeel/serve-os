// Pure-function tests for ../normalization.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { coreFirstNameToken, isStrictTokenSuperset, nameTokenSet, normalizeEmail, normalizeFullName, normalizeNamePart, normalizePhone } from "../normalization.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. normalizeFullName joins first and last, lowercased", () => {
  assert.equal(normalizeFullName("Elliott", "Goldberg"), "elliott goldberg");
});

test("2. normalizeFullName skips a missing first or last name without a stray leading/trailing space", () => {
  assert.equal(normalizeFullName(null, "Goldberg"), "goldberg");
  assert.equal(normalizeFullName("Elliott", null), "elliott");
});

test("3. normalizeNamePart reuses the roster normalizer (trim/lowercase/strip periods)", () => {
  assert.equal(normalizeNamePart("  Susan  "), "susan");
});

test("4. normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Jane.Doe@Example.com "), "jane.doe@example.com");
});

test("5. normalizeEmail handles null/blank", () => {
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail("   "), null);
});

test("6. normalizePhone strips non-digits (reused from roster normalizer)", () => {
  assert.equal(normalizePhone("(972) 679-9919"), "9726799919");
});

test("7. coreFirstNameToken takes only the first whitespace-separated token", () => {
  assert.equal(coreFirstNameToken("Marilyn Holstein"), "marilyn");
  assert.equal(coreFirstNameToken("Marilyn"), "marilyn");
  assert.equal(coreFirstNameToken(null), "");
});

test("8. nameTokenSet splits on whitespace AND hyphens", () => {
  assert.deepEqual([...nameTokenSet("Nickell-Willson")].sort(), ["nickell", "willson"]);
  assert.deepEqual([...nameTokenSet("Nickell Willson")].sort(), ["nickell", "willson"]);
});

test("9. isStrictTokenSuperset: a real subset relationship qualifies", () => {
  assert.equal(isStrictTokenSuperset(nameTokenSet("Marilyn"), nameTokenSet("Marilyn Holstein")), true);
});

test("10. isStrictTokenSuperset: two equal-size sets never qualify, even if identical", () => {
  assert.equal(isStrictTokenSuperset(nameTokenSet("Marilyn"), nameTokenSet("Marilyn")), false);
});

test("11. isStrictTokenSuperset: a set that's missing one of the shorter side's tokens never qualifies, even if it shares another token", () => {
  assert.equal(isStrictTokenSuperset(nameTokenSet("Jones Smith"), nameTokenSet("Smith Anderson")), false);
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

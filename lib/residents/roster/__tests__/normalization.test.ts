// Pure-function tests for ../normalization.ts. Run with:
//   npm run test:residentRoster
import assert from "node:assert/strict";
import { looksLikeEmail, normalizeName, normalizePhone, normalizeUnit, splitCoupleFirstNames } from "../normalization.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. normalizeUnit strips 'Unit '/'Apt.' prefixes and whitespace", () => {
  assert.equal(normalizeUnit("  1201  "), "1201");
  assert.equal(normalizeUnit("Unit 1201"), "1201");
  assert.equal(normalizeUnit("Apt. 1201"), "1201");
  assert.equal(normalizeUnit(1201), "1201");
});

test("2. normalizeUnit handles null/undefined", () => {
  assert.equal(normalizeUnit(null), "");
  assert.equal(normalizeUnit(undefined), "");
});

test("3. normalizeName lowercases, strips periods, collapses whitespace", () => {
  assert.equal(normalizeName("  Bob   Hatch. "), "bob hatch");
});

test("4. normalizeName handles a name with a suffix or middle initial", () => {
  assert.equal(normalizeName("John R. Smith Jr."), "john r smith jr");
});

test("5. splitCoupleFirstNames splits on '&'", () => {
  assert.deepEqual(splitCoupleFirstNames("Bob & Pam"), ["Bob", "Pam"]);
});

test("6. splitCoupleFirstNames splits on 'and'", () => {
  assert.deepEqual(splitCoupleFirstNames("John and Evette"), ["John", "Evette"]);
});

test("7. splitCoupleFirstNames splits on '/'", () => {
  assert.deepEqual(splitCoupleFirstNames("Richard/Beverly"), ["Richard", "Beverly"]);
});

test("8. splitCoupleFirstNames treats a plain multi-word first name as one person", () => {
  assert.deepEqual(splitCoupleFirstNames("Mary Jane"), ["Mary Jane"]);
});

test("9. splitCoupleFirstNames on a single name returns one entry", () => {
  assert.deepEqual(splitCoupleFirstNames("Janet"), ["Janet"]);
});

test("10. looksLikeEmail accepts a real email and rejects a note", () => {
  assert.equal(looksLikeEmail("hatch.biz@bobnpam.com"), true);
  assert.equal(looksLikeEmail("6/8/26 Move In"), false);
  assert.equal(looksLikeEmail(null), false);
});

test("11. normalizePhone strips non-digits", () => {
  assert.equal(normalizePhone("(972) 679-9919"), "9726799919");
  assert.equal(normalizePhone(null), null);
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

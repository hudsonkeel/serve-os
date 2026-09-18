import assert from "node:assert/strict";
import { normalizeContactEmail, normalizeContactPhone } from "../normalization.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("normalizeContactEmail: trims and lowercases", () => {
  assert.equal(normalizeContactEmail("  Susan@Example.com  "), "susan@example.com");
});

test("normalizeContactEmail: empty/whitespace-only/null/undefined all normalize to null", () => {
  assert.equal(normalizeContactEmail(""), null);
  assert.equal(normalizeContactEmail("   "), null);
  assert.equal(normalizeContactEmail(null), null);
  assert.equal(normalizeContactEmail(undefined), null);
});

test("normalizeContactPhone: strips formatting punctuation down to 10 digits", () => {
  assert.equal(normalizeContactPhone("(214) 555-0187"), "2145550187");
});

test("normalizeContactPhone: strips a leading US country code '1' only when exactly 10 digits remain", () => {
  assert.equal(normalizeContactPhone("+1 214-555-0187"), "2145550187");
  assert.equal(normalizeContactPhone("12145550187"), "2145550187");
});

test("normalizeContactPhone: a number that is NOT exactly 10 digits after stripping normalizes to null, never a wrong guess", () => {
  assert.equal(normalizeContactPhone("555-0187"), null); // too short (7 digits)
  assert.equal(normalizeContactPhone("011-44-20-7946-0958"), null); // international, not 10 digits after strip
  assert.equal(normalizeContactPhone("1234567890123"), null); // too long
});

test("normalizeContactPhone: empty/null/undefined normalize to null", () => {
  assert.equal(normalizeContactPhone(""), null);
  assert.equal(normalizeContactPhone(null), null);
  assert.equal(normalizeContactPhone(undefined), null);
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

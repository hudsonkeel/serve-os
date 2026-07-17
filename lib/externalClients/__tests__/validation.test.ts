// Pure-function tests for lib/externalClients/validation.ts. Run with:
//   npm run test:externalClients
import assert from "node:assert/strict";
import {
  isValidUsState,
  isValidZipCode,
  normalizeOptionalText,
  normalizeRequiredName,
  validateServiceAddress,
} from "../validation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── normalizeRequiredName ────────────────────────────────────────────

test("1. normalizeRequiredName trims and accepts a non-blank value", () => {
  const result = normalizeRequiredName("  Jennifer  ", "first name");
  assert.equal(result.value, "Jennifer");
  assert.equal(result.error, undefined);
});

test("2. normalizeRequiredName rejects a blank value", () => {
  const result = normalizeRequiredName("   ", "first name");
  assert.equal(result.value, undefined);
  assert.equal(result.error, "Enter a first name.");
});

// ─── isValidUsState ─────────────────────────────────────────────────────

test("3. isValidUsState accepts a known state, case-insensitively", () => {
  assert.equal(isValidUsState("TX"), true);
  assert.equal(isValidUsState("tx"), true);
});

test("4. isValidUsState rejects an unknown value", () => {
  assert.equal(isValidUsState("XX"), false);
  assert.equal(isValidUsState("Texas"), false);
});

// ─── isValidZipCode ───────────────────────────────────────────────────

test("5. isValidZipCode accepts a 5-digit ZIP", () => {
  assert.equal(isValidZipCode("75034"), true);
});

test("6. isValidZipCode accepts a ZIP+4", () => {
  assert.equal(isValidZipCode("75034-1234"), true);
});

test("7. isValidZipCode rejects a malformed value", () => {
  assert.equal(isValidZipCode("ABCDE"), false);
  assert.equal(isValidZipCode("123"), false);
  assert.equal(isValidZipCode("75034-12"), false);
});

// ─── validateServiceAddress ───────────────────────────────────────────

test("8. validateServiceAddress accepts a complete address", () => {
  const result = validateServiceAddress({
    addressLine1: "123 Main St",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
  assert.deepEqual(result.value, {
    addressLine1: "123 Main St",
    addressLine2: null,
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
  assert.equal(result.error, undefined);
});

test("9. validateServiceAddress carries addressLine2 through when supplied", () => {
  const result = validateServiceAddress({
    addressLine1: "123 Main St",
    addressLine2: "Apt 4B",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
  assert.equal(result.value?.addressLine2, "Apt 4B");
});

test("10. validateServiceAddress rejects a missing street", () => {
  const result = validateServiceAddress({ addressLine1: "", city: "Frisco", state: "TX", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("11. validateServiceAddress rejects a missing city", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "  ", state: "TX", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("12. validateServiceAddress rejects a missing state", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "Frisco", state: "", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("13. validateServiceAddress rejects a missing postal code", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "Frisco", state: "TX", postalCode: "" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("14. validateServiceAddress rejects an invalid state abbreviation", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "Frisco", state: "ZZ", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error?.includes("state"));
});

test("15. validateServiceAddress rejects a malformed ZIP code", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "Frisco", state: "TX", postalCode: "abc" });
  assert.equal(result.value, undefined);
  assert.ok(result.error?.includes("ZIP"));
});

test("16. validateServiceAddress trims and uppercases the state", () => {
  const result = validateServiceAddress({
    addressLine1: "  123 Main St  ",
    city: " Frisco ",
    state: " tx ",
    postalCode: " 75034 ",
  });
  assert.deepEqual(result.value, {
    addressLine1: "123 Main St",
    addressLine2: null,
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
});

// ─── normalizeOptionalText ─────────────────────────────────────────────

test("17. normalizeOptionalText returns null for undefined/blank", () => {
  assert.equal(normalizeOptionalText(undefined), null);
  assert.equal(normalizeOptionalText("   "), null);
});

test("18. normalizeOptionalText trims a real value", () => {
  assert.equal(normalizeOptionalText("  hello  "), "hello");
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

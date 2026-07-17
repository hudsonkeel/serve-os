// Pure-function tests for lib/externalClients/validation.ts. Run with:
//   npm run test:externalClients
import assert from "node:assert/strict";
import {
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

// ─── validateServiceAddress ───────────────────────────────────────────

test("3. validateServiceAddress accepts a complete address", () => {
  const result = validateServiceAddress({
    addressLine1: "123 Main St",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
  assert.deepEqual(result.value, {
    addressLine1: "123 Main St",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
  assert.equal(result.error, undefined);
});

test("4. validateServiceAddress rejects a missing street", () => {
  const result = validateServiceAddress({ addressLine1: "", city: "Frisco", state: "TX", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("5. validateServiceAddress rejects a missing city", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "  ", state: "TX", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("6. validateServiceAddress rejects a missing state", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "Frisco", state: "", postalCode: "75034" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("7. validateServiceAddress rejects a missing postal code", () => {
  const result = validateServiceAddress({ addressLine1: "123 Main St", city: "Frisco", state: "TX", postalCode: "" });
  assert.equal(result.value, undefined);
  assert.ok(result.error);
});

test("8. validateServiceAddress trims all fields", () => {
  const result = validateServiceAddress({
    addressLine1: "  123 Main St  ",
    city: " Frisco ",
    state: " TX ",
    postalCode: " 75034 ",
  });
  assert.deepEqual(result.value, {
    addressLine1: "123 Main St",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
});

// ─── normalizeOptionalText ─────────────────────────────────────────────

test("9. normalizeOptionalText returns null for undefined/blank", () => {
  assert.equal(normalizeOptionalText(undefined), null);
  assert.equal(normalizeOptionalText("   "), null);
});

test("10. normalizeOptionalText trims a real value", () => {
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

// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/sectionNumbers.test.ts
import assert from "node:assert/strict";
import { extractExplicitSectionNumbers, namespaceSectionNumber, normalizeBareSectionNumber } from "../sectionNumbers.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("normalizes a bare, §-prefixed, and 558.-prefixed number to the same value", () => {
  assert.equal(normalizeBareSectionNumber("245"), "245");
  assert.equal(normalizeBareSectionNumber("§245"), "245");
  assert.equal(normalizeBareSectionNumber("§558.245"), "245");
  assert.equal(normalizeBareSectionNumber("558.245"), "245");
  assert.equal(normalizeBareSectionNumber("  245  "), "245");
});

test("namespaces P&P and Texas PAS to the shared bare number", () => {
  assert.equal(namespaceSectionNumber("serve_pnp", "245"), "245");
  assert.equal(namespaceSectionNumber("texas_pas", "§558.245"), "245");
});

test("namespaces the EPRP and Occupations Code cross-reference distinctly, never colliding with a bare §558 number", () => {
  assert.equal(namespaceSectionNumber("serve_controlled_procedure", "1"), "EPRP-1");
  assert.equal(namespaceSectionNumber("serve_controlled_procedure", "4.1"), "EPRP-4.1");
  assert.equal(namespaceSectionNumber("texas_statute_cross_reference", "102.001"), "OCC-102.001");
  // Critically: EPRP section "1" must never equal texas_pas/serve_pnp "1".
  assert.notEqual(namespaceSectionNumber("serve_controlled_procedure", "1"), namespaceSectionNumber("texas_pas", "1"));
});

test("extracts an explicit §-marked or 'section N' reference", () => {
  assert.deepEqual(extractExplicitSectionNumbers("What does §281 require?"), ["281"]);
  assert.deepEqual(extractExplicitSectionNumbers("See §558.245 for staffing."), ["245"]);
  assert.deepEqual(extractExplicitSectionNumbers("Per section 290, what happens?"), ["290"]);
  assert.deepEqual(extractExplicitSectionNumbers("Sec. 404 covers supervision."), ["404"]);
});

test("does not treat an ordinary bare number in the question as a section reference", () => {
  assert.deepEqual(extractExplicitSectionNumbers("How often do we reassess a client every 12 months?"), []);
  assert.deepEqual(extractExplicitSectionNumbers("Services must begin within 5 days."), []);
});

test("dedupes repeated explicit references and preserves order", () => {
  assert.deepEqual(extractExplicitSectionNumbers("§245 and again §245, then §281."), ["245", "281"]);
});

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

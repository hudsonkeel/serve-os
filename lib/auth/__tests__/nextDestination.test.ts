import assert from "node:assert/strict";
import { resolveNextDestination } from "../nextDestination.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("null falls back to /workspace", () => {
  assert.equal(resolveNextDestination(null), "/workspace");
});

test("undefined falls back to /workspace", () => {
  assert.equal(resolveNextDestination(undefined), "/workspace");
});

test("empty string falls back to /workspace", () => {
  assert.equal(resolveNextDestination(""), "/workspace");
});

test("a valid internal path is honored", () => {
  assert.equal(resolveNextDestination("/residents"), "/residents");
});

test("a valid internal path with a query string is honored", () => {
  assert.equal(resolveNextDestination("/residents?tab=wellness_watch"), "/residents?tab=wellness_watch");
});

test("/workspace itself is honored (not treated as a special case)", () => {
  assert.equal(resolveNextDestination("/workspace"), "/workspace");
});

test("a path with no leading slash falls back to /workspace", () => {
  assert.equal(resolveNextDestination("residents"), "/workspace");
});

test("a protocol-relative URL falls back to /workspace (open-redirect protection)", () => {
  assert.equal(resolveNextDestination("//evil.com"), "/workspace");
});

test("an absolute external URL falls back to /workspace", () => {
  assert.equal(resolveNextDestination("https://evil.com/phish"), "/workspace");
});

test("a javascript: URL falls back to /workspace", () => {
  assert.equal(resolveNextDestination("javascript:alert(1)"), "/workspace");
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

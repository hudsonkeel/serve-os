// Pure-function tests for ../ownership.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import { isUnassigned, matchesCurrentUser } from "../ownership.ts";
import type { WorkItem } from "../workItem.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function item(overrides: Partial<WorkItem>): WorkItem {
  return { id: "x", sourceType: "other", title: "x", status: "needs_attention", evidenceType: "explicit", sourceRoute: "/", explanation: "test", ...overrides };
}

test("1. matches by email, case-insensitive", () => {
  const result = matchesCurrentUser(item({ ownerId: "Jane@Example.com" }), { email: "jane@example.com" });
  assert.equal(result, true);
});

test("2. matches by full name when ownerLabel is used instead of ownerId", () => {
  const result = matchesCurrentUser(item({ ownerLabel: "Jane Doe" }), { email: "jane@example.com", fullName: "jane doe" });
  assert.equal(result, true);
});

test("3. no match when owner string matches neither email nor full name", () => {
  const result = matchesCurrentUser(item({ ownerId: "someone-else@example.com" }), { email: "jane@example.com", fullName: "Jane Doe" });
  assert.equal(result, false);
});

test("4. an item with no owner at all never matches, and is reported unassigned", () => {
  const unowned = item({});
  assert.equal(matchesCurrentUser(unowned, { email: "jane@example.com" }), false);
  assert.equal(isUnassigned(unowned), true);
});

test("5. isUnassigned is false once either ownerId or ownerLabel is set", () => {
  assert.equal(isUnassigned(item({ ownerId: "jane@example.com" })), false);
  assert.equal(isUnassigned(item({ ownerLabel: "Jane Doe" })), false);
});

test("6. an empty-string current-user identity never falsely matches an empty owner", () => {
  const result = matchesCurrentUser(item({}), { email: "", fullName: "" });
  assert.equal(result, false);
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

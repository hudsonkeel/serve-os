// Pure-function tests for ../needsMerge.ts — Current Needs append/dedup
// logic (data-placement principle A: append only what isn't already
// represented, never overwrite). Run with:
//   npm run test:importResidentSourceNotes
import assert from "node:assert/strict";
import { mergeNeeds } from "../needsMerge.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. empty existing content: all needs are new", () => {
  const result = mergeNeeds("", ["medication reminders", "walker assistance"]);
  assert.equal(result.newNeeds.length, 2);
  assert.equal(result.alreadyRepresented.length, 0);
  assert.ok(result.mergedContent.includes("Medication reminders."));
  assert.ok(result.mergedContent.includes("Walker assistance."));
});

test("2. a need already represented by keyword match is not duplicated", () => {
  const existing = "Resident receives medication reminders daily.";
  const result = mergeNeeds(existing, ["medication reminders", "walker assistance"]);
  assert.deepEqual(result.alreadyRepresented, ["medication reminders"]);
  assert.deepEqual(result.newNeeds, ["walker assistance"]);
  assert.ok(result.mergedContent.startsWith(existing));
});

test("3. no new needs -> mergedContent equals existing content, appendedContent is null", () => {
  const existing = "Resident uses a walker and needs medication reminders.";
  const result = mergeNeeds(existing, ["walker assistance", "medication reminders"]);
  assert.equal(result.newNeeds.length, 0);
  assert.equal(result.appendedContent, null);
  assert.equal(result.mergedContent, existing);
});

test("4. existing content is never truncated or reordered, only appended to", () => {
  const existing = "Long-standing note about family preferences that must be preserved verbatim.";
  const result = mergeNeeds(existing, ["shower assistance"]);
  assert.ok(result.mergedContent.startsWith(existing));
  assert.ok(result.mergedContent.includes("Shower assistance."));
});

test("5. 'cannot walk without walker' preserves the source-stated mobility limitation, no diagnosis", () => {
  const result = mergeNeeds("", ["cannot walk without walker"]);
  assert.ok(result.mergedContent.includes("Resident reportedly cannot walk without a walker."));
  assert.ok(!/diagnos/i.test(result.mergedContent));
});

test("6. 'leg issues' is preserved as reported, not diagnosed", () => {
  const result = mergeNeeds("", ["leg issues"]);
  assert.equal(result.mergedContent, "Resident reportedly has significant leg issues.");
});

test("7. re-running mergeNeeds against its own output changes nothing further (idempotent)", () => {
  const first = mergeNeeds("", ["medication reminders", "walker assistance"]);
  const second = mergeNeeds(first.mergedContent, ["medication reminders", "walker assistance"]);
  assert.equal(second.newNeeds.length, 0);
  assert.equal(second.mergedContent, first.mergedContent);
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

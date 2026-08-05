// Pure-function tests for ../ranking.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import { rankWorkItems } from "../ranking.ts";
import type { WorkItem } from "../workItem.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function item(overrides: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    sourceType: "other",
    title: overrides.id,
    status: "needs_attention",
    evidenceType: "explicit",
    sourceRoute: "/",
    explanation: "test",
    ...overrides,
  };
}

test("1. urgent priority ranks before normal priority", () => {
  const urgent = item({ id: "a", priority: "urgent" });
  const normal = item({ id: "b", priority: "normal" });
  const [first] = rankWorkItems([normal, urgent]);
  assert.equal(first.id, "a");
});

test("2. items without a priority rank after every explicit priority, including 'low'", () => {
  const low = item({ id: "a", priority: "low" });
  const none = item({ id: "b" });
  const [first, second] = rankWorkItems([none, low]);
  assert.equal(first.id, "a");
  assert.equal(second.id, "b");
});

test("3. within the same priority, earlier dueAt ranks first", () => {
  const later = item({ id: "a", priority: "normal", dueAt: "2026-08-01T00:00:00.000Z" });
  const earlier = item({ id: "b", priority: "normal", dueAt: "2026-07-26T00:00:00.000Z" });
  const [first] = rankWorkItems([later, earlier]);
  assert.equal(first.id, "b");
});

test("4. undated items sort after dated items within the same priority", () => {
  const dated = item({ id: "a", priority: "normal", dueAt: "2026-08-01T00:00:00.000Z" });
  const undated = item({ id: "b", priority: "normal" });
  const [first] = rankWorkItems([undated, dated]);
  assert.equal(first.id, "a");
});

test("5. full tie falls back to id for a stable, deterministic order", () => {
  const a = item({ id: "aaa", priority: "normal" });
  const b = item({ id: "bbb", priority: "normal" });
  const result1 = rankWorkItems([b, a]);
  const result2 = rankWorkItems([b, a]);
  assert.deepEqual(result1.map((i) => i.id), result2.map((i) => i.id));
  assert.equal(result1[0].id, "aaa");
});

test("6. rankWorkItems does not mutate its input array", () => {
  const input = [item({ id: "b" }), item({ id: "a" })];
  const before = [...input];
  rankWorkItems(input);
  assert.deepEqual(input, before);
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

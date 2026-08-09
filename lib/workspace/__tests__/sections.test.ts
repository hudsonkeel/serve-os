// Pure-function tests for ../sections.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import { WORK_SECTION_CONFIG, bucketWorkItemsBySection } from "../sections.ts";
import type { WorkItem, WorkItemStatus } from "../workItem.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function item(id: string, status: WorkItemStatus): WorkItem {
  return { id, sourceType: "other", title: id, status, evidenceType: "explicit", sourceRoute: "/", explanation: "test" };
}

test("1. every WorkItemStatus value has exactly one section config entry", () => {
  const statuses: WorkItemStatus[] = ["needs_attention", "in_progress", "due_today", "upcoming", "waiting", "completed"];
  for (const status of statuses) {
    const matches = WORK_SECTION_CONFIG.filter((c) => c.status === status);
    assert.equal(matches.length, 1, `expected exactly one config entry for ${status}`);
  }
});

test("2. bucketWorkItemsBySection groups items by status into the matching section, in config order", () => {
  const items = [item("a", "due_today"), item("b", "needs_attention"), item("c", "completed")];
  const sections = bucketWorkItemsBySection(items);
  assert.equal(sections[0].status, "needs_attention");
  assert.deepEqual(sections.find((s) => s.status === "needs_attention")?.items.map((i) => i.id), ["b"]);
  assert.deepEqual(sections.find((s) => s.status === "due_today")?.items.map((i) => i.id), ["a"]);
  assert.deepEqual(sections.find((s) => s.status === "completed")?.items.map((i) => i.id), ["c"]);
});

test("3. a section with no matching items gets an empty items array, not omitted from the config-driven list", () => {
  const sections = bucketWorkItemsBySection([item("a", "needs_attention")]);
  const waiting = sections.find((s) => s.status === "waiting");
  assert.ok(waiting);
  assert.deepEqual(waiting?.items, []);
});

test("4. needs_attention and due_today are configured to always render even when empty", () => {
  const needsAttention = WORK_SECTION_CONFIG.find((c) => c.status === "needs_attention");
  const dueToday = WORK_SECTION_CONFIG.find((c) => c.status === "due_today");
  assert.equal(needsAttention?.alwaysRender, true);
  assert.equal(dueToday?.alwaysRender, true);
});

test("5. every section config has a non-empty label and emptyStateDescription", () => {
  for (const config of WORK_SECTION_CONFIG) {
    assert.ok(config.label.length > 0);
    assert.ok(config.emptyStateDescription.length > 0);
  }
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

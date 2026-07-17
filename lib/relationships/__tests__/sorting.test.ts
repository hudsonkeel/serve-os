// Pure-function tests for lib/relationships/sorting.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import {
  selectPrimaryOpenAction,
  sortActionBoardRows,
  sortWhiteboardRows,
  type OpenActionLike,
  type SortableRelationshipRow,
} from "../sorting.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function action(overrides: Partial<OpenActionLike> & { id: string }): OpenActionLike {
  return {
    dueAt: null,
    priority: "normal",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── selectPrimaryOpenAction ─────────────────────────────────────────

test("1. no open actions -> null", () => {
  assert.equal(selectPrimaryOpenAction([]), null);
});

test("2. single open action -> itself", () => {
  const a = action({ id: "a" });
  assert.equal(selectPrimaryOpenAction([a]), a);
});

test("3. nearest future action wins over a farther one", () => {
  const near = action({ id: "near", dueAt: "2026-07-20T00:00:00.000Z" });
  const far = action({ id: "far", dueAt: "2026-08-01T00:00:00.000Z" });
  assert.equal(selectPrimaryOpenAction([far, near])?.id, "near");
});

test("4. overdue action takes precedence over a future action", () => {
  const overdue = action({ id: "overdue", dueAt: "2020-01-01T00:00:00.000Z" });
  const future = action({ id: "future", dueAt: "2026-08-01T00:00:00.000Z" });
  assert.equal(selectPrimaryOpenAction([future, overdue])?.id, "overdue");
});

test("5. action with a due date beats one with no due date", () => {
  const dated = action({ id: "dated", dueAt: "2027-01-01T00:00:00.000Z" });
  const undated = action({ id: "undated", dueAt: null });
  assert.equal(selectPrimaryOpenAction([undated, dated])?.id, "dated");
});

test("6. same-day tie broken by higher priority", () => {
  const urgent = action({ id: "urgent", dueAt: "2026-07-20T00:00:00.000Z", priority: "urgent" });
  const normal = action({ id: "normal", dueAt: "2026-07-20T00:00:00.000Z", priority: "normal" });
  assert.equal(selectPrimaryOpenAction([normal, urgent])?.id, "urgent");
});

test("7. same due date and priority tie broken by oldest creation date", () => {
  const older = action({
    id: "older",
    dueAt: "2026-07-20T00:00:00.000Z",
    priority: "high",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const newer = action({
    id: "newer",
    dueAt: "2026-07-20T00:00:00.000Z",
    priority: "high",
    createdAt: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(selectPrimaryOpenAction([newer, older])?.id, "older");
});

test("8. completing the nearest action reveals the next one", () => {
  const nearest = action({ id: "nearest", dueAt: "2026-07-20T00:00:00.000Z" });
  const next = action({ id: "next", dueAt: "2026-07-25T00:00:00.000Z" });
  const stillOpen = [nearest, next];
  assert.equal(selectPrimaryOpenAction(stillOpen)?.id, "nearest");

  const afterCompletion = stillOpen.filter((a) => a.id !== "nearest");
  assert.equal(selectPrimaryOpenAction(afterCompletion)?.id, "next");
});

test("9. two same-day actions tie broken deterministically end to end", () => {
  const a = action({ id: "a", dueAt: "2026-07-20T09:00:00.000Z", priority: "normal" });
  const b = action({ id: "b", dueAt: "2026-07-20T15:00:00.000Z", priority: "normal" });
  // Different times same calendar day — earlier timestamp still wins.
  assert.equal(selectPrimaryOpenAction([b, a])?.id, "a");
});

// ─── sortActionBoardRows / sortWhiteboardRows ────────────────────────

function row(overrides: Partial<SortableRelationshipRow> & { displayName: string }): SortableRelationshipRow {
  return {
    attentionStatus: "upcoming",
    nearestActionDueAt: null,
    priority: "normal",
    lastMeaningfulTouchAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("10. action board: overdue sorts before due_today", () => {
  const overdue = row({ displayName: "Zzz Overdue", attentionStatus: "overdue" });
  const dueToday = row({ displayName: "Aaa Due Today", attentionStatus: "due_today" });
  const sorted = sortActionBoardRows([dueToday, overdue]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Zzz Overdue", "Aaa Due Today"]);
});

test("11. action board: within same severity, sooner due date wins", () => {
  const soon = row({ displayName: "Soon", attentionStatus: "overdue", nearestActionDueAt: "2026-07-01T00:00:00.000Z" });
  const later = row({ displayName: "Later", attentionStatus: "overdue", nearestActionDueAt: "2026-07-10T00:00:00.000Z" });
  const sorted = sortActionBoardRows([later, soon]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Soon", "Later"]);
});

test("12. action board: same severity and due date, priority breaks tie", () => {
  const urgent = row({
    displayName: "Urgent",
    attentionStatus: "due_today",
    nearestActionDueAt: "2026-07-16T00:00:00.000Z",
    priority: "urgent",
  });
  const low = row({
    displayName: "Low",
    attentionStatus: "due_today",
    nearestActionDueAt: "2026-07-16T00:00:00.000Z",
    priority: "low",
  });
  const sorted = sortActionBoardRows([low, urgent]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Urgent", "Low"]);
});

test("13. action board: never-touched relationship sorts before a recently touched one", () => {
  const neverTouched = row({ displayName: "Never Touched", attentionStatus: "no_next_action", lastMeaningfulTouchAt: null });
  const recentlyTouched = row({
    displayName: "Recently Touched",
    attentionStatus: "no_next_action",
    lastMeaningfulTouchAt: "2026-07-15T00:00:00.000Z",
  });
  const sorted = sortActionBoardRows([recentlyTouched, neverTouched]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Never Touched", "Recently Touched"]);
});

test("14. action board: final tie-break is Relationship name", () => {
  const b = row({ displayName: "Bravo" });
  const a = row({ displayName: "Alpha" });
  const sorted = sortActionBoardRows([b, a]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Alpha", "Bravo"]);
});

test("15. whiteboard: most recently updated wins after severity/due/priority tie", () => {
  const older = row({ displayName: "Older", updatedAt: "2026-07-01T00:00:00.000Z" });
  const newer = row({ displayName: "Newer", updatedAt: "2026-07-15T00:00:00.000Z" });
  const sorted = sortWhiteboardRows([older, newer]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Newer", "Older"]);
});

test("16. whiteboard: attention severity still outranks recency", () => {
  const overdueOld = row({ displayName: "Overdue", attentionStatus: "overdue", updatedAt: "2020-01-01T00:00:00.000Z" });
  const upcomingNew = row({ displayName: "Upcoming", attentionStatus: "upcoming", updatedAt: "2026-07-15T00:00:00.000Z" });
  const sorted = sortWhiteboardRows([upcomingNew, overdueOld]);
  assert.deepEqual(sorted.map((r) => r.displayName), ["Overdue", "Upcoming"]);
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

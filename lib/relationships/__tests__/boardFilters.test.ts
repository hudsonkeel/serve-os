// Pure-function tests for lib/relationships/boardFilters.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import {
  applyBoardFilters,
  distinctPresentValues,
  DEFAULT_BOARD_FILTERS,
  UNASSIGNED_VALUE,
  type BoardFilterState,
  type FilterableRow,
} from "../boardFilters.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function row(overrides: Partial<FilterableRow> = {}): FilterableRow {
  return {
    relationshipType: "external_prospect",
    stage: "new_inquiry",
    status: "active",
    ownerLabel: "Brian",
    communityName: "Watermere at Frisco",
    priority: "normal",
    residentId: null,
    ...overrides,
  };
}

function filters(overrides: Partial<BoardFilterState> = {}): BoardFilterState {
  return { ...DEFAULT_BOARD_FILTERS, ...overrides };
}

test("1. default filters return every row unchanged", () => {
  const rows = [row(), row({ relationshipType: "active_client" })];
  assert.equal(applyBoardFilters(rows, DEFAULT_BOARD_FILTERS).length, 2);
});

test("2. filters by relationship type", () => {
  const rows = [row({ relationshipType: "external_prospect" }), row({ relationshipType: "active_client" })];
  const result = applyBoardFilters(rows, filters({ relationshipType: "active_client" }));
  assert.equal(result.length, 1);
  assert.equal(result[0].relationshipType, "active_client");
});

test("3. filters by stage", () => {
  const rows = [row({ stage: "new_inquiry" }), row({ stage: "won" })];
  const result = applyBoardFilters(rows, filters({ stage: "won" }));
  assert.equal(result.length, 1);
});

test("4. filters by owner, including 'Unassigned' via the sentinel value", () => {
  const rows = [row({ ownerLabel: "Brian" }), row({ ownerLabel: null })];
  assert.equal(applyBoardFilters(rows, filters({ ownerLabel: "Brian" })).length, 1);
  const unassigned = applyBoardFilters(rows, filters({ ownerLabel: UNASSIGNED_VALUE }));
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].ownerLabel, null);
});

test("5. filters by community", () => {
  const rows = [row({ communityName: "Watermere at Frisco" }), row({ communityName: "Other Community" })];
  const result = applyBoardFilters(rows, filters({ communityName: "Other Community" }));
  assert.equal(result.length, 1);
});

test("6. filters by priority", () => {
  const rows = [row({ priority: "urgent" }), row({ priority: "low" })];
  const result = applyBoardFilters(rows, filters({ priority: "urgent" }));
  assert.equal(result.length, 1);
});

test("7. resident-link filter: linked only", () => {
  const rows = [row({ residentId: "res-1" }), row({ residentId: null })];
  const result = applyBoardFilters(rows, filters({ residentLink: "linked" }));
  assert.equal(result.length, 1);
  assert.equal(result[0].residentId, "res-1");
});

test("8. resident-link filter: external only", () => {
  const rows = [row({ residentId: "res-1" }), row({ residentId: null })];
  const result = applyBoardFilters(rows, filters({ residentLink: "external" }));
  assert.equal(result.length, 1);
  assert.equal(result[0].residentId, null);
});

test("9. status filter", () => {
  const rows = [row({ status: "active" }), row({ status: "on_hold" }), row({ status: "closed" })];
  assert.equal(applyBoardFilters(rows, filters({ status: "on_hold" })).length, 1);
});

test("10. filters compose (type + priority together)", () => {
  const rows = [
    row({ relationshipType: "active_client", priority: "urgent" }),
    row({ relationshipType: "active_client", priority: "low" }),
    row({ relationshipType: "external_prospect", priority: "urgent" }),
  ];
  const result = applyBoardFilters(rows, filters({ relationshipType: "active_client", priority: "urgent" }));
  assert.equal(result.length, 1);
});

test("11. distinctPresentValues dedupes, drops nulls, and sorts", () => {
  const result = distinctPresentValues(["Brian", null, "Alice", "Brian", null, "Cary"]);
  assert.deepEqual(result, ["Alice", "Brian", "Cary"]);
});

test("12. distinctPresentValues on an all-null list returns empty", () => {
  assert.deepEqual(distinctPresentValues([null, null]), []);
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

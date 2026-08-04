// Pure-function tests for ../state.ts. Run with:
//   npm run test:askServe
import assert from "node:assert/strict";
import { askServeReducer, initialAskServeState } from "../state.ts";
import type { AskServeContext } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const residentContext: AskServeContext = {
  surface: "people_we_serve_detail",
  route: "/residents/abc-123",
  subjectType: "resident",
  subjectId: "abc-123",
  subjectLabel: "Jane Smith",
  knowledgeProfile: "people_we_serve",
};

test("1. initial state is closed with no context", () => {
  assert.equal(initialAskServeState.isOpen, false);
  assert.equal(initialAskServeState.context, null);
});

test("2. open(context) sets isOpen true and stores the exact context passed in", () => {
  const next = askServeReducer(initialAskServeState, { type: "open", context: residentContext });
  assert.equal(next.isOpen, true);
  assert.deepEqual(next.context, residentContext);
});

test("3. close() sets isOpen false and clears context", () => {
  const opened = askServeReducer(initialAskServeState, { type: "open", context: residentContext });
  const closed = askServeReducer(opened, { type: "close" });
  assert.equal(closed.isOpen, false);
  assert.equal(closed.context, null);
});

test("4. opening while already open with a NEW context replaces the context (context replacement, not merge)", () => {
  const first = askServeReducer(initialAskServeState, { type: "open", context: residentContext });
  const secondContext: AskServeContext = { surface: "sidebar", route: "/workspace", knowledgeProfile: "today_work" };
  const second = askServeReducer(first, { type: "open", context: secondContext });
  assert.equal(second.isOpen, true);
  assert.deepEqual(second.context, secondContext);
  assert.notDeepEqual(second.context, residentContext);
});

test("5. closing an already-closed state is a no-op result (still closed, still no context)", () => {
  const closed = askServeReducer(initialAskServeState, { type: "close" });
  assert.equal(closed.isOpen, false);
  assert.equal(closed.context, null);
});

test("6. reducer is pure — never mutates the input state object", () => {
  const before = { ...initialAskServeState };
  askServeReducer(initialAskServeState, { type: "open", context: residentContext });
  assert.deepEqual(initialAskServeState, before);
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

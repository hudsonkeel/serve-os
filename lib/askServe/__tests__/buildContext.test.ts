// Pure-function tests for ../buildContext.ts. Run with:
//   npm run test:askServe
import assert from "node:assert/strict";
import { buildAskServeContext } from "../buildContext.ts";
import { PEOPLE_WE_SERVE_CONTEXT, RELATIONSHIPS_CONTEXT } from "../areaContexts.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. a child with no overrides is identical to its parent", () => {
  assert.deepEqual(buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, {}), PEOPLE_WE_SERVE_CONTEXT);
});

test("2. an override replaces only the specified field, everything else is inherited", () => {
  const child = buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, { surface: "residents_list" });
  assert.equal(child.surface, "residents_list");
  assert.equal(child.knowledgeProfile, PEOPLE_WE_SERVE_CONTEXT.knowledgeProfile);
  assert.equal(child.route, PEOPLE_WE_SERVE_CONTEXT.route);
});

test("3. the deepest valid context always wins — a 3-level chain (area -> Relationships -> Action Board)", () => {
  const actionBoard = buildAskServeContext(RELATIONSHIPS_CONTEXT, {
    surface: "relationship_action_board",
    route: "/relationships/actions",
    pageTitle: "The People We Serve · Action Board",
  });
  // Inherited from the area, two levels up:
  assert.equal(actionBoard.knowledgeProfile, "people_we_serve");
  // Inherited from Relationships, one level up:
  assert.equal(actionBoard.subjectType, "relationship_collection");
  // Overridden at this exact depth:
  assert.equal(actionBoard.surface, "relationship_action_board");
  assert.equal(actionBoard.route, "/relationships/actions");
});

test("4. RELATIONSHIPS_CONTEXT itself inherits people_we_serve's knowledgeProfile without restating it", () => {
  assert.equal(RELATIONSHIPS_CONTEXT.knowledgeProfile, PEOPLE_WE_SERVE_CONTEXT.knowledgeProfile);
});

test("5. never mutates the parent object", () => {
  const before = { ...PEOPLE_WE_SERVE_CONTEXT };
  buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, { surface: "residents_list", subjectId: "abc" });
  assert.deepEqual(PEOPLE_WE_SERVE_CONTEXT, before);
});

test("6. subjectId/subjectLabel added at the deepest level don't leak back into the parent constant", () => {
  buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, { subjectType: "resident", subjectId: "r1", subjectLabel: "Ada Washington" });
  assert.equal(PEOPLE_WE_SERVE_CONTEXT.subjectId, undefined);
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

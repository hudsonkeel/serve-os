// Pure-function tests for ../knowledgeProfiles.ts. Run with:
//   npm run test:askServe
import assert from "node:assert/strict";
import { getKnowledgeProfileForRoute, KNOWLEDGE_PROFILE_COPY } from "../knowledgeProfiles.ts";
import type { AskServeKnowledgeProfile } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. dashboard route (exact '/') maps to organization_performance, not general", () => {
  assert.equal(getKnowledgeProfileForRoute("/"), "organization_performance");
});

test("2. '/workspace' maps to today_work", () => {
  assert.equal(getKnowledgeProfileForRoute("/workspace"), "today_work");
});

test("3. '/residents' and its nested detail route map to people_we_serve", () => {
  assert.equal(getKnowledgeProfileForRoute("/residents"), "people_we_serve");
  assert.equal(getKnowledgeProfileForRoute("/residents/abc-123"), "people_we_serve");
});

test("4. '/relationships' and its sub-routes map to people_we_serve", () => {
  assert.equal(getKnowledgeProfileForRoute("/relationships"), "people_we_serve");
  assert.equal(getKnowledgeProfileForRoute("/relationships/actions"), "people_we_serve");
  assert.equal(getKnowledgeProfileForRoute("/relationships/whiteboard"), "people_we_serve");
});

test("5. '/external-clients' maps to people_we_serve", () => {
  assert.equal(getKnowledgeProfileForRoute("/external-clients"), "people_we_serve");
});

test("6. '/recruiting' maps to people_who_serve", () => {
  assert.equal(getKnowledgeProfileForRoute("/recruiting"), "people_who_serve");
});

test("7. '/community-intelligence' maps to community_outlook", () => {
  assert.equal(getKnowledgeProfileForRoute("/community-intelligence"), "community_outlook");
});

test("8. an unrecognized route falls back to general, never crashing or guessing", () => {
  assert.equal(getKnowledgeProfileForRoute("/settings"), "general");
  assert.equal(getKnowledgeProfileForRoute("/some-future-route"), "general");
});

test("9. every AskServeKnowledgeProfile value has copy defined (heading, description, and at least one example question)", () => {
  const profiles: AskServeKnowledgeProfile[] = [
    "today_work",
    "people_we_serve",
    "people_who_serve",
    "organization_performance",
    "community_outlook",
    "general",
  ];
  for (const profile of profiles) {
    const copy = KNOWLEDGE_PROFILE_COPY[profile];
    assert.ok(copy, `missing copy for ${profile}`);
    assert.ok(copy.heading.length > 0);
    assert.ok(copy.description.length > 0);
    assert.ok(copy.exampleQuestions.length > 0);
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

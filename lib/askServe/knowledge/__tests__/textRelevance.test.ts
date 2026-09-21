// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/textRelevance.test.ts
import assert from "node:assert/strict";
import { normalizeScores, scoreRelevance, tokenize } from "../textRelevance.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("tokenize lowercases, strips punctuation, and drops stopwords (including question filler like 'often'/'need')", () => {
  assert.deepEqual(tokenize("How often do we reassess a client?"), ["reassess", "client"]);
});

test("scores zero when no query term appears in the document", () => {
  const score = scoreRelevance(tokenize("medication assistance"), "Agency operating hours are Monday through Friday.");
  assert.equal(score, 0);
});

test("scores higher for a document matching more of the query's terms", () => {
  const query = tokenize("caregiver supervisory visit");
  const strong = scoreRelevance(query, "Serve Caregiving administrative staff will perform supervisory visits with caregivers every 12 months.");
  const weak = scoreRelevance(query, "Serve Caregiving administrative staff will perform reviews.");
  assert.ok(strong > weak, `expected strong (${strong}) > weak (${weak})`);
});

test("applies a length penalty so a short document matching both query terms outscores a long one repeating only one of them", () => {
  const query = tokenize("infection control");
  const short = scoreRelevance(query, "Infection control policy. Serve documents infections promptly.");
  // Matches only "infection" (one of the two query terms) — correctly
  // scores 0 regardless of length: a single-term match on an otherwise
  // unrelated document is not evidence of relevance (see the >1-term
  // coverage gate in scoreRelevance).
  const longSingleTermMatch = scoreRelevance(query, "Infection " + "filler word text ".repeat(200));
  assert.ok(short > 0);
  assert.equal(longSingleTermMatch, 0);
});

test("a long document matching BOTH query terms still scores lower than a short, equally on-topic one", () => {
  const query = tokenize("infection control");
  const short = scoreRelevance(query, "Infection control policy. Serve documents infections promptly.");
  const long = scoreRelevance(query, "Infection control. " + "filler word text ".repeat(200));
  assert.ok(short > long, `expected short (${short}) > long (${long})`);
});

test("normalizeScores divides by the maximum and returns all zeros when every input is zero", () => {
  assert.deepEqual(normalizeScores([2, 4, 0]), [0.5, 1, 0]);
  assert.deepEqual(normalizeScores([0, 0]), [0, 0]);
});

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

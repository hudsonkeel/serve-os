// Pure-function tests for lib/scheduling/visitIdentityDiagnostics.ts.
// Run with: npm run test:scheduling
//
// Includes a source-scan check (matching visitsPerActiveClient.test.ts's
// style) proving this module has no write/ingestion capability at all —
// diagnostic-only is a structural guarantee, not just a comment.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifySourceRecordIdShape,
  computeVisitFingerprint,
  diagnoseIdStability,
  type IdStabilityRecord,
} from "../visitIdentityDiagnostics.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Shape classification ────────────────────────────────────────────────

test("'s=<id>:d=<date>' is classified as schedule_placeholder", () => {
  assert.equal(classifySourceRecordIdShape("s=138:d=2026-09-06"), "schedule_placeholder");
});

test("'v=<id>:s=<id>:d=<date>' is classified as visit_record", () => {
  assert.equal(classifySourceRecordIdShape("v=1628:s=0:d=2026-09-05"), "visit_record");
});

test("a plain numeric id is classified as other (never observed live, but not assumed impossible)", () => {
  assert.equal(classifySourceRecordIdShape("48213"), "other");
});

// ─── diagnoseIdStability ─────────────────────────────────────────────────

test("identical source ids for the same fingerprint are not flagged as a candidate match", () => {
  const records: IdStabilityRecord[] = [
    { sourceRecordId: "v=1:s=0:d=2026-09-05", fingerprint: "r1::2026-09-05::t1" },
    { sourceRecordId: "v=1:s=0:d=2026-09-05", fingerprint: "r1::2026-09-05::t1" },
  ];
  const result = diagnoseIdStability(records);
  assert.equal(result.candidateContinuityMatches.length, 0);
  assert.equal(result.suspectedPlaceholderToVisitTransitions, 0);
});

test("a plausible same-fingerprint/different-source-id pair surfaces as a candidate match (diagnostic only)", () => {
  const records: IdStabilityRecord[] = [
    { sourceRecordId: "s=138:d=2026-09-06", fingerprint: "r1::2026-09-06::t1" },
    { sourceRecordId: "v=1900:s=0:d=2026-09-06", fingerprint: "r1::2026-09-06::t1" },
  ];
  const result = diagnoseIdStability(records);
  assert.equal(result.candidateContinuityMatches.length, 1);
  assert.deepEqual(
    new Set(result.candidateContinuityMatches[0]!.sourceRecordIds),
    new Set(["s=138:d=2026-09-06", "v=1900:s=0:d=2026-09-06"])
  );
  assert.equal(result.suspectedPlaceholderToVisitTransitions, 1);
});

test("two independent (non-matching fingerprint) Facts with different shapes do not trigger a false suspected transition", () => {
  const records: IdStabilityRecord[] = [
    { sourceRecordId: "s=138:d=2026-09-06", fingerprint: "r1::2026-09-06::t1" },
    { sourceRecordId: "v=1900:s=0:d=2026-09-07", fingerprint: "r2::2026-09-07::t2" },
  ];
  const result = diagnoseIdStability(records);
  assert.equal(result.candidateContinuityMatches.length, 0);
  assert.equal(result.suspectedPlaceholderToVisitTransitions, 0);
});

test("shape counts are accurate across a mixed batch", () => {
  const records: IdStabilityRecord[] = [
    { sourceRecordId: "s=1:d=2026-09-05", fingerprint: "a" },
    { sourceRecordId: "s=2:d=2026-09-05", fingerprint: "b" },
    { sourceRecordId: "v=1:s=0:d=2026-09-05", fingerprint: "c" },
    { sourceRecordId: "weird-id", fingerprint: "d" },
  ];
  const result = diagnoseIdStability(records);
  assert.equal(result.totalFacts, 4);
  assert.equal(result.schedulePlaceholderCount, 2);
  assert.equal(result.visitRecordCount, 1);
  assert.equal(result.otherShapeCount, 1);
});

test("computeVisitFingerprint distinguishes different scheduled times for the same Client/day", () => {
  const a = computeVisitFingerprint("resident-1", "2026-09-05", "2026-09-05T14:00:00.000Z");
  const b = computeVisitFingerprint("resident-1", "2026-09-05", "2026-09-05T18:00:00.000Z");
  assert.notEqual(a, b);
});

// ─── Structural guarantee: diagnostic-only, no write/ingestion path ──────

test("this module never imports ingestHistoricalFact or any write-capable function", () => {
  const path = fileURLToPath(new URL("../visitIdentityDiagnostics.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  const forbiddenMarkers = ["ingestHistoricalFact", "supersedes_fact_id", ".insert(", ".update(", ".delete(", "createServerClient"];
  for (const marker of forbiddenMarkers) {
    assert.ok(!source.includes(marker), `expected no write-capable reference (found forbidden marker: ${marker})`);
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

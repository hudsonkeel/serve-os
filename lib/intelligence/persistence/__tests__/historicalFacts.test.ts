// Pure-function tests for lib/intelligence/persistence/historicalFacts.ts.
// Run with: npm run test:intelligence
//
// Deliberately does not test getLatestFactForNaturalKey/ingestHistoricalFact/
// getCurrentFactsByTypeAndWindow/getFactHistoryForNaturalKey directly — those
// are thin Supabase I/O wrappers around the pure decision logic tested here,
// matching this codebase's existing convention of unit-testing deterministic
// logic and leaving I/O wrappers untested (see e.g. clientLifecycle.test.ts
// vs. axiscareOperationalState.ts).
import assert from "node:assert/strict";
import { payloadsEqual, decideFactIngestionAction, selectCurrentFacts } from "../historicalFacts.ts";
import type { HistoricalFact } from "../../core/index.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fact(overrides: Partial<HistoricalFact> & { id: string }): HistoricalFact {
  return {
    domain: "scheduling",
    factType: "scheduling.visit_recorded",
    subject: { subjectType: "resident", subjectId: "fict-resident-1" },
    occurredAt: "2026-09-01T09:00:00.000Z",
    recordedAt: "2026-09-01T09:00:00.000Z",
    payload: { status: "completed" },
    provenance: { sourceSystem: "axiscare", sourceRecordId: "fict-visit-1", provenanceConfidence: "confirmed" },
    supersedesFactId: null,
    ...overrides,
  };
}

// ─── payloadsEqual ──────────────────────────────────────────────────────

test("payloadsEqual is true for identical payloads regardless of key order", () => {
  assert.equal(payloadsEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});

test("payloadsEqual is false when a value differs", () => {
  assert.equal(payloadsEqual({ a: 1 }, { a: 2 }), false);
});

test("payloadsEqual is false when a key is added or removed", () => {
  assert.equal(payloadsEqual({ a: 1 }, { a: 1, b: 2 }), false);
});

// ─── decideFactIngestionAction ──────────────────────────────────────────

test("no existing Fact for the natural key -> inserted_new", () => {
  const decision = decideFactIngestionAction(null, { payload: { status: "scheduled" } });
  assert.equal(decision.action, "inserted_new");
  assert.equal(decision.supersedesFactId, null);
});

test("unchanged payload vs. the latest existing Fact -> skipped_unchanged", () => {
  const latest = fact({ id: "fict-fact-1", payload: { status: "completed" } });
  const decision = decideFactIngestionAction(latest, { payload: { status: "completed" } });
  assert.equal(decision.action, "skipped_unchanged");
  assert.equal(decision.supersedesFactId, null);
});

test("changed payload vs. the latest existing Fact -> inserted_superseding, pointing at the prior Fact", () => {
  const latest = fact({ id: "fict-fact-1", payload: { status: "in_progress" } });
  const decision = decideFactIngestionAction(latest, { payload: { status: "completed" } });
  assert.equal(decision.action, "inserted_superseding");
  assert.equal(decision.supersedesFactId, "fict-fact-1");
});

// ─── selectCurrentFacts (supersession correctness) ──────────────────────

test("a corrected Visit's original and superseding Fact do not both appear as current", () => {
  const original = fact({
    id: "fict-fact-1",
    recordedAt: "2026-09-01T09:00:00.000Z",
    payload: { status: "in_progress" },
  });
  const correction = fact({
    id: "fict-fact-2",
    recordedAt: "2026-09-01T12:00:00.000Z",
    payload: { status: "completed" },
    supersedesFactId: "fict-fact-1",
  });

  const current = selectCurrentFacts([original, correction]);
  assert.equal(current.length, 1);
  assert.equal(current[0]!.id, "fict-fact-2");
});

test("selectCurrentFacts is order-independent (correction listed before original)", () => {
  const original = fact({ id: "fict-fact-1", recordedAt: "2026-09-01T09:00:00.000Z" });
  const correction = fact({
    id: "fict-fact-2",
    recordedAt: "2026-09-01T12:00:00.000Z",
    supersedesFactId: "fict-fact-1",
  });

  const current = selectCurrentFacts([correction, original]);
  assert.equal(current.length, 1);
  assert.equal(current[0]!.id, "fict-fact-2");
});

test("Facts with different natural keys are never merged", () => {
  const a = fact({ id: "fict-fact-1", provenance: { sourceSystem: "axiscare", sourceRecordId: "fict-visit-1", provenanceConfidence: "confirmed" } });
  const b = fact({ id: "fict-fact-2", provenance: { sourceSystem: "axiscare", sourceRecordId: "fict-visit-2", provenanceConfidence: "confirmed" } });

  const current = selectCurrentFacts([a, b]);
  assert.equal(current.length, 2);
});

test("Facts with the same source record id but different fact types are never merged", () => {
  const a = fact({ id: "fict-fact-1", factType: "scheduling.visit_recorded" });
  const b = fact({ id: "fict-fact-2", factType: "scheduling.other_event" });

  const current = selectCurrentFacts([a, b]);
  assert.equal(current.length, 2);
});

test("identical recordedAt (a tie) resolves deterministically via id, not array/iteration order", () => {
  const sameRecordedAt = "2026-09-01T09:00:00.000Z";
  const a = fact({ id: "fict-fact-aaa", recordedAt: sameRecordedAt });
  const b = fact({ id: "fict-fact-bbb", recordedAt: sameRecordedAt });

  const forward = selectCurrentFacts([a, b]);
  const reversed = selectCurrentFacts([b, a]);

  assert.equal(forward.length, 1);
  assert.equal(reversed.length, 1);
  // Same winner regardless of input order — "bbb" > "aaa" lexically.
  assert.equal(forward[0]!.id, "fict-fact-bbb");
  assert.equal(reversed[0]!.id, "fict-fact-bbb");
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

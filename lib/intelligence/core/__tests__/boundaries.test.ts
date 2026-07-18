// Runtime tests for lib/intelligence/core. Follows this repository's
// existing hand-rolled node:assert convention (see
// lib/scheduling/__tests__ and lib/integrations/axiscare/__tests__).
//
// This folder is almost entirely TypeScript types, which the TS compiler
// erases at runtime and therefore cannot be exercised by node:assert —
// see __tests__/typeGuarantees.ts for the compile-time-only boundary
// proofs. What CAN be tested at runtime lives here: the one real runtime
// value this folder exports (KNOWN_INTELLIGENCE_DOMAINS), fictional-data
// construction sanity checks for every Phase A primitive (so a shape
// mistake shows up as a compile error future contributors will actually
// see when they copy these examples), a repo-wide scan proving no raw,
// unnormalized vendor type leaks into this domain-agnostic folder, and a
// runtime exhaustiveness check on Evidence's discriminated union.
//
// Run with:
//
//   npm run test:intelligence
//
// All fixtures are fictional.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KNOWN_INTELLIGENCE_DOMAINS } from "../shared.ts";
import type {
  Subject,
  HistoricalFact,
  Signal,
  Evidence,
  EvidenceReference,
  Recommendation,
  Action,
  Outcome,
  Rule,
  RuleVersion,
  RuleRun,
  Explanation,
  LearningObservation,
} from "../index.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── KNOWN_INTELLIGENCE_DOMAINS ──────────────────────────────────────────

test("KNOWN_INTELLIGENCE_DOMAINS matches the Constitution's Article VI domain list, no duplicates", () => {
  const expected = [
    "scheduling",
    "relationship",
    "proposal",
    "community",
    "operational",
    "compliance",
    "recruiting",
  ];
  assert.deepEqual([...KNOWN_INTELLIGENCE_DOMAINS], expected);
  assert.equal(new Set(KNOWN_INTELLIGENCE_DOMAINS).size, KNOWN_INTELLIGENCE_DOMAINS.length);
});

// ─── Fictional-data construction sanity (11 primitives) ─────────────────
// If any of these fail to compile, the shape in the corresponding file is
// wrong — that's the actual test. The runtime assertions below are a
// secondary sanity check that the fixture round-trips as expected.

test("HistoricalFact: fictional data satisfies the shape and round-trips", () => {
  const fact: HistoricalFact = {
    id: "fict-fact-1",
    domain: "scheduling",
    factType: "scheduling.visit_completed",
    subject: { subjectType: "resident", subjectId: "fict-resident-1" },
    occurredAt: "2026-01-15T15:00:00.000Z",
    recordedAt: "2026-01-15T15:05:00.000Z",
    payload: { visitId: "fict-visit-1" },
    provenance: {
      sourceSystem: "axiscare",
      sourceRecordId: "fict-visit-1",
      provenanceConfidence: "confirmed",
    },
    supersedesFactId: null,
  };
  assert.equal(fact.domain, "scheduling");
  assert.equal(fact.supersedesFactId, null);
});

test("HistoricalFact: a correction points at the fact it supersedes, never edits it", () => {
  const correction: HistoricalFact = {
    id: "fict-fact-2",
    domain: "scheduling",
    factType: "scheduling.visit_completed",
    subject: { subjectType: "resident", subjectId: "fict-resident-1" },
    occurredAt: "2026-01-15T15:00:00.000Z",
    recordedAt: "2026-01-16T09:00:00.000Z",
    payload: { visitId: "fict-visit-1", correctedDurationMinutes: 45 },
    provenance: { sourceSystem: "serve_os", sourceRecordId: null, provenanceConfidence: "confirmed" },
    supersedesFactId: "fict-fact-1",
  };
  assert.equal(correction.supersedesFactId, "fict-fact-1");
});

test("Subject, Signal, Evidence: fictional data satisfies the shapes", () => {
  const subject: Subject = {
    subjectType: "resident",
    subjectId: "fict-resident-1",
    canonicalTable: "residents",
    canonicalId: "fict-resident-1",
    isActive: true,
  };

  const signal: Signal = {
    id: "fict-signal-1",
    domain: "scheduling",
    signalType: "scheduling.visit_started_late",
    subject: { subjectType: subject.subjectType, subjectId: subject.subjectId },
    detectedAt: "2026-01-15T15:10:00.000Z",
    ruleVersionId: "fict-rule-version-1",
    severity: "monitor",
    status: "active",
  };

  const evidence: Evidence = {
    id: "fict-evidence-1",
    signalId: signal.id,
    reference: { kind: "historical_fact", factId: "fict-fact-1" },
    role: "trigger",
  };

  assert.equal(evidence.signalId, signal.id);
  assert.equal(evidence.reference.kind, "historical_fact");
});

test("Evidence may reference a Signal instead of a Fact (Community Intelligence aggregation case)", () => {
  const compositeEvidence: Evidence = {
    id: "fict-evidence-2",
    signalId: "fict-signal-composite",
    reference: { kind: "signal", signalId: "fict-signal-1" },
    role: null,
  };
  assert.equal(compositeEvidence.reference.kind, "signal");
});

test("Rule, RuleVersion, RuleRun: fictional data satisfies the shapes", () => {
  const rule: Rule = {
    id: "fict-rule-1",
    domain: "scheduling",
    slug: "visit_started_late",
    title: "Visit started late",
    description: "Flags a visit whose actual start is later than scheduled beyond a threshold.",
  };

  const ruleVersion: RuleVersion = {
    id: "fict-rule-version-1",
    ruleId: rule.id,
    version: 1,
    triggerType: "event",
    parameters: { lateThresholdMinutes: 15 },
    logicReference: "lib/intelligence/domains/scheduling/rules/visitStartedLate.ts@1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    changelogNote: "Initial version.",
  };

  const ruleRun: RuleRun = {
    id: "fict-rule-run-1",
    ruleVersionId: ruleVersion.id,
    startedAt: "2026-01-15T15:00:00.000Z",
    completedAt: "2026-01-15T15:00:04.000Z",
    status: "success",
    factsEvaluatedCount: 12,
    signalsProducedCount: 1,
    errorMessage: null,
  };

  assert.equal(ruleVersion.ruleId, rule.id);
  assert.equal(ruleRun.ruleVersionId, ruleVersion.id);
});

test("Recommendation, Action, Outcome, Explanation: fictional data satisfies the shapes", () => {
  const recommendation: Recommendation = {
    id: "fict-recommendation-1",
    domain: "scheduling",
    recommendationType: "scheduling.review_late_visit",
    subject: { subjectType: "resident", subjectId: "fict-resident-1" },
    title: "Review late visit start",
    description: "A caregiver started a visit later than scheduled.",
    suggestedPriority: "monitor",
    signalIds: ["fict-signal-1"],
    ruleVersionId: "fict-rule-version-1",
    status: "pending",
    createdAt: "2026-01-15T15:10:00.000Z",
  };

  const action: Action = {
    id: "fict-action-1",
    domain: "scheduling",
    actionType: "scheduling.coverage_check_in",
    subject: recommendation.subject,
    title: "Call caregiver about late start",
    description: null,
    dueAt: "2026-01-16T17:00:00.000Z",
    assignedTo: "fict-staff-1",
    priority: "monitor",
    recommendationId: recommendation.id,
    status: "open",
    createdBy: "fict-staff-1",
    createdAt: "2026-01-15T15:20:00.000Z",
  };

  const outcome: Outcome = {
    id: "fict-outcome-1",
    actionId: action.id,
    outcomeType: "completed",
    recordedAt: "2026-01-16T17:05:00.000Z",
    recordedBy: "fict-staff-1",
    note: "Spoke with caregiver; traffic delay, not a pattern.",
  };

  const explanation: Explanation = {
    id: "fict-explanation-1",
    recommendationId: recommendation.id,
    deterministic: {
      ruleVersionId: "fict-rule-version-1",
      evidenceRefs: [{ evidenceId: "fict-evidence-1" }],
      whatHappened: "A visit started 22 minutes later than scheduled.",
      whyFlagged: "Exceeds the 15-minute late-start threshold.",
    },
    narrative: {
      summary: "This visit started later than usual — worth a quick check-in.",
      recommendedConsideration: "Consider a brief coverage check-in with the caregiver.",
      aiAssisted: false,
    },
    contextSnapshotMetadata: null,
    generatedAt: "2026-01-15T15:10:01.000Z",
  };

  assert.equal(action.recommendationId, recommendation.id);
  assert.equal(outcome.actionId, action.id);
  assert.equal(explanation.recommendationId, recommendation.id);
  // Explanation's deterministic core never carries an AI-assistance flag —
  // only the narrative half does. This assertion documents that boundary.
  assert.ok(!("aiAssisted" in explanation.deterministic));
});

test("a manually-created Action has recommendationId: null, exactly like today's wellness follow-ups' 'manual' source", () => {
  const manualAction: Action = {
    id: "fict-action-2",
    domain: "relationship",
    actionType: "relationship.family_update",
    subject: { subjectType: "resident", subjectId: "fict-resident-2" },
    title: "Call daughter about weekend visit",
    description: null,
    dueAt: null,
    assignedTo: "fict-staff-2",
    priority: "routine",
    recommendationId: null,
    status: "open",
    createdBy: "fict-staff-2",
    createdAt: "2026-01-15T16:00:00.000Z",
  };
  assert.equal(manualAction.recommendationId, null);
});

test("LearningObservation: fictional data satisfies the shape, requires at least one Outcome", () => {
  const observation: LearningObservation = {
    id: "fict-learning-1",
    domain: "compliance",
    observationType: "compliance.policy_gap_identified",
    subject: null,
    outcomeIds: ["fict-outcome-1"],
    summary: "Three Reviewable classifications this quarter cited the same undocumented offense category.",
    reasoning:
      "The offense category appears in raw background-check findings but has no entry in the offense taxonomy, forcing ad hoc executive review each time.",
    confidence: "inferred",
    recommendedImprovement: "Add the offense category to 06-offense-taxonomy.md so future cases classify deterministically.",
    status: "open",
    createdAt: "2026-07-18T09:00:00.000Z",
  };
  assert.equal(observation.outcomeIds.length >= 1, true);
  assert.equal(observation.status, "open");
});

// ─── Runtime exhaustiveness on EvidenceReference's discriminated union ──

function describeEvidenceReference(reference: EvidenceReference): string {
  switch (reference.kind) {
    case "historical_fact":
      return `fact:${reference.factId}`;
    case "reference_knowledge":
      return `reference_knowledge:${reference.referenceKnowledgeId}`;
    case "signal":
      return `signal:${reference.signalId}`;
    default: {
      // Exhaustiveness guard — if a fourth EvidenceReference kind is ever
      // added without updating this switch, this line fails to compile
      // (assigning a non-`never` value to a `never`-typed parameter).
      const exhaustive: never = reference;
      throw new Error(`Unhandled EvidenceReference kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

test("EvidenceReference's three approved kinds all resolve at runtime", () => {
  assert.equal(describeEvidenceReference({ kind: "historical_fact", factId: "f1" }), "fact:f1");
  assert.equal(
    describeEvidenceReference({ kind: "reference_knowledge", referenceKnowledgeId: "rk1" }),
    "reference_knowledge:rk1"
  );
  assert.equal(describeEvidenceReference({ kind: "signal", signalId: "s1" }), "signal:s1");
});

// ─── No raw, unnormalized vendor type ever enters this folder ───────────
// (excluding __tests__ itself, since discussing the boundary in prose here
// is expected and is not a violation of it).

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === "__tests__") return [];
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    if (/\.ts$/.test(entry.name)) return [fullPath];
    return [];
  });
}

// Built via concatenation, not a literal token, so this file itself (which
// legitimately discusses the boundary in prose) can never accidentally
// match its own scan.
const VENDOR_RAW_TYPE_MARKER = ["AxisCare", "Raw"].join("");

test("no non-test file under lib/intelligence/core references a raw vendor type (vendor neutrality, Constitution Article III)", () => {
  const coreDir = path.resolve(import.meta.dirname, "..");
  const files = listFilesRecursive(coreDir);
  assert.ok(files.length > 0, "expected to find at least one non-test file under lib/intelligence/core");

  const offenders = files.filter((file) => fs.readFileSync(file, "utf8").includes(VENDOR_RAW_TYPE_MARKER));
  assert.deepEqual(
    offenders,
    [],
    `lib/intelligence/core must stay vendor-neutral; found a raw vendor type reference in: ${offenders.join(", ")}`
  );
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

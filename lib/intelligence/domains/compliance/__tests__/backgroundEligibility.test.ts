// Background Eligibility, mapped onto the shared Intelligence Kernel
// (lib/intelligence/core) — the Governance Knowledge Engine's Phase 0
// pilot. See docs/architecture/decisions/0001-governance-knowledge-engine-phase-0.md
// for why this domain reuses the kernel rather than a parallel platform,
// and docs/governance/workforce/background-eligibility/ for the governance
// content this fictional data is modeled on.
//
// Like lib/intelligence/core/__tests__/boundaries.test.ts, this is a
// fictional-data construction proof, not a real rule engine: if any value
// below fails to compile, the mapping is wrong — that is the actual test.
// No real applicant data is used or could be; every id is a "fict-" value.
//
// Deliberately does NOT construct an EvidenceReference of kind
// "reference_knowledge" — that kind is reserved for Phase E
// (lib/intelligence/core/signals.ts), gated on Relationship Intelligence's
// own future requirements work, and this pilot does not preempt it. The
// Evidence example here uses "historical_fact" only, exactly like core's
// own boundary test does for its primary example.
//
// Run with:
//
//   npm run test:intelligence
import assert from "node:assert/strict";
import type {
  Rule,
  RuleVersion,
  HistoricalFact,
  Signal,
  Evidence,
  Recommendation,
  Explanation,
  Action,
  Outcome,
  LearningObservation,
} from "../../../core/index.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("Background Eligibility's four-classification algorithm maps onto Rule/RuleVersion", () => {
  const rule: Rule = {
    id: "fict-rule-background-eligibility",
    domain: "compliance",
    slug: "background_eligibility_classification",
    title: "Background Eligibility Classification",
    description:
      "Classifies a completed background investigation into exactly one of Eligible, Reviewable, Presumptive Disqualification, or Automatic Disqualification, per the offense taxonomy.",
  };

  const ruleVersion: RuleVersion = {
    id: "fict-rule-version-background-eligibility-1",
    ruleId: rule.id,
    version: 1,
    triggerType: "event",
    parameters: { offenseTaxonomyVersion: "0.1" },
    logicReference: "lib/intelligence/domains/compliance/rules/backgroundEligibilityClassification.ts@1",
    effectiveFrom: "2026-07-08T00:00:00.000Z",
    effectiveTo: null,
    changelogNote: "Initial version, seeded from Module 1's offense-taxonomy.yml.",
  };

  assert.equal(ruleVersion.ruleId, rule.id);
});

test("a reported background-check finding is a HistoricalFact, not a raw vendor payload", () => {
  const fact: HistoricalFact = {
    id: "fict-fact-background-finding-1",
    domain: "compliance",
    factType: "compliance.background_finding_reported",
    subject: { subjectType: "employee", subjectId: "fict-applicant-1" },
    occurredAt: "2026-07-15T00:00:00.000Z",
    recordedAt: "2026-07-16T10:00:00.000Z",
    payload: { offenseCategory: "theft_related", dispositionYearsAgo: 4 },
    provenance: { sourceSystem: "serve_os", sourceRecordId: "fict-background-check-1", provenanceConfidence: "confirmed" },
    supersedesFactId: null,
  };
  assert.equal(fact.factType, "compliance.background_finding_reported");
  assert.equal(fact.subject.subjectType, "employee");
});

test("classification produces a Signal, with Evidence pointing at the triggering HistoricalFact only", () => {
  const signal: Signal = {
    id: "fict-signal-background-eligibility-1",
    domain: "compliance",
    signalType: "compliance.presumptive_disqualification_identified",
    subject: { subjectType: "employee", subjectId: "fict-applicant-1" },
    detectedAt: "2026-07-16T10:00:01.000Z",
    ruleVersionId: "fict-rule-version-background-eligibility-1",
    severity: "important",
    status: "active",
  };

  const evidence: Evidence = {
    id: "fict-evidence-background-eligibility-1",
    signalId: signal.id,
    reference: { kind: "historical_fact", factId: "fict-fact-background-finding-1" },
    role: "trigger",
  };

  assert.equal(evidence.reference.kind, "historical_fact");
  assert.equal(evidence.signalId, signal.id);
});

test("Presumptive Disqualification routes to a Recommendation for executive review, with a deterministic Explanation", () => {
  const recommendation: Recommendation = {
    id: "fict-recommendation-background-eligibility-1",
    domain: "compliance",
    recommendationType: "compliance.route_to_executive_review",
    subject: { subjectType: "employee", subjectId: "fict-applicant-1" },
    title: "Route to executive review",
    description: "Finding classifies as Presumptive Disqualification; requires documented executive-level review before proceeding.",
    suggestedPriority: "important",
    signalIds: ["fict-signal-background-eligibility-1"],
    ruleVersionId: "fict-rule-version-background-eligibility-1",
    status: "pending",
    createdAt: "2026-07-16T10:00:02.000Z",
  };

  const explanation: Explanation = {
    id: "fict-explanation-background-eligibility-1",
    recommendationId: recommendation.id,
    deterministic: {
      ruleVersionId: "fict-rule-version-background-eligibility-1",
      evidenceRefs: [{ evidenceId: "fict-evidence-background-eligibility-1" }],
      whatHappened: "A theft-related offense, 4 years old, was reported.",
      whyFlagged: "Matches the Presumptive Disqualification tier in the offense taxonomy.",
    },
    narrative: {
      summary: "This finding falls into Presumptive Disqualification — it needs a documented executive review before moving forward.",
      recommendedConsideration: "Route to the designated executive reviewer per 05-review-workflow.md §5.",
      aiAssisted: false,
    },
    contextSnapshotMetadata: null,
    generatedAt: "2026-07-16T10:00:02.000Z",
  };

  assert.equal(explanation.recommendationId, recommendation.id);
  assert.ok(!("aiAssisted" in explanation.deterministic));
});

test("a human Action and its Outcome close the loop — the classification never hires or executes anything itself", () => {
  const action: Action = {
    id: "fict-action-background-eligibility-1",
    domain: "compliance",
    actionType: "compliance.executive_review_completed",
    subject: { subjectType: "employee", subjectId: "fict-applicant-1" },
    title: "Complete executive review for Presumptive Disqualification finding",
    description: null,
    dueAt: "2026-07-20T00:00:00.000Z",
    assignedTo: "fict-executive-1",
    priority: "important",
    recommendationId: "fict-recommendation-background-eligibility-1",
    status: "open",
    createdBy: "fict-hr-staff-1",
    createdAt: "2026-07-16T10:05:00.000Z",
  };

  const outcome: Outcome = {
    id: "fict-outcome-background-eligibility-1",
    actionId: action.id,
    outcomeType: "completed",
    recordedAt: "2026-07-18T09:00:00.000Z",
    recordedBy: "fict-executive-1",
    note: "Reviewed in writing; presumption upheld, applicant not proceeding.",
  };

  assert.equal(outcome.actionId, action.id);
});

test("a pattern across Outcomes becomes a LearningObservation, never a direct edit to the taxonomy", () => {
  const observation: LearningObservation = {
    id: "fict-learning-background-eligibility-1",
    domain: "compliance",
    observationType: "compliance.policy_gap_identified",
    subject: null,
    outcomeIds: ["fict-outcome-background-eligibility-1"],
    summary: "This is the third theft-related Presumptive Disqualification this quarter routed to executive review with an identical fact pattern.",
    reasoning:
      "Repeated identical outcomes on the same offense/age combination suggest the offense taxonomy could resolve this case deterministically as Automatic Disqualification, reducing unnecessary executive review load without changing the underlying standard.",
    confidence: "inferred",
    recommendedImprovement: "Review whether 06-offense-taxonomy.md's threshold for this offense category should move from Presumptive to Automatic Disqualification.",
    status: "open",
    createdAt: "2026-07-18T09:05:00.000Z",
  };

  assert.equal(observation.outcomeIds.length, 1);
  assert.equal(observation.status, "open");
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

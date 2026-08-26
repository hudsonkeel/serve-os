// Pure-function tests for QAPI v0.1's EPRP-review-item mapping. The live
// read (getEmergencyPreparednessImprovementWork) is I/O and is verified
// live instead, matching this codebase's convention that data/orchestration
// layers are live-verified, not unit-mocked (see
// lib/compliance/__tests__/auditReadinessDashboard.test.ts's own header for
// the same discipline).
//
//   node --experimental-strip-types --conditions=react-server lib/qapi/__tests__/dashboard.test.ts
import assert from "node:assert/strict";
import {
  buildQapiImprovementBuckets,
  qualityContextSummary,
  qualityPriorityLine,
  toQapiImprovementWorkItem,
  QAPI_DOMAIN_ID_FOR_BUCKET,
  type QapiImprovementWorkItem,
} from "../dashboard.ts";
import type { ComposedCorrectiveAction } from "../../compliance/correctiveActionComposition.ts";
import { AUDIT_READINESS_STATUSES, type DomainReadinessRollup } from "../../compliance/auditReadinessDashboard.ts";
import type { AuditReadinessStatus } from "../../compliance/auditReadinessStatus.ts";
import type { EmergencyPreparednessReviewItem } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function reviewItem(overrides: Partial<EmergencyPreparednessReviewItem> = {}): EmergencyPreparednessReviewItem {
  return {
    id: "item-1",
    review_id: "review-1",
    item_kind: "improvement",
    requirement_id: null,
    outcome: null,
    resulting_evidence_id: null,
    description: null,
    notes: null,
    created_by: "Test Reviewer",
    created_at: "2026-08-20T00:00:00Z",
    ...overrides,
  };
}

test("an improvement item uses its description as the title, falling back when blank", () => {
  const withDescription = toQapiImprovementWorkItem(reviewItem({ description: "Communication tree phone numbers are stale" }), null);
  assert.equal(withDescription.kind, "improvement");
  assert.equal(withDescription.title, "Communication tree phone numbers are stale");

  const blank = toQapiImprovementWorkItem(reviewItem({ description: "   " }), null);
  assert.equal(blank.title, "Improvement suggestion");

  const missing = toQapiImprovementWorkItem(reviewItem({ description: null }), null);
  assert.equal(missing.title, "Improvement suggestion");
});

test("a requirement_finding item uses the resolved requirement name in its title", () => {
  const item = toQapiImprovementWorkItem(
    reviewItem({ item_kind: "requirement_finding", requirement_id: "req-1", outcome: "evidence_needed" }),
    "Annual Risk Assessment"
  );
  assert.equal(item.kind, "finding_follow_up");
  assert.equal(item.title, "Follow-up needed: Annual Risk Assessment");
});

test("a requirement_finding item with no resolvable requirement name still produces an honest, non-blank title", () => {
  const item = toQapiImprovementWorkItem(reviewItem({ item_kind: "requirement_finding", requirement_id: "req-1" }), null);
  assert.equal(item.title, "Follow-up needed");
});

test("notes carry through as the detail field for both item kinds", () => {
  const improvement = toQapiImprovementWorkItem(reviewItem({ notes: "Raised by the disaster coordinator" }), null);
  assert.equal(improvement.detail, "Raised by the disaster coordinator");

  const finding = toQapiImprovementWorkItem(reviewItem({ item_kind: "requirement_finding", notes: "Missing signed copy" }), "Plan Maintained");
  assert.equal(finding.detail, "Missing signed copy");
});

test("id, createdBy, and createdAt pass through unchanged", () => {
  const item = toQapiImprovementWorkItem(reviewItem({ id: "item-42", created_by: "Jane Reviewer", created_at: "2026-08-21T12:00:00Z" }), null);
  assert.equal(item.id, "item-42");
  assert.equal(item.createdBy, "Jane Reviewer");
  assert.equal(item.createdAt, "2026-08-21T12:00:00Z");
});

function correctiveAction(overrides: Partial<ComposedCorrectiveAction> = {}): ComposedCorrectiveAction {
  return {
    id: "action-1",
    source: "workforce",
    subjectType: "workforce_member",
    subjectId: "member-1",
    requirementId: "req-1",
    domain: "workforce",
    actionType: "evidence_missing",
    title: "Upload Form I-9",
    reason: "Form I-9 is missing.",
    owner: null,
    priority: "urgent",
    dueAt: null,
    status: "open",
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function reviewWorkItem(overrides: Partial<QapiImprovementWorkItem> = {}): QapiImprovementWorkItem {
  return {
    id: "note-1",
    kind: "improvement",
    title: "Communication tree phone numbers are stale",
    detail: null,
    createdBy: "Test Reviewer",
    createdAt: "2026-08-15T00:00:00Z",
    ...overrides,
  };
}

test("buildQapiImprovementBuckets sorts corrective actions into Client Care / Workforce / Emergency Preparedness by subjectType", () => {
  const buckets = buildQapiImprovementBuckets(
    [
      correctiveAction({ id: "wf-1", subjectType: "workforce_member" }),
      correctiveAction({ id: "cr-1", subjectType: "resident" }),
      correctiveAction({ id: "ep-1", subjectType: "agency" }),
    ],
    []
  );
  assert.deepEqual(
    buckets.map((b) => b.id),
    ["client_care", "workforce", "emergency_preparedness"]
  );
  assert.deepEqual(buckets.find((b) => b.id === "client_care")?.correctiveActions.map((a) => a.id), ["cr-1"]);
  assert.deepEqual(buckets.find((b) => b.id === "workforce")?.correctiveActions.map((a) => a.id), ["wf-1"]);
  assert.deepEqual(buckets.find((b) => b.id === "emergency_preparedness")?.correctiveActions.map((a) => a.id), ["ep-1"]);
});

test("buildQapiImprovementBuckets buckets a 'community' subjectType action into Emergency Preparedness alongside 'agency' (documented provisional rule)", () => {
  const buckets = buildQapiImprovementBuckets([correctiveAction({ id: "community-1", subjectType: "community" })], []);
  assert.deepEqual(buckets.find((b) => b.id === "emergency_preparedness")?.correctiveActions.map((a) => a.id), ["community-1"]);
});

test("buildQapiImprovementBuckets only folds review notes into the Emergency Preparedness bucket, never Client Care or Workforce", () => {
  const buckets = buildQapiImprovementBuckets([], [reviewWorkItem()]);
  assert.equal(buckets.find((b) => b.id === "emergency_preparedness")?.reviewNotes.length, 1);
  assert.equal(buckets.find((b) => b.id === "client_care")?.reviewNotes.length, 0);
  assert.equal(buckets.find((b) => b.id === "workforce")?.reviewNotes.length, 0);
});

test("buildQapiImprovementBuckets: itemCount is corrective actions plus review notes combined", () => {
  const buckets = buildQapiImprovementBuckets(
    [correctiveAction({ id: "ep-1", subjectType: "agency" }), correctiveAction({ id: "ep-2", subjectType: "agency" })],
    [reviewWorkItem()]
  );
  assert.equal(buckets.find((b) => b.id === "emergency_preparedness")?.itemCount, 3);
});

test("buildQapiImprovementBuckets: an empty bucket reports zero items and an honest 'No active items' summary", () => {
  const buckets = buildQapiImprovementBuckets([], []);
  for (const bucket of buckets) {
    assert.equal(bucket.itemCount, 0);
    assert.equal(bucket.summary, "No active items");
  }
});

test("buildQapiImprovementBuckets: summary tallies action types by human label, most frequent first", () => {
  const buckets = buildQapiImprovementBuckets(
    [
      correctiveAction({ id: "wf-1", subjectType: "workforce_member", actionType: "evidence_missing" }),
      correctiveAction({ id: "wf-2", subjectType: "workforce_member", actionType: "evidence_missing" }),
      correctiveAction({ id: "wf-3", subjectType: "workforce_member", actionType: "evidence_expired" }),
    ],
    []
  );
  assert.equal(buckets.find((b) => b.id === "workforce")?.summary, "2 Evidence Missing · 1 Evidence Expired");
});

test("buildQapiImprovementBuckets: an unrecognized action_type still produces an honest (raw) label rather than dropping the item", () => {
  const buckets = buildQapiImprovementBuckets([correctiveAction({ subjectType: "resident", actionType: "some_future_type" })], []);
  assert.equal(buckets.find((b) => b.id === "client_care")?.summary, "1 some_future_type");
});

test("QAPI_DOMAIN_ID_FOR_BUCKET maps every bucket id to a real QAPI domain id, including the client_care -> client_readiness vocabulary bridge", () => {
  assert.equal(QAPI_DOMAIN_ID_FOR_BUCKET.client_care, "client_readiness");
  assert.equal(QAPI_DOMAIN_ID_FOR_BUCKET.workforce, "workforce");
  assert.equal(QAPI_DOMAIN_ID_FOR_BUCKET.emergency_preparedness, "emergency_preparedness");
});

function emptyStatusCounts(): Record<AuditReadinessStatus, number> {
  const counts = {} as Record<AuditReadinessStatus, number>;
  for (const status of AUDIT_READINESS_STATUSES) counts[status] = 0;
  return counts;
}

function domainRollup(overrides: Partial<DomainReadinessRollup> = {}): DomainReadinessRollup {
  return {
    domainId: "workforce",
    label: "Workforce",
    configured: true,
    awaitingFirstSubject: false,
    requirementCount: 0,
    subjectCount: 0,
    readySubjectCount: 0,
    statusCounts: emptyStatusCounts(),
    issues: [],
    ...overrides,
  };
}

test("qualityContextSummary: not configured reads as Coming Soon", () => {
  assert.equal(qualityContextSummary(domainRollup({ configured: false })), "Coming Soon");
});

test("qualityContextSummary: awaiting first subject reuses awaitingFirstSubjectMessage verbatim", () => {
  const summary = qualityContextSummary(domainRollup({ label: "Client Readiness", awaitingFirstSubject: true }));
  assert.match(summary, /^Client Readiness is configured/);
});

test("qualityContextSummary: multi-subject domains report a ready/total count, never a percentage", () => {
  assert.equal(qualityContextSummary(domainRollup({ subjectCount: 5, readySubjectCount: 3 })), "3 of 5 ready");
});

test("qualityContextSummary: single-subject (agency-level) domains report a binary Ready/Needs Attention", () => {
  assert.equal(qualityContextSummary(domainRollup({ domainId: "emergency_preparedness", subjectCount: 1, readySubjectCount: 1 })), "Ready");
  assert.equal(qualityContextSummary(domainRollup({ domainId: "emergency_preparedness", subjectCount: 1, readySubjectCount: 0 })), "Needs Attention");
});

test("qualityPriorityLine: zero issues reuses allClearMessage verbatim, so QAPI and Audit Readiness can never disagree", () => {
  const line = qualityPriorityLine(domainRollup({ domainId: "workforce", subjectCount: 4, issues: [] }));
  assert.match(line, /All 4 employees are audit-ready/);
});

test("qualityPriorityLine: reports a plain issue count, correctly pluralized, never per-subject detail", () => {
  const oneIssue = domainRollup({
    issues: [
      {
        domain: "workforce",
        subjectType: "workforce_member",
        subjectId: "m1",
        subjectLabel: "A",
        subjectHref: "/workforce/m1",
        requirementCode: "R1",
        requirementName: "Req",
        regulatoryAuthority: null,
        status: "overdue",
        explanation: "x",
        latestEvidence: null,
      },
    ],
  });
  assert.equal(qualityPriorityLine(oneIssue), "1 item needs attention.");

  const twoIssues = domainRollup({ issues: [...oneIssue.issues, oneIssue.issues[0]] });
  assert.equal(qualityPriorityLine(twoIssues), "2 items need attention.");
});

test("qualityPriorityLine: not configured / awaiting first subject produce their own honest lines", () => {
  assert.equal(qualityPriorityLine(domainRollup({ configured: false })), "Not yet configured.");
  assert.equal(qualityPriorityLine(domainRollup({ awaitingFirstSubject: true })), "No eligible subjects yet.");
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);

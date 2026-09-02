// Pure-function tests for ../mapping.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import {
  ASSESSMENT_PROPOSAL_STALE_DAYS,
  RECRUITING_LEAD_STALE_DAYS,
  mapCompletedIncidentToWorkItem,
  mapCompletedInfectionToWorkItem,
  mapCompletedRelationshipActionToWorkItem,
  mapCompletedWellnessFollowUpToWorkItem,
  mapCorrectiveActionToWorkItem,
  mapEmergencyPreparednessObligationToWorkItem,
  mapIncidentToWorkItem,
  mapInfectionToWorkItem,
  mapOnHoldRelationshipToWorkItem,
  mapPipelineStageToWorkItem,
  mapRecruitingLeadToWorkItem,
  mapRelationshipActionToWorkItem,
  mapWellnessFollowUpToWorkItem,
} from "../mapping.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const NOW = new Date("2026-07-26T18:00:00.000Z"); // a Sunday, Central afternoon

test("1. wellness follow-up: overdue due_at -> needs_attention, explicit evidence, non-empty explanation", () => {
  const item = mapWellnessFollowUpToWorkItem(
    { id: "f1", residentId: "r1", residentDisplayName: "Ada Washington", title: "Family check-in", status: "open", dueAt: "2026-07-20T00:00:00.000Z", assignedTo: null, priority: "important" },
    NOW,
  );
  assert.equal(item.status, "needs_attention");
  assert.equal(item.evidenceType, "explicit");
  assert.ok(item.explanation.length > 0);
  assert.equal(item.sourceRoute, "/residents/r1#wellness-follow-up-f1");
});

test("2. wellness follow-up: due today -> due_today", () => {
  const item = mapWellnessFollowUpToWorkItem(
    { id: "f2", residentId: "r1", residentDisplayName: "Ada Washington", title: "Check-in", status: "open", dueAt: "2026-07-26T10:00:00.000Z", assignedTo: null, priority: "routine" },
    NOW,
  );
  assert.equal(item.status, "due_today");
});

test("3. wellness follow-up: in_progress with no due date -> in_progress (Resume Work)", () => {
  const item = mapWellnessFollowUpToWorkItem(
    { id: "f3", residentId: "r1", residentDisplayName: "Ada Washington", title: "Assessment update", status: "in_progress", dueAt: null, assignedTo: "jane@example.com", priority: "monitor" },
    NOW,
  );
  assert.equal(item.status, "in_progress");
  assert.equal(item.ownerId, "jane@example.com");
});

test("4. wellness follow-up: future due date, open -> upcoming", () => {
  const item = mapWellnessFollowUpToWorkItem(
    { id: "f4", residentId: "r1", residentDisplayName: "Ada Washington", title: "Follow up", status: "open", dueAt: "2026-08-15T00:00:00.000Z", assignedTo: null, priority: "routine" },
    NOW,
  );
  assert.equal(item.status, "upcoming");
});

test("5. completed wellness follow-up mapper -> completed status, explanation names completion", () => {
  const item = mapCompletedWellnessFollowUpToWorkItem({ id: "f5", residentId: "r1", residentDisplayName: "Ada Washington", title: "Check-in", completedAt: "2026-07-24T00:00:00.000Z", completedBy: "jane@example.com" });
  assert.equal(item.status, "completed");
  assert.ok(item.explanation.includes("Completed"));
});

test("6. relationship action: overdue -> needs_attention", () => {
  const item = mapRelationshipActionToWorkItem(
    { id: "a1", relationshipId: "rel1", relationshipDisplayName: "Smith Family", title: "Send proposal", dueAt: "2026-07-24T00:00:00.000Z", assignedTo: "brian@example.com", priority: "high" },
    NOW,
  );
  assert.equal(item.status, "needs_attention");
  assert.equal(item.priority, "high");
  assert.equal(item.sourceRoute, "/relationships/rel1#relationship-action-a1");
});

test("7. relationship action: due later -> upcoming", () => {
  const item = mapRelationshipActionToWorkItem(
    { id: "a2", relationshipId: "rel1", relationshipDisplayName: "Smith Family", title: "Call", dueAt: "2026-08-01T00:00:00.000Z", assignedTo: null, priority: "normal" },
    NOW,
  );
  assert.equal(item.status, "upcoming");
});

test("8. completed relationship action mapper includes outcome in explanation when present", () => {
  const item = mapCompletedRelationshipActionToWorkItem({ id: "a3", relationshipId: "rel1", relationshipDisplayName: "Smith Family", title: "Call", completedAt: "2026-07-25T00:00:00.000Z", completedBy: "brian@example.com", completionOutcome: "Connected" });
  assert.ok(item.explanation.includes("Connected"));
});

test("9. Continuity Rule (assessment/proposal): fresh contact -> no item at all", () => {
  const item = mapPipelineStageToWorkItem(
    { relationshipId: "rel2", displayName: "Jones Family", ownerLabel: null, lastMeaningfulTouchAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z", kind: "assessment" },
    NOW,
  );
  assert.equal(item, null);
});

test("10. Continuity Rule (assessment/proposal): stale contact past the threshold -> item produced, evidenceType deterministic, explanation names elapsed days", () => {
  const staleDate = new Date(NOW.getTime() - (ASSESSMENT_PROPOSAL_STALE_DAYS + 2) * 24 * 60 * 60 * 1000).toISOString();
  const item = mapPipelineStageToWorkItem(
    { relationshipId: "rel3", displayName: "Nguyen Family", ownerLabel: "Pat", lastMeaningfulTouchAt: staleDate, updatedAt: staleDate, kind: "proposal" },
    NOW,
  );
  assert.ok(item);
  assert.equal(item?.status, "needs_attention");
  assert.equal(item?.evidenceType, "deterministic");
  assert.ok(item?.explanation.includes(`${ASSESSMENT_PROPOSAL_STALE_DAYS + 2} days`));
});

test("11. Continuity Rule (assessment/proposal): falls back to updatedAt when lastMeaningfulTouchAt is null", () => {
  const staleDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const item = mapPipelineStageToWorkItem(
    { relationshipId: "rel4", displayName: "Lee Family", ownerLabel: null, lastMeaningfulTouchAt: null, updatedAt: staleDate, kind: "assessment" },
    NOW,
  );
  assert.ok(item);
});

test("12. Continuity Rule (recruiting): fresh lead -> no item", () => {
  const item = mapRecruitingLeadToWorkItem({ id: "lead1", firstName: "Sam", lastName: "Rivera", status: "new", createdAt: NOW.toISOString() }, NOW);
  assert.equal(item, null);
});

test("13. Continuity Rule (recruiting): stale 'new' lead past threshold -> item produced", () => {
  const staleDate = new Date(NOW.getTime() - (RECRUITING_LEAD_STALE_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  const item = mapRecruitingLeadToWorkItem({ id: "lead2", firstName: "Sam", lastName: "Rivera", status: "new", createdAt: staleDate }, NOW);
  assert.ok(item);
  assert.equal(item?.evidenceType, "deterministic");
  assert.equal(item?.sourceRoute, "/recruiting/lead2");
});

test("14. Continuity Rule (recruiting): a lead not in new/in_review never produces an item, regardless of age", () => {
  const veryStale = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(mapRecruitingLeadToWorkItem({ id: "lead3", firstName: "A", lastName: "B", status: "hired", createdAt: veryStale }, NOW), null);
  assert.equal(mapRecruitingLeadToWorkItem({ id: "lead4", firstName: "A", lastName: "B", status: "archived", createdAt: veryStale }, NOW), null);
});

test("15. on-hold relationship -> waiting status, explicit evidence", () => {
  const item = mapOnHoldRelationshipToWorkItem({ relationshipId: "rel5", displayName: "Garcia Family", ownerLabel: "Pat" });
  assert.equal(item.status, "waiting");
  assert.equal(item.evidenceType, "explicit");
});

// Test 16 (Today's Work Actionability slice, Acceptance A) — a bare
// "active Prospect with no open action" no longer has a mapper at all;
// mapNoNextActionToWorkItem was removed entirely, and no replacement
// staleness threshold was invented (see product decision #1). This is
// verified structurally by the import above no longer exporting it — if
// it ever reappears, this file fails to typecheck/compile before any test
// even runs.

test("17. every mapper always produces a non-empty explanation", () => {
  const items = [
    mapWellnessFollowUpToWorkItem({ id: "x1", residentId: "r", residentDisplayName: "R", title: "T", status: "open", dueAt: null, assignedTo: null, priority: "routine" }, NOW),
    mapRelationshipActionToWorkItem({ id: "x2", relationshipId: "r", relationshipDisplayName: "R", title: "T", dueAt: null, assignedTo: null, priority: "normal" }, NOW),
    mapOnHoldRelationshipToWorkItem({ relationshipId: "r", displayName: "R", ownerLabel: null }),
  ];
  for (const item of items) assert.ok(item.explanation.trim().length > 0);
});

// ─── Governance Connective Slice v0.1 — Incidents / Infections / EPRP ──

test("18. unreviewed incident -> needs_attention, no dueAt fabricated", () => {
  const item = mapIncidentToWorkItem({
    id: "i1",
    typeLabel: "Fall",
    reviewStatus: "not_reviewed",
    followUpRequired: false,
    owner: null,
    occurredAtLabel: "Aug 20, 2026",
    residentId: "r1",
    residentDisplayName: "Ada Washington",
  });
  assert.equal(item.status, "needs_attention");
  assert.equal(item.dueAt, undefined);
  assert.equal(item.sourceRoute, "/qapi/incidents/i1");
  assert.ok(item.explanation.includes("not been reviewed"));
});

test("19. reviewed incident with follow-up -> in_progress, owner surfaced", () => {
  const item = mapIncidentToWorkItem({
    id: "i2",
    typeLabel: "Fall",
    reviewStatus: "reviewed",
    followUpRequired: true,
    owner: "Jordan Lee",
    occurredAtLabel: "Aug 20, 2026",
    residentId: "r1",
    residentDisplayName: "Ada Washington",
  });
  assert.equal(item.status, "in_progress");
  assert.equal(item.ownerLabel, "Jordan Lee");
  assert.ok(item.explanation.includes("Jordan Lee"));
});

test("20. incident with no resident (staff-only/property incident) -> no subjectType fabricated", () => {
  const item = mapIncidentToWorkItem({
    id: "i3",
    typeLabel: "Property Concern",
    reviewStatus: "not_reviewed",
    followUpRequired: false,
    owner: null,
    occurredAtLabel: "Aug 20, 2026",
    residentId: null,
    residentDisplayName: null,
  });
  assert.equal(item.subjectType, undefined);
  assert.equal(item.subjectId, undefined);
});

test("21. completed incident mapper -> completed status, resolvedBy in explanation", () => {
  const item = mapCompletedIncidentToWorkItem({ id: "i4", typeLabel: "Fall", resolvedAt: "2026-08-25T00:00:00.000Z", resolvedBy: "Jordan Lee" });
  assert.equal(item.status, "completed");
  assert.equal(item.completedAt, "2026-08-25T00:00:00.000Z");
  assert.ok(item.explanation.includes("Jordan Lee"));
});

test("22. unreviewed infection -> needs_attention, resident-linked", () => {
  const item = mapInfectionToWorkItem({
    id: "inf1",
    reviewStatus: "not_reviewed",
    followUpRequired: false,
    owner: null,
    disclosedAtLabel: "2026-08-24",
    residentId: "r1",
    residentDisplayName: "Linda Kaplan",
  });
  assert.equal(item.status, "needs_attention");
  assert.equal(item.subjectType, "resident");
  assert.equal(item.subjectId, "r1");
  assert.equal(item.sourceRoute, "/qapi/infections/inf1");
});

test("23. reviewed infection with follow-up -> in_progress", () => {
  const item = mapInfectionToWorkItem({
    id: "inf2",
    reviewStatus: "reviewed",
    followUpRequired: true,
    owner: "Jordan Lee",
    disclosedAtLabel: "2026-08-24",
    residentId: "r1",
    residentDisplayName: "Linda Kaplan",
  });
  assert.equal(item.status, "in_progress");
});

test("24. completed infection mapper -> completed status", () => {
  const item = mapCompletedInfectionToWorkItem({ id: "inf3", residentDisplayName: "Linda Kaplan", resolvedAt: "2026-08-26T00:00:00.000Z", resolvedBy: "Jordan Lee" });
  assert.equal(item.status, "completed");
  assert.equal(item.title, "Infection — Linda Kaplan");
});

test("25. EPRP due_soon requirement -> upcoming, dueAt from evidence expiration, no due-date math recomputed, deep-links to the exact requirement", () => {
  const item = mapEmergencyPreparednessObligationToWorkItem({
    requirementId: "req1",
    requirementCode: "EP_PLAN_MAINTAINED",
    requirementName: "Annual Plan Review",
    status: "due_soon",
    explanation: "Expires in 12 days.",
    expirationDate: "2026-09-10",
  });
  assert.equal(item.status, "upcoming");
  assert.equal(item.dueAt, "2026-09-10");
  assert.equal(item.evidenceType, "deterministic");
  assert.equal(item.explanation, "Expires in 12 days.");
  assert.equal(item.sourceRoute, "/audit-readiness/emergency-preparedness?requirement=EP_PLAN_MAINTAINED");
});

test("26. EPRP overdue requirement -> needs_attention", () => {
  const item = mapEmergencyPreparednessObligationToWorkItem({
    requirementId: "req2",
    requirementCode: "EP_ANNUAL_RESPONSE_DRILL",
    requirementName: "Annual Response Drill",
    status: "overdue",
    explanation: "Expired 5 days ago.",
    expirationDate: "2026-08-15",
  });
  assert.equal(item.status, "needs_attention");
});

test("27. EPRP missing_evidence requirement -> needs_attention, no fabricated dueAt", () => {
  const item = mapEmergencyPreparednessObligationToWorkItem({
    requirementId: "req3",
    requirementCode: "EP_RISK_ASSESSMENT_CURRENT",
    requirementName: "Risk Assessment Current",
    status: "missing_evidence",
    explanation: "No evidence on file.",
    expirationDate: null,
  });
  assert.equal(item.status, "needs_attention");
  assert.equal(item.dueAt, undefined);
});

test("28. every new mapper always produces a non-empty explanation", () => {
  const items = [
    mapIncidentToWorkItem({ id: "x", typeLabel: "Fall", reviewStatus: "not_reviewed", followUpRequired: false, owner: null, occurredAtLabel: "today", residentId: null, residentDisplayName: null }),
    mapInfectionToWorkItem({ id: "x", reviewStatus: "reviewed", followUpRequired: true, owner: null, disclosedAtLabel: "today", residentId: "r", residentDisplayName: "R" }),
    mapEmergencyPreparednessObligationToWorkItem({ requirementId: "x", requirementCode: "X", requirementName: "R", status: "overdue", explanation: "Overdue.", expirationDate: null }),
  ];
  for (const item of items) assert.ok(item.explanation.trim().length > 0);
});

// ─── Corrective Actions (Today's Work Actionability slice) ─────────────

test("29. corrective action overdue -> needs_attention, priority/dueAt pass through unfabricated", () => {
  const item = mapCorrectiveActionToWorkItem(
    {
      id: "ca1",
      title: "Follow up on fall risk",
      reason: "Incident follow-up required.",
      status: "open",
      priority: "high",
      dueAt: "2026-07-20T00:00:00.000Z",
      owner: "Jordan Lee",
      subjectType: "resident",
      subjectId: "r1",
      subjectLabel: "Ada Washington",
      sourceIncidentId: "inc1",
      sourceInfectionId: null,
      sourceReviewItemId: null,
      requirementCode: null,
    },
    NOW,
  );
  assert.equal(item.sourceType, "corrective_action");
  assert.equal(item.status, "needs_attention");
  assert.equal(item.priority, "high");
  assert.equal(item.dueAt, "2026-07-20T00:00:00.000Z");
  assert.equal(item.ownerLabel, "Jordan Lee");
  assert.ok(item.explanation.includes("Incident"));
});

test("30. corrective action with no due date -> upcoming, no fabricated due date", () => {
  const item = mapCorrectiveActionToWorkItem(
    {
      id: "ca2",
      title: "Follow up on infection review",
      reason: "Infection follow-up required.",
      status: "open",
      priority: "normal",
      dueAt: null,
      owner: null,
      subjectType: "resident",
      subjectId: "r2",
      subjectLabel: "Linda Kaplan",
      sourceIncidentId: null,
      sourceInfectionId: "inf1",
      sourceReviewItemId: null,
      requirementCode: null,
    },
    NOW,
  );
  assert.equal(item.status, "upcoming");
  assert.equal(item.dueAt, undefined);
  assert.ok(item.explanation.includes("Infection"));
});

test("31. corrective action source routing: Incident-sourced routes to the exact incident record", () => {
  const item = mapCorrectiveActionToWorkItem({
    id: "ca3", title: "T", reason: "R", status: "open", priority: "normal", dueAt: null, owner: null,
    subjectType: "resident", subjectId: "r1", subjectLabel: null,
    sourceIncidentId: "inc42", sourceInfectionId: null, sourceReviewItemId: null, requirementCode: null,
  }, NOW);
  assert.equal(item.sourceRoute, "/qapi/incidents/inc42");
});

test("32. corrective action source routing: Infection-sourced routes to the exact infection record", () => {
  const item = mapCorrectiveActionToWorkItem({
    id: "ca4", title: "T", reason: "R", status: "open", priority: "normal", dueAt: null, owner: null,
    subjectType: "resident", subjectId: "r1", subjectLabel: null,
    sourceIncidentId: null, sourceInfectionId: "inf42", sourceReviewItemId: null, requirementCode: null,
  }, NOW);
  assert.equal(item.sourceRoute, "/qapi/infections/inf42");
});

test("33. corrective action source routing: EPRP-review-item-sourced (agency subject) routes to the requirement deep link", () => {
  const item = mapCorrectiveActionToWorkItem({
    id: "ca5", title: "T", reason: "R", status: "open", priority: "normal", dueAt: null, owner: null,
    subjectType: "agency", subjectId: "agency1", subjectLabel: null,
    sourceIncidentId: null, sourceInfectionId: null, sourceReviewItemId: "review1", requirementCode: "EP_PLAN_MAINTAINED",
  }, NOW);
  assert.equal(item.sourceRoute, "/audit-readiness/emergency-preparedness?requirement=EP_PLAN_MAINTAINED");
});

test("34. corrective action source routing: resident-subject requirement-linked (no incident/infection/review-item) routes to the resident's own page", () => {
  const item = mapCorrectiveActionToWorkItem({
    id: "ca6", title: "T", reason: "R", status: "open", priority: "normal", dueAt: null, owner: null,
    subjectType: "resident", subjectId: "r9", subjectLabel: null,
    sourceIncidentId: null, sourceInfectionId: null, sourceReviewItemId: null, requirementCode: "CR_ASSESSMENT_CURRENT",
  }, NOW);
  assert.equal(item.sourceRoute, "/residents/r9?requirement=CR_ASSESSMENT_CURRENT");
});

test("35. corrective action source routing: no source and no requirement falls back to the Audit Readiness domain page, never a broken link", () => {
  const item = mapCorrectiveActionToWorkItem({
    id: "ca7", title: "T", reason: "R", status: "open", priority: "low", dueAt: null, owner: null,
    subjectType: "community", subjectId: "community1", subjectLabel: null,
    sourceIncidentId: null, sourceInfectionId: null, sourceReviewItemId: null, requirementCode: null,
  }, NOW);
  assert.equal(item.sourceRoute, "/audit-readiness");
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

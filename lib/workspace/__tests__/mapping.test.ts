// Pure-function tests for ../mapping.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import {
  ASSESSMENT_PROPOSAL_STALE_DAYS,
  RECRUITING_LEAD_STALE_DAYS,
  mapCompletedRelationshipActionToWorkItem,
  mapCompletedWellnessFollowUpToWorkItem,
  mapNoNextActionToWorkItem,
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
  assert.equal(item.sourceRoute, "/residents/r1");
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
  assert.equal(item.sourceRoute, "/relationships/rel1");
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

test("16. no-next-action relationship -> needs_attention, deterministic, carries a recommendedNextStep", () => {
  const item = mapNoNextActionToWorkItem({ relationshipId: "rel6", displayName: "Patel Family", ownerLabel: null });
  assert.equal(item.status, "needs_attention");
  assert.equal(item.evidenceType, "deterministic");
  assert.ok(item.recommendedNextStep && item.recommendedNextStep.length > 0);
});

test("17. every mapper always produces a non-empty explanation", () => {
  const items = [
    mapWellnessFollowUpToWorkItem({ id: "x1", residentId: "r", residentDisplayName: "R", title: "T", status: "open", dueAt: null, assignedTo: null, priority: "routine" }, NOW),
    mapRelationshipActionToWorkItem({ id: "x2", relationshipId: "r", relationshipDisplayName: "R", title: "T", dueAt: null, assignedTo: null, priority: "normal" }, NOW),
    mapOnHoldRelationshipToWorkItem({ relationshipId: "r", displayName: "R", ownerLabel: null }),
    mapNoNextActionToWorkItem({ relationshipId: "r", displayName: "R", ownerLabel: null }),
  ];
  for (const item of items) assert.ok(item.explanation.trim().length > 0);
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

// Pure-function tests for ../composeTodaysWork.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import {
  composeTodaysWorkItems,
  filterCorrectiveActionsForViewer,
  isClientReadinessVerificationAction,
  type ComposeTodaysWorkInput,
} from "../composeTodaysWork.ts";
import type { RelationshipWorkspaceRow } from "../../relationships/search.ts";
import type { IncidentWithResidentName } from "../../data/incidents.ts";
import { canVerifyResidentEvidence } from "../../auth/permissions.ts";
import type { AuthRole } from "../../auth/constants.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const NOW = new Date("2026-07-26T18:00:00.000Z");

function prospectRow(overrides: Partial<RelationshipWorkspaceRow> = {}): RelationshipWorkspaceRow {
  return {
    id: "rel1",
    displayName: "Jane Doe — Prospect",
    relationshipType: "resident_prospect",
    stage: "new_inquiry",
    status: "active",
    residentId: null,
    residentName: null,
    ownerLabel: null,
    priority: "normal",
    prospectiveResidentName: null,
    prospectiveClientName: null,
    primaryContactName: null,
    primaryContactPhone: null,
    primaryContactEmail: null,
    organizationName: null,
    communityName: null,
    lastMeaningfulTouchAt: null,
    updatedAt: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

const EMPTY_INPUT: ComposeTodaysWorkInput = {
  openFollowUps: [],
  completedFollowUps: [],
  workspaceRows: [],
  nearestActions: new Map(),
  completedActions: [],
  recruitingLeads: [],
  actionableIncidents: [],
  recentlyResolvedIncidents: [],
  actionableInfections: [],
  recentlyResolvedInfections: [],
  eprpEvaluation: null,
  openCorrectiveActions: [],
  pendingEffectivenessReviews: [],
  outstandingInfectionFollowUps: [],
};

// ─── Acceptance A — passive Prospect removal ────────────────────────────

test("A1. active Prospect with no open action and no other actionable condition produces NO WorkItem", () => {
  const items = composeTodaysWorkItems({ ...EMPTY_INPUT, workspaceRows: [prospectRow()] }, NOW);
  assert.equal(items.length, 0, "a bare Prospect with nothing due is CRM state, not Today's Work");
});

test("A2. the same Prospect with a real open relationship_action produces exactly one relationship_action WorkItem", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      workspaceRows: [prospectRow()],
      nearestActions: new Map([
        ["rel1", { id: "act1", title: "Call Jane", description: null, actionType: "call", dueAt: "2026-07-20T00:00:00.000Z", assignedTo: null, priority: "normal", createdAt: "2026-07-01T00:00:00.000Z" }],
      ]),
    },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceType, "relationship_action");
  assert.equal(items[0].status, "needs_attention");
});

test("A3. an on-hold relationship still produces its Waiting On item — decision #1 only removes bare no-next-action Prospects, not on-hold", () => {
  const items = composeTodaysWorkItems(
    { ...EMPTY_INPUT, workspaceRows: [prospectRow({ status: "on_hold" })] },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "waiting");
});

// ─── Acceptance G — corrective Action independent lifecycle ─────────────

test("G1. an Incident's open corrective Action is composed as its own WorkItem, independent of the Incident's own composition", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      openCorrectiveActions: [
        {
          id: "ca1",
          title: "Follow up on fall risk",
          reason: "Incident follow-up required.",
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
          lifecycleStage: "open" as const,
        },
      ],
    },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceType, "corrective_action");
  assert.equal(items[0].sourceRoute, "/qapi/incidents/inc1");
});

test("G2. the Incident resolving (moving to recentlyResolvedIncidents) does not remove its still-open corrective Action WorkItem", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      // The Incident itself is gone from actionableIncidents and now only
      // appears in its own "completed" bucket — simulating what
      // lib/data/todaysWork.ts's next real read would fetch once resolved.
      recentlyResolvedIncidents: [
        {
          id: "inc1",
          community_id: null,
          resident_id: "r1",
          workforce_member_id: null,
          occurred_at: "2026-07-18T00:00:00.000Z",
          location: null,
          incident_type: "fall",
          incident_type_other: null,
          description: "Resident fell in the hallway.",
          immediate_response: null,
          injury_occurred: false,
          injury_medical_details: null,
          parties_notified: [],
          follow_up_required: true,
          owner: "Jordan Lee",
          notes: null,
          review_status: "reviewed",
          reviewed_by: "Jordan Lee",
          reviewed_at: "2026-07-19T00:00:00.000Z",
          review_findings: null,
          status: "resolved",
          resolution_note: "Resolved.",
          resolved_by: "Jordan Lee",
          resolved_at: "2026-07-25T00:00:00.000Z",
          created_by: "Jordan Lee",
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-25T00:00:00.000Z",
          updated_by: "Jordan Lee",
          residentDisplayName: "Ada Washington",
        } satisfies IncidentWithResidentName,
      ],
      openCorrectiveActions: [
        {
          id: "ca1",
          title: "Follow up on fall risk",
          reason: "Incident follow-up required.",
          priority: "high",
          dueAt: "2026-07-30T00:00:00.000Z",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
          sourceReviewItemId: null,
          requirementCode: null,
          lifecycleStage: "open" as const,
        },
      ],
    },
    NOW,
  );
  const correctiveItem = items.find((i) => i.sourceType === "corrective_action");
  const incidentItem = items.find((i) => i.sourceType === "incident");
  assert.ok(correctiveItem, "the open corrective Action must still be present");
  assert.equal(correctiveItem?.status, "upcoming");
  assert.equal(incidentItem?.status, "completed", "the Incident itself reads as completed, never reopened by the still-open Action");
});

test("G3. resolving the corrective Action itself (absent from openCorrectiveActions on the next read) removes its WorkItem", () => {
  const items = composeTodaysWorkItems({ ...EMPTY_INPUT, openCorrectiveActions: [] }, NOW);
  assert.equal(items.filter((i) => i.sourceType === "corrective_action").length, 0);
});

// Live-validation regression fix: an action that reached lifecycle_stage
// 'implemented' while status stays 'open' (an incident action awaiting its
// required effectiveness review — see 20260910000000's closure-decision
// note) must no longer appear as outstanding IMPLEMENTATION work; the
// effectiveness review that follows it is its own, separately-composed
// WorkItem (Acceptance H) — this was the exact "still shows under Needs
// Attention" bug confirmed in live validation.
test("G4. an implemented action awaiting its effectiveness review no longer produces a corrective_action WorkItem", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      openCorrectiveActions: [
        {
          id: "ca1",
          title: "Implement medication-assistance verification protocol",
          reason: "Medication administered without required verification step.",
          priority: "high",
          dueAt: "2026-07-01",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
          sourceReviewItemId: null,
          requirementCode: null,
          lifecycleStage: "implemented" as const,
        },
      ],
      pendingEffectivenessReviews: [
        {
          id: "rev1",
          correctiveActionTitle: "Implement medication-assistance verification protocol",
          dueAt: "2026-08-15",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
        },
      ],
    },
    NOW,
  );
  assert.equal(items.filter((i) => i.sourceType === "corrective_action").length, 0);
  assert.equal(items.filter((i) => i.sourceType === "effectiveness_review").length, 1);
});

test("G5. a verified_effective or cancelled action produces no corrective_action WorkItem either (both are terminal — status auto-closes them anyway, but the composer's own filter must not depend on that alone)", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      openCorrectiveActions: [
        {
          id: "ca1",
          title: "T1",
          reason: "R",
          priority: "normal",
          dueAt: null,
          owner: null,
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: null,
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
          sourceReviewItemId: null,
          requirementCode: null,
          lifecycleStage: "verified_effective" as const,
        },
        {
          id: "ca2",
          title: "T2",
          reason: "R",
          priority: "normal",
          dueAt: null,
          owner: null,
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: null,
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
          sourceReviewItemId: null,
          requirementCode: null,
          lifecycleStage: "cancelled" as const,
        },
      ],
    },
    NOW,
  );
  assert.equal(items.filter((i) => i.sourceType === "corrective_action").length, 0);
});

// ─── Acceptance H — effectiveness review composed independently ─────────
// (Incident Corrective Action Lifecycle v0.1, Today's Work integration)

test("H1. a pending effectiveness review is composed as its own WorkItem, independent of the corrective Action's own WorkItem", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      pendingEffectivenessReviews: [
        {
          id: "rev1",
          correctiveActionTitle: "Implement medication-assistance verification protocol",
          dueAt: "2026-07-20",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
        },
      ],
    },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceType, "effectiveness_review");
  assert.equal(items[0].sourceRoute, "/qapi/incidents/inc1");
  assert.equal(items[0].status, "needs_attention"); // 2026-07-20 due date is before NOW (2026-07-26)
});

test("H2. a corrective Action's implementation-due WorkItem and its effectiveness-review-due WorkItem can both compose at once, as two distinct items", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      openCorrectiveActions: [
        {
          id: "ca1",
          title: "Implement medication-assistance verification protocol",
          reason: "Medication administered without required verification step.",
          priority: "high",
          dueAt: "2026-08-01",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
          sourceReviewItemId: null,
          requirementCode: null,
          lifecycleStage: "open" as const,
        },
      ],
      pendingEffectivenessReviews: [
        {
          id: "rev1",
          correctiveActionTitle: "Implement medication-assistance verification protocol",
          dueAt: "2026-08-15",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: "inc1",
          sourceInfectionId: null,
        },
      ],
    },
    NOW,
  );
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.sourceType).sort(),
    ["corrective_action", "effectiveness_review"],
  );
});

test("H3. no effectiveness review WorkItem is ever produced for one lib/data/todaysWork.ts didn't supply (not-yet-implemented reviews are filtered at the I/O layer, not here)", () => {
  const items = composeTodaysWorkItems(EMPTY_INPUT, NOW);
  assert.equal(items.length, 0);
});

// ─── Acceptance I / J — no fabricated due state, no duplicate source of truth ──

test("no corrective Action WorkItem ever fabricates a due date it wasn't given", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      openCorrectiveActions: [
        {
          id: "ca2",
          title: "T",
          reason: "R",
          priority: "normal",
          dueAt: null,
          owner: null,
          subjectType: "resident",
          subjectId: "r2",
          subjectLabel: null,
          sourceIncidentId: null,
          sourceInfectionId: "inf1",
          sourceReviewItemId: null,
          requirementCode: null,
          lifecycleStage: "open" as const,
        },
      ],
    },
    NOW,
  );
  assert.equal(items[0].dueAt, undefined);
});

test("an empty input produces an empty WorkItem list (no hidden default population)", () => {
  assert.deepEqual(composeTodaysWorkItems(EMPTY_INPUT, NOW), []);
});

// ─── Infection Follow-Up (Infection Lifecycle & Learning Loop v0.1) ─────

test("K1. an infection's outstanding follow-up obligation composes as its own WorkItem, independent of the base infection item", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      outstandingInfectionFollowUps: [
        {
          infectionId: "inf1",
          nextFollowUpDate: "2026-07-20",
          purpose: "check_client_service_status",
          owner: "Jordan Lee",
          residentId: "r1",
          residentDisplayName: "Ada Washington",
        },
      ],
    },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceType, "infection_follow_up");
  assert.equal(items[0].sourceRoute, "/qapi/infections/inf1");
  assert.equal(items[0].status, "needs_attention");
});

test("K2. an infection follow-up and an infection-sourced corrective action's effectiveness review compose as two distinct WorkItems for the same infection", () => {
  const items = composeTodaysWorkItems(
    {
      ...EMPTY_INPUT,
      outstandingInfectionFollowUps: [
        {
          infectionId: "inf1",
          nextFollowUpDate: "2026-08-01",
          purpose: "infection_control_follow_up",
          owner: null,
          residentId: "r1",
          residentDisplayName: "Ada Washington",
        },
      ],
      pendingEffectivenessReviews: [
        {
          id: "rev1",
          correctiveActionTitle: "Reinforce PPE protocol",
          dueAt: "2026-08-15",
          owner: "Jordan Lee",
          subjectType: "resident",
          subjectId: "r1",
          subjectLabel: "Ada Washington",
          sourceIncidentId: null,
          sourceInfectionId: "inf1",
        },
      ],
    },
    NOW,
  );
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.sourceType).sort(),
    ["effectiveness_review", "infection_follow_up"],
  );
  assert.ok(items.every((i) => i.sourceRoute === "/qapi/infections/inf1"));
});

// ─── isClientReadinessVerificationAction (Office Staff Client Readiness
// UX v0.2, Today's Work capability filter) ────────────────────────────────

test("REGRESSION: a client_readiness evidence_awaiting_verification action is identified for filtering", () => {
  assert.equal(isClientReadinessVerificationAction({ domain: "client_readiness", actionType: "evidence_awaiting_verification" }), true);
});

test("a client_readiness action of any OTHER actionType is not identified", () => {
  assert.equal(isClientReadinessVerificationAction({ domain: "client_readiness", actionType: "evidence_missing" }), false);
});

test("REGRESSION: Workforce's own evidence_awaiting_verification actionType is NOT identified merely by actionType -- domain must also match, since Workforce's compliance_actions table is a separate flow entirely", () => {
  assert.equal(isClientReadinessVerificationAction({ domain: "workforce", actionType: "evidence_awaiting_verification" }), false);
  assert.equal(isClientReadinessVerificationAction({ domain: null, actionType: "evidence_awaiting_verification" }), false);
});

test("an incident/infection/EPRP corrective action (different domain) is not identified", () => {
  assert.equal(isClientReadinessVerificationAction({ domain: "incidents", actionType: "evidence_awaiting_verification" }), false);
  assert.equal(isClientReadinessVerificationAction({ domain: "emergency_preparedness", actionType: "evidence_awaiting_verification" }), false);
});

// ─── filterCorrectiveActionsForViewer, exercised by REAL role (Office
// Staff Client Readiness UX v0.2, refinement 2 — role-level composition
// tests). Uses the actual canVerifyResidentEvidence predicate from
// lib/auth/permissions.ts, never a hand-rolled boolean, so these tests
// prove real role behavior end to end, not just the filter's own logic in
// isolation. ────────────────────────────────────────────────────────────

interface FakeAction {
  id: string;
  domain: string | null;
  actionType: string;
}

const CLIENT_READINESS_VERIFICATION_ACTION: FakeAction = {
  id: "cr-verify-1",
  domain: "client_readiness",
  actionType: "evidence_awaiting_verification",
};

// An unrelated action (a different domain entirely, e.g. an Incident's own
// corrective action) — must remain visible to every role regardless of
// canVerifyResidentEvidence, proving the filter is scoped to exactly the
// one action type/domain pair, never a blanket "hide from office_staff"
// rule.
const UNRELATED_INCIDENT_ACTION: FakeAction = {
  id: "incident-action-1",
  domain: "incidents",
  actionType: "corrective_action",
};

const SOURCE_ACTIONS: readonly FakeAction[] = [CLIENT_READINESS_VERIFICATION_ACTION, UNRELATED_INCIDENT_ACTION];

test("REGRESSION: office_staff does not receive the Client Readiness evidence_awaiting_verification action", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("office_staff" as AuthRole));
  assert.equal(visible.some((a) => a.id === CLIENT_READINESS_VERIFICATION_ACTION.id), false);
});

test("REGRESSION: admin receives the Client Readiness evidence_awaiting_verification action", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("admin" as AuthRole));
  assert.equal(visible.some((a) => a.id === CLIENT_READINESS_VERIFICATION_ACTION.id), true);
});

test("REGRESSION: manager receives the Client Readiness evidence_awaiting_verification action", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("manager" as AuthRole));
  assert.equal(visible.some((a) => a.id === CLIENT_READINESS_VERIFICATION_ACTION.id), true);
});

test("REGRESSION: executive receives the Client Readiness evidence_awaiting_verification action", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("executive" as AuthRole));
  assert.equal(visible.some((a) => a.id === CLIENT_READINESS_VERIFICATION_ACTION.id), true);
});

test("operations (never granted canVerifyResidentEvidence) also does not receive the action -- the filter tracks the real predicate, not a hard-coded role list", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("operations" as AuthRole));
  assert.equal(visible.some((a) => a.id === CLIENT_READINESS_VERIFICATION_ACTION.id), false);
});

test("REGRESSION: an unrelated corrective action remains visible to office_staff -- the filter excludes only the one action/domain pair, never a blanket hide", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("office_staff" as AuthRole));
  assert.equal(visible.some((a) => a.id === UNRELATED_INCIDENT_ACTION.id), true);
});

test("REGRESSION: filtering never mutates or removes anything from the source array -- the underlying corrective action is never removed from its source data, only excluded from this one viewer's own composed list", () => {
  const sourceCopy = SOURCE_ACTIONS.map((a) => ({ ...a }));
  filterCorrectiveActionsForViewer(SOURCE_ACTIONS, canVerifyResidentEvidence("office_staff" as AuthRole));
  assert.deepEqual(SOURCE_ACTIONS.map((a) => ({ ...a })), sourceCopy, "source array must be unchanged after filtering");
  assert.equal(SOURCE_ACTIONS.length, 2, "source array length must be unchanged");
});

test("a viewer who CAN verify sees every action, source array untouched either way", () => {
  const visible = filterCorrectiveActionsForViewer(SOURCE_ACTIONS, true);
  assert.equal(visible.length, SOURCE_ACTIONS.length);
  assert.notEqual(visible, SOURCE_ACTIONS, "must return a new array, never the same reference, even when nothing is excluded");
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

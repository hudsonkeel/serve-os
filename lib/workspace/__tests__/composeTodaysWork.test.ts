// Pure-function tests for ../composeTodaysWork.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import { composeTodaysWorkItems, type ComposeTodaysWorkInput } from "../composeTodaysWork.ts";
import type { RelationshipWorkspaceRow } from "../../relationships/search.ts";
import type { IncidentWithResidentName } from "../../data/incidents.ts";

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

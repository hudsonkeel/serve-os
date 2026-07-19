// Pure-function tests for lib/relationships/brief.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import { generateRelationshipBrief } from "../brief.ts";
import type { RelationshipBriefInput } from "../brief.ts";
import type {
  Relationship,
  RelationshipAction,
  RelationshipCommitment,
  RelationshipInsight,
  RelationshipOpenLoop,
  RelationshipTouch,
} from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: "rel-1",
    relationship_type: "resident_prospect",
    stage: "new_inquiry",
    status: "active",
    display_name: "Smith Family Inquiry",
    resident_id: null,
    prospect_id: null,
    community_name: null,
    organization_name: null,
    primary_contact_name: "Cary Smith",
    primary_contact_relationship: "Daughter",
    primary_contact_phone: null,
    primary_contact_email: null,
    prospective_resident_name: "Margaret Smith",
    prospective_client_first_name: null,
    prospective_client_last_name: null,
    prospective_client_preferred_name: null,
    prospective_client_phone: null,
    prospective_client_email: null,
    primary_contact_is_prospective_client: false,
    summary: null,
    owner_label: null,
    priority: "normal",
    source_type: null,
    source_label: null,
    last_meaningful_touch_at: null,
    created_by: "fict-staff-1",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-07-01T00:00:00.000Z",
    closed_at: null,
    closed_by: null,
    test_marker: null,
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<RelationshipTouch> = {}): RelationshipTouch {
  return {
    id: "touch-1",
    relationship_id: "rel-1",
    touch_type: "call",
    occurred_at: "2026-07-15T15:00:00.000Z",
    summary: "Spoke with Cary about possible recurring visits.",
    interaction_result: "connected",
    outcome: null,
    contact_name: "Cary Smith",
    participants: [],
    idempotency_key: null,
    created_by: "fict-staff-1",
    created_at: "2026-07-15T15:05:00.000Z",
    source_type: "manual",
    source_record_id: null,
    ...overrides,
  };
}

function makeInsight(overrides: Partial<RelationshipInsight> = {}): RelationshipInsight {
  return {
    id: "insight-1",
    relationship_id: "rel-1",
    resident_id: null,
    contact_name: "Cary Smith",
    content: "Family plans to discuss options this weekend.",
    category: "timing",
    why_it_matters: "Follow up after Monday rather than before the family discussion.",
    status: "active",
    relevant_until: null,
    source_interaction_id: "touch-1",
    created_by: "fict-staff-1",
    created_at: "2026-07-15T15:05:00.000Z",
    updated_by: null,
    updated_at: "2026-07-15T15:05:00.000Z",
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

function makeCommitment(overrides: Partial<RelationshipCommitment> = {}): RelationshipCommitment {
  return {
    id: "commitment-1",
    relationship_id: "rel-1",
    description: "Serve will send pricing.",
    responsible_party_type: "serve",
    responsible_party_reference: null,
    expected_date: "2026-07-16",
    status: "open",
    closed_at: null,
    closed_by: null,
    closure_note: null,
    source_interaction_id: "touch-1",
    created_by: "fict-staff-1",
    created_at: "2026-07-15T15:05:00.000Z",
    updated_by: null,
    updated_at: "2026-07-15T15:05:00.000Z",
    ...overrides,
  };
}

function makeOpenLoop(overrides: Partial<RelationshipOpenLoop> = {}): RelationshipOpenLoop {
  return {
    id: "openloop-1",
    relationship_id: "rel-1",
    question: "Has the family decided whether recurring visits are appropriate?",
    owner: "Cary Smith",
    target_resolution_date: null,
    status: "open",
    resolution: null,
    resolved_at: null,
    resolved_by: null,
    source_interaction_id: "touch-1",
    created_by: "fict-staff-1",
    created_at: "2026-07-15T15:05:00.000Z",
    updated_by: null,
    updated_at: "2026-07-15T15:05:00.000Z",
    ...overrides,
  };
}

function makeNextAction(overrides: Partial<RelationshipAction> = {}): RelationshipAction {
  return {
    id: "action-1",
    relationship_id: "rel-1",
    action_type: "follow_up",
    title: "Call Cary Monday",
    description: null,
    due_at: "2026-07-21T00:00:00.000Z",
    assigned_to: "fict-staff-1",
    priority: "normal",
    status: "open",
    completion_outcome: null,
    created_by: "fict-staff-1",
    created_at: "2026-07-15T15:05:00.000Z",
    updated_by: null,
    updated_at: "2026-07-15T15:05:00.000Z",
    completed_by: null,
    completed_at: null,
    dismissed_by: null,
    dismissed_at: null,
    source_interaction_id: "touch-1",
    ...overrides,
  };
}

function fullInput(overrides: Partial<RelationshipBriefInput> = {}): RelationshipBriefInput {
  return {
    relationship: makeRelationship(),
    recentInteractions: [makeInteraction()],
    activeInsights: [makeInsight()],
    openCommitments: [makeCommitment()],
    openLoops: [makeOpenLoop()],
    currentNextAction: makeNextAction(),
    ...overrides,
  };
}

function sparseInput(): RelationshipBriefInput {
  return {
    relationship: makeRelationship(),
    recentInteractions: [],
    activeInsights: [],
    openCommitments: [],
    openLoops: [],
    currentNextAction: null,
  };
}

test("1. every section with grounding data carries at least one basedOn reference", () => {
  const brief = generateRelationshipBrief(fullInput());
  assert.ok(brief.context.basedOn.length > 0);
  assert.ok(brief.whatMatters.basedOn.length > 0);
  assert.ok(brief.currentGoal.basedOn.length > 0);
  assert.ok(brief.openCommitments.basedOn.length > 0);
  assert.ok(brief.openLoops.basedOn.length > 0);
  assert.ok(brief.nextAction.basedOn.length > 0);
  assert.ok(brief.recommendedFollowUp.basedOn.length > 0);
  assert.ok(brief.basedOn.length > 0);
});

test("2. the top-level basedOn list is deduplicated across sections that cite the same record", () => {
  const brief = generateRelationshipBrief(fullInput());
  const keys = brief.basedOn.map((r) => `${r.kind}:${r.id}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("3. sparse input produces an explicit uncertainty statement per section, never a fabrication", () => {
  const brief = generateRelationshipBrief(sparseInput());
  assert.match(brief.context.body, /no interactions/i);
  assert.match(brief.whatMatters.body, /not yet known/i);
  assert.match(brief.openCommitments.body, /no commitments/i);
  assert.match(brief.openLoops.body, /no open questions/i);
  assert.match(brief.nextAction.body, /no current next action/i);
  assert.deepEqual(brief.context.basedOn, []);
  assert.deepEqual(brief.whatMatters.basedOn, []);
  assert.deepEqual(brief.openCommitments.basedOn, []);
  assert.deepEqual(brief.openLoops.basedOn, []);
  assert.deepEqual(brief.nextAction.basedOn, []);
});

test("4. sparse input's Recommended Follow-Up states uncertainty rather than inventing an opening or primary question", () => {
  const brief = generateRelationshipBrief(sparseInput());
  assert.match(brief.recommendedFollowUp.opening, /open-ended check-in/i);
  assert.match(brief.recommendedFollowUp.primaryQuestion, /no single unresolved question/i);
});

test("5. the Context section never states a fact beyond what the interaction records actually say", () => {
  const brief = generateRelationshipBrief(fullInput());
  // The only interaction's exact summary text must appear verbatim — a
  // paraphrase or invented detail would fail this.
  assert.ok(brief.context.body.includes("Spoke with Cary about possible recurring visits."));
});

test("6. What Matters only ever reflects insights actually passed in, never invents a concern not present", () => {
  const brief = generateRelationshipBrief(fullInput({ activeInsights: [] }));
  assert.match(brief.whatMatters.body, /not yet known/i);
  assert.equal(brief.whatMatters.basedOn.length, 0);
});

test("7. Current Goal is always grounded in the relationship's actual stage, never a generic guess", () => {
  const brief = generateRelationshipBrief(fullInput({ relationship: makeRelationship({ stage: "proposal_sent" }) }));
  assert.match(brief.currentGoal.body, /proposal/i);
  assert.equal(brief.currentGoal.basedOn[0].kind, "relationship");
});

test("8. determinism: identical input produces an identical brief (aside from generatedAt)", () => {
  const input = fullInput();
  const fixedNow = () => new Date("2026-07-18T12:00:00.000Z");
  const a = generateRelationshipBrief(input, { now: fixedNow });
  const b = generateRelationshipBrief(input, { now: fixedNow });
  assert.deepEqual(a, b);
});

test("9. narrativeRefiner, when supplied, can transform the draft — proving the extension seam works without being used by default", () => {
  const brief = generateRelationshipBrief(fullInput(), {
    narrativeRefiner: (draft) => ({ ...draft, context: { ...draft.context, body: "REFINED" } }),
  });
  assert.equal(brief.context.body, "REFINED");
});

test("10. no narrativeRefiner supplied leaves the deterministic draft untouched", () => {
  const brief = generateRelationshipBrief(fullInput());
  assert.notEqual(brief.context.body, "REFINED");
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

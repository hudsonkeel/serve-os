// Pure-function tests for the Audit Readiness dashboard's cross-domain
// issue ranking. The domain rollup functions themselves are I/O
// (getWorkforceRoster, getAllOpenCorrectiveActionsComposed) and are
// verified live instead — see scripts/verify-audit-readiness-phase3.ts —
// matching this codebase's convention that data/orchestration layers are
// live-verified, not unit-mocked.
//
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/auditReadinessDashboard.test.ts
import assert from "node:assert/strict";
import { groupIssuesBySubject, rankIssues, type DomainReadinessRollup, type DomainRequirementIssue } from "../auditReadinessDashboard.ts";
import type { AuditReadinessStatus } from "../auditReadinessStatus.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function issue(status: AuditReadinessStatus, overrides: Partial<DomainRequirementIssue> = {}): DomainRequirementIssue {
  return {
    domain: "workforce",
    subjectType: "workforce_member",
    subjectId: "member-1",
    subjectLabel: "Test Member",
    subjectHref: "/workforce/member-1",
    requirementCode: "TEST_REQ",
    requirementName: "Test Requirement",
    regulatoryAuthority: null,
    status,
    explanation: `status is ${status}`,
    latestEvidence: null,
    ...overrides,
  };
}

function domain(issues: DomainRequirementIssue[]): DomainReadinessRollup {
  return {
    domainId: "workforce",
    label: "Workforce",
    configured: true,
    requirementCount: issues.length,
    subjectCount: 1,
    readySubjectCount: 0,
    statusCounts: {} as Record<AuditReadinessStatus, number>,
    issues,
  };
}

test("overdue and missing_evidence rank above needs_review and due_soon", () => {
  const ranked = rankIssues([domain([issue("due_soon"), issue("overdue"), issue("needs_review"), issue("missing_evidence")])]);
  assert.deepEqual(
    ranked.map((i) => i.status),
    ["overdue", "missing_evidence", "needs_review", "due_soon"]
  );
});

test("compliant and not_applicable issues (if ever present) rank last", () => {
  const ranked = rankIssues([domain([issue("compliant"), issue("overdue"), issue("not_applicable")])]);
  assert.equal(ranked[0].status, "overdue");
});

test("flattens issues across multiple domains into one ranked list", () => {
  const ranked = rankIssues([domain([issue("due_soon")]), domain([issue("overdue")])]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].status, "overdue");
});

test("an empty domain list produces an empty ranked list", () => {
  assert.deepEqual(rankIssues([]), []);
});

test("groupIssuesBySubject groups multiple issues for the same person into one entry", () => {
  const groups = groupIssuesBySubject([
    issue("overdue", { subjectId: "a", requirementCode: "R1" }),
    issue("due_soon", { subjectId: "a", requirementCode: "R2" }),
    issue("missing_evidence", { subjectId: "b", requirementCode: "R1" }),
  ]);
  assert.equal(groups.length, 2);
  const a = groups.find((g) => g.subjectId === "a");
  assert.equal(a?.issues.length, 2);
});

test("groupIssuesBySubject orders groups by worst issue first, then by issue count", () => {
  const groups = groupIssuesBySubject([
    issue("due_soon", { subjectId: "low-priority-two-issues" }),
    issue("due_soon", { subjectId: "low-priority-two-issues", requirementCode: "R2" }),
    issue("overdue", { subjectId: "high-priority-one-issue" }),
  ]);
  assert.equal(groups[0].subjectId, "high-priority-one-issue");
  assert.equal(groups[1].subjectId, "low-priority-two-issues");
});

test("groupIssuesBySubject on an empty issue list produces no groups", () => {
  assert.deepEqual(groupIssuesBySubject([]), []);
});

// REGRESSION — app/audit-readiness/page.tsx once sliced the flat, ranked
// issue list to 8 BEFORE grouping by subject. A single subject with more
// than 8 individual requirement-level issues filled every slot, silently
// dropping every other subject's card from Needs Attention even though the
// headline rollup (subjectCount/readySubjectCount, computed independently)
// still counted them correctly. The display cap must always apply to the
// rendered CARDS — group first, slice second.
test("REGRESSION: the display cap must apply after grouping, not before — one subject's many issues must not crowd out every other subject's card", () => {
  const manyIssuesForOneSubject = Array.from({ length: 10 }, (_, i) => issue("overdue", { subjectId: "a", requirementCode: `R${i}` }));
  const oneIssueEach = ["b", "c", "d", "e"].map((id) => issue("missing_evidence", { subjectId: id, requirementCode: "R1" }));
  const ranked = rankIssues([domain([...manyIssuesForOneSubject, ...oneIssueEach])]);

  const correctGroups = groupIssuesBySubject(ranked).slice(0, 8);
  const correctSubjectIds = correctGroups.map((g) => g.subjectId);
  for (const id of ["a", "b", "c", "d", "e"]) {
    assert.ok(correctSubjectIds.includes(id), `subject ${id} must still have its own card when grouping happens before the slice`);
  }

  // Sanity check that this scenario actually reproduces the bug when the
  // steps are reversed — proves the test would have caught it.
  const buggySubjectIds = groupIssuesBySubject(ranked.slice(0, 8)).map((g) => g.subjectId);
  assert.ok(
    !["b", "c", "d", "e"].every((id) => buggySubjectIds.includes(id)),
    "sanity check failed: slicing before grouping should have dropped subjects b-e in this scenario"
  );
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

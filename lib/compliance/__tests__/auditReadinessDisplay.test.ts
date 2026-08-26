// Pure-function tests for the shared rollup-display helpers extracted from
// app/audit-readiness/page.tsx (2026-08-25, QAPI v0.1) — both
// app/audit-readiness/page.tsx and app/qapi/page.tsx depend on these
// behaving identically, so a regression here would silently affect both
// pages at once.
//
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/auditReadinessDisplay.test.ts
import assert from "node:assert/strict";
import {
  allClearMessage,
  auditReadinessRequirementsHref,
  awaitingFirstSubjectMessage,
  domainRequirementTotals,
  needsAttentionLabel,
  resolveIssueHref,
} from "../auditReadinessDisplay.ts";
import type { DomainReadinessRollup } from "../auditReadinessDashboard.ts";
import { AUDIT_READINESS_STATUSES } from "../auditReadinessDashboard.ts";
import type { AuditReadinessStatus } from "../auditReadinessStatus.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function emptyStatusCounts(): Record<AuditReadinessStatus, number> {
  const counts = {} as Record<AuditReadinessStatus, number>;
  for (const status of AUDIT_READINESS_STATUSES) counts[status] = 0;
  return counts;
}

function domain(overrides: Partial<DomainReadinessRollup> = {}): DomainReadinessRollup {
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

test("domainRequirementTotals excludes not_applicable from the denominator and treats compliant/satisfied_by_event/exception as satisfied", () => {
  const statusCounts = emptyStatusCounts();
  statusCounts.compliant = 3;
  statusCounts.satisfied_by_event = 1;
  statusCounts.exception = 1;
  statusCounts.overdue = 2;
  statusCounts.not_applicable = 4;
  const { satisfiedCount, applicableCount } = domainRequirementTotals(domain({ statusCounts }));
  assert.equal(satisfiedCount, 5);
  assert.equal(applicableCount, 7); // 3+1+1+2 (not_applicable's 4 excluded)
});

test("allClearMessage is subject-count-aware for workforce", () => {
  assert.match(allClearMessage(domain({ domainId: "workforce", subjectCount: 1 })), /All 1 employee are audit-ready/);
  assert.match(allClearMessage(domain({ domainId: "workforce", subjectCount: 5 })), /All 5 employees are audit-ready/);
});

test("allClearMessage has fixed copy for emergency_preparedness and client_readiness", () => {
  assert.equal(allClearMessage(domain({ domainId: "emergency_preparedness" })), "Emergency Preparedness is audit-ready.");
  assert.equal(allClearMessage(domain({ domainId: "client_readiness" })), "All applicable clients are audit-ready.");
});

test("awaitingFirstSubjectMessage appends 'Readiness' only when the label doesn't already end with it", () => {
  assert.match(awaitingFirstSubjectMessage(domain({ label: "Client Readiness" })), /^Client Readiness is configured/);
  assert.match(awaitingFirstSubjectMessage(domain({ label: "Emergency Preparedness" })), /^Emergency Preparedness Readiness is configured/);
});

test("needsAttentionLabel renames client_readiness to 'Clients', leaves other domains as their own label", () => {
  assert.equal(needsAttentionLabel(domain({ domainId: "client_readiness", label: "Client Readiness" })), "Clients");
  assert.equal(needsAttentionLabel(domain({ domainId: "workforce", label: "Workforce" })), "Workforce");
});

test("resolveIssueHref appends the employee-record-audit anchor only for workforce_member subjects", () => {
  const href = resolveIssueHref({ subjectType: "workforce_member", subjectHref: "/workforce/abc", requirementCode: "I9_COMPLETION" });
  assert.equal(href, "/workforce/abc?requirement=I9_COMPLETION#employee-record-audit");
});

test("resolveIssueHref appends only the requirement query param for agency and resident subjects", () => {
  assert.equal(
    resolveIssueHref({ subjectType: "resident", subjectHref: "/residents/xyz", requirementCode: "CR_ASSESSMENT_CURRENT" }),
    "/residents/xyz?requirement=CR_ASSESSMENT_CURRENT"
  );
  assert.equal(
    resolveIssueHref({ subjectType: "agency", subjectHref: "/audit-readiness/emergency-preparedness", requirementCode: "EP_PLAN_MAINTAINED" }),
    "/audit-readiness/emergency-preparedness?requirement=EP_PLAN_MAINTAINED"
  );
});

test("resolveIssueHref falls back to the plain subject href for any other subject type", () => {
  assert.equal(
    resolveIssueHref({ subjectType: "community", subjectHref: "/communities/main", requirementCode: "SOME_CODE" }),
    "/communities/main"
  );
});

test("auditReadinessRequirementsHref builds query params only for non-'all' values", () => {
  assert.equal(auditReadinessRequirementsHref("all", "all"), "/audit-readiness/requirements");
  assert.equal(auditReadinessRequirementsHref("workforce", "all"), "/audit-readiness/requirements?domain=workforce");
  assert.equal(auditReadinessRequirementsHref("all", "overdue"), "/audit-readiness/requirements?status=overdue");
  assert.equal(auditReadinessRequirementsHref("client_readiness", "overdue"), "/audit-readiness/requirements?domain=client_readiness&status=overdue");
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

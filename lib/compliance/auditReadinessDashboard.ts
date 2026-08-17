// Audit Readiness's own orchestration/composition layer — the "knowing
// conductor." Nothing here recomputes compliance: it calls the exact same
// functions the owning domains already call for themselves
// (getWorkforceRoster() is the same function /workforce's own page uses),
// and reuses lib/compliance/auditReadinessStatus.ts (Phase 1) to translate
// each domain's already-computed evaluation into the shared vocabulary.
// This file only aggregates and cross-links; it never touches
// person_requirements/person_evidence directly, and never introduces a
// second status evaluator.
import { getWorkforceRoster } from "../workforce/roster.ts";
import { isEligibleForComplianceFilters } from "../workforce/registrySummary.ts";
import { deriveAuditReadinessStatus, type AuditReadinessStatus } from "./auditReadinessStatus.ts";
import { getAllOpenCorrectiveActionsComposed, type ComposedCorrectiveAction } from "./correctiveActionComposition.ts";
import { listRecentPersonDocuments } from "../data/personDocuments.ts";
import { getEmergencyPreparednessReadinessEvaluation } from "../emergencyPreparedness/emergencyPreparednessReadiness.ts";
import { getClientReadinessEvaluation } from "../clientReadiness/clientReadinessReadiness.ts";
import type { PersonDocument, PersonEvidence } from "../supabase/types.ts";
// Type-only — erased at build/strip time, so this never pulls
// residentServeRelationships.ts's live AxisCare-fetching import chain (@/
// aliases, extensionless imports) into this file's module graph, which
// would break this file's own standalone-tested pure functions
// (rankIssues/groupIssuesBySubject). The actual population is always
// resolved by the caller (app/audit-readiness/page.tsx, the one place
// genuinely allowed to hit the live projection pipeline) and passed in —
// see getAuditReadinessDashboardData() below.
import type { AuditEligibleActiveClient } from "../data/residentServeRelationships.ts";

export type AuditReadinessDomainId = "workforce" | "emergency_preparedness" | "client_readiness";

// Audit Readiness's own catalog of the domains it knows about — not
// domain-owned data, and not derived from person_requirements.domain
// (that column is real but unpopulated on the pre-existing workforce
// requirements, and backfilling it is a data change this phase doesn't
// make unasked). This is the minimal, honest alternative: a static list
// of the domains the v0.1 spec names, each marked configured/not per
// whether real seeded requirement data actually exists for it today.
export const AUDIT_READINESS_DOMAINS: ReadonlyArray<{ id: AuditReadinessDomainId; label: string }> = [
  { id: "workforce", label: "Workforce" },
  { id: "emergency_preparedness", label: "Emergency Preparedness" },
  { id: "client_readiness", label: "Client Readiness" },
];

export const AUDIT_READINESS_STATUSES: readonly AuditReadinessStatus[] = [
  "compliant",
  "due_soon",
  "due",
  "overdue",
  "missing_evidence",
  "needs_review",
  "not_applicable",
  "exception",
  "satisfied_by_event",
];

function emptyStatusCounts(): Record<AuditReadinessStatus, number> {
  const counts = {} as Record<AuditReadinessStatus, number>;
  for (const status of AUDIT_READINESS_STATUSES) counts[status] = 0;
  return counts;
}

export interface DomainRequirementIssue {
  domain: AuditReadinessDomainId;
  subjectType: "workforce_member" | "resident" | "agency";
  subjectId: string;
  subjectLabel: string;
  subjectHref: string;
  requirementCode: string;
  requirementName: string;
  regulatoryAuthority: string | null;
  status: AuditReadinessStatus;
  explanation: string;
  latestEvidence: PersonEvidence | null;
}

export interface DomainReadinessRollup {
  domainId: AuditReadinessDomainId;
  label: string;
  // false = no seeded requirement data exists for this domain yet — the
  // UI must show an honest "not configured" state, never a fabricated
  // count or a false "compliant."
  configured: boolean;
  requirementCount: number;
  subjectCount: number;
  // The person-level readiness count — "N of subjectCount are fully
  // ready" — the primary number a leader should read, per the Audit
  // Readiness UX correction pass. Derived from each subject's own
  // pre-computed readiness flag (employeeRecordAudit.readiness === "ready"
  // for workforce), never re-derived from statusCounts, so it can never
  // silently drift from what the owning domain itself considers "ready."
  readySubjectCount: number;
  statusCounts: Record<AuditReadinessStatus, number>;
  // Every non-compliant (requirement, subject) pair, for drill-down.
  // Omitted for unconfigured domains.
  issues: DomainRequirementIssue[];
}

function unconfiguredDomain(domainId: AuditReadinessDomainId, label: string): DomainReadinessRollup {
  return {
    domainId,
    label,
    configured: false,
    requirementCount: 0,
    subjectCount: 0,
    readySubjectCount: 0,
    statusCounts: emptyStatusCounts(),
    issues: [],
  };
}

// Consumes getWorkforceRoster() exactly as /workforce's own page does —
// same eligibility rule (isEligibleForComplianceFilters), same
// Employee Record Audit requirement set, same per-requirement
// evaluations. Ineligible (terminated/inactive) members are excluded from
// counts entirely, matching how Workforce's own dashboard already treats
// them — never shown here as a fabricated "not_applicable" per
// requirement.
async function getWorkforceDomainRollup(): Promise<DomainReadinessRollup> {
  const roster = await getWorkforceRoster();
  const eligible = roster.filter((entry) => isEligibleForComplianceFilters(entry.lifecycle.status));

  const statusCounts = emptyStatusCounts();
  const issues: DomainRequirementIssue[] = [];
  let requirementCount = 0;
  let readySubjectCount = 0;

  for (const entry of eligible) {
    // "Fully ready" is read directly from the same evaluation Workforce's
    // own profile page already computes (employeeRecordAudit.readiness ===
    // "ready" means every one of the 11 requirements is satisfied and
    // verified) — never re-derived from statusCounts below, so this can
    // never disagree with what /workforce/[id] itself would tell this same
    // person about themselves.
    if (entry.employeeRecordAudit.readiness === "ready") readySubjectCount += 1;

    // employeeRecordAudit.registry (WORKFORCE_EMPLOYEE_RECORD_AUDIT, 11
    // requirements) is the audit-readiness-relevant evaluation — not the
    // top-level `entry.registry` (WORKFORCE_REGISTRY_EVIDENCE, just
    // NAR/EMR), which is a narrower set the roster also carries for a
    // different purpose. Using the wrong one here was caught by live
    // verification (scripts/verify-audit-readiness-phase3.ts reported 2
    // requirements instead of 11).
    const evaluation = deriveAuditReadinessStatus(entry.employeeRecordAudit.registry);
    requirementCount = Math.max(requirementCount, evaluation.requirements.length);

    for (const req of evaluation.requirements) {
      statusCounts[req.status] += 1;
      if (req.status !== "compliant" && req.status !== "not_applicable") {
        issues.push({
          domain: "workforce",
          subjectType: "workforce_member",
          subjectId: entry.workforceMemberId,
          subjectLabel: entry.displayName,
          subjectHref: `/workforce/${entry.workforceMemberId}`,
          requirementCode: req.requirementEvaluation.requirement.requirement_code,
          requirementName: req.requirementEvaluation.requirement.name,
          regulatoryAuthority: req.requirementEvaluation.requirement.regulatory_authority,
          status: req.status,
          explanation: req.explanation,
          latestEvidence: req.requirementEvaluation.latestEvidence,
        });
      }
    }
  }

  return {
    domainId: "workforce",
    label: "Workforce",
    configured: true,
    requirementCount,
    subjectCount: eligible.length,
    readySubjectCount,
    statusCounts,
    issues,
  };
}

// Emergency Preparedness is agency-level — one subject (Serve Caregiving
// itself), not a roster. "Fully ready" mirrors Workforce's own contract at
// agency-scale: readySubjectCount is 0 or 1, read directly from
// getEmergencyPreparednessReadinessEvaluation()'s own `ready` flag (never
// re-derived from statusCounts here, same non-drift discipline).
// satisfied_by_event is deliberately excluded from "issues" (it's a
// presentation label over an otherwise-satisfied requirement, matching
// ISSUE_PRIORITY's own 0-priority treatment below) — "exception" is
// deliberately included (ISSUE_PRIORITY ranks it a real, if mild, issue).
async function getEmergencyPreparednessDomainRollup(): Promise<DomainReadinessRollup> {
  const evaluation = await getEmergencyPreparednessReadinessEvaluation();
  if (!evaluation) return unconfiguredDomain("emergency_preparedness", "Emergency Preparedness");

  const statusCounts = emptyStatusCounts();
  const issues: DomainRequirementIssue[] = [];

  for (const r of evaluation.requirements) {
    statusCounts[r.status] += 1;
    if (r.status !== "compliant" && r.status !== "not_applicable" && r.status !== "satisfied_by_event") {
      issues.push({
        domain: "emergency_preparedness",
        subjectType: "agency",
        subjectId: evaluation.agency.id,
        subjectLabel: evaluation.agency.name,
        subjectHref: "/audit-readiness/emergency-preparedness",
        requirementCode: r.requirement.requirement_code,
        requirementName: r.requirement.name,
        regulatoryAuthority: r.requirement.regulatory_authority,
        status: r.status,
        explanation: r.explanation,
        latestEvidence: r.latestEvidence,
      });
    }
  }

  return {
    domainId: "emergency_preparedness",
    label: "Emergency Preparedness",
    configured: true,
    requirementCount: evaluation.requirements.length,
    subjectCount: 1,
    readySubjectCount: evaluation.ready ? 1 : 0,
    statusCounts,
    issues,
  };
}

// Client Readiness mirrors Workforce's shape (many subjects, group-by-
// subject Needs Attention) — never Emergency Preparedness's single-agency
// shape. Population is the same canonical ServeRelationshipProjection
// /residents' own "Active Clients" tab uses (never a second, raw-column
// definition — see lib/residents/auditEligibleActiveClient.ts for the one
// additional identity-confirmation gate Audit Readiness applies on top of
// it), passed in by the caller since this file must stay free of that
// pipeline's live-AxisCare-fetching imports (see the import comment
// above). "Fully ready" is read directly from each resident's own
// getClientReadinessEvaluation().ready — the same non-drift discipline as
// Workforce and Emergency Preparedness.
async function getClientReadinessDomainRollup(
  auditEligibleActiveClients: readonly AuditEligibleActiveClient[]
): Promise<DomainReadinessRollup> {
  if (auditEligibleActiveClients.length === 0) return unconfiguredDomain("client_readiness", "Client Readiness");

  const statusCounts = emptyStatusCounts();
  const issues: DomainRequirementIssue[] = [];
  let requirementCount = 0;
  let readySubjectCount = 0;
  let anyConfigured = false;

  for (const { resident, projection } of auditEligibleActiveClients) {
    const evaluation = await getClientReadinessEvaluation(resident.id, projection.relationship);
    if (!evaluation || evaluation.requirements.length === 0) continue;
    anyConfigured = true;

    if (evaluation.ready) readySubjectCount += 1;
    requirementCount = Math.max(requirementCount, evaluation.requirements.length);

    const subjectLabel = resident.display_name || resident.full_name || [resident.first_name, resident.last_name].filter(Boolean).join(" ") || "Unknown Client";

    for (const req of evaluation.requirements) {
      statusCounts[req.status] += 1;
      if (req.status !== "compliant" && req.status !== "not_applicable" && req.status !== "satisfied_by_event") {
        issues.push({
          domain: "client_readiness",
          subjectType: "resident",
          subjectId: resident.id,
          subjectLabel,
          subjectHref: `/residents/${resident.id}`,
          requirementCode: req.requirement.requirement_code,
          requirementName: req.requirement.name,
          regulatoryAuthority: req.requirement.regulatory_authority,
          status: req.status,
          explanation: req.explanation,
          latestEvidence: req.latestEvidence,
        });
      }
    }
  }

  if (!anyConfigured) return unconfiguredDomain("client_readiness", "Client Readiness");

  return {
    domainId: "client_readiness",
    label: "Client Readiness",
    configured: true,
    requirementCount,
    subjectCount: auditEligibleActiveClients.length,
    readySubjectCount,
    statusCounts,
    issues,
  };
}

export interface AuditReadinessDashboardData {
  domains: DomainReadinessRollup[];
  correctiveActions: ComposedCorrectiveAction[];
  recentDocuments: PersonDocument[];
}

export async function getAuditReadinessDashboardData(
  auditEligibleActiveClients: readonly AuditEligibleActiveClient[]
): Promise<AuditReadinessDashboardData> {
  const [clientReadinessDomain, workforceDomain, emergencyPreparednessDomain, correctiveActions, recentDocuments] = await Promise.all([
    getClientReadinessDomainRollup(auditEligibleActiveClients),
    getWorkforceDomainRollup(),
    getEmergencyPreparednessDomainRollup(),
    getAllOpenCorrectiveActionsComposed(),
    listRecentPersonDocuments(15),
  ]);

  return {
    // Permanent conceptual order — the people we serve, then the people
    // who serve them, then organizational/governance readiness — not
    // implementation sequence. Workforce shipped first because its
    // compliance capability was further along; that's a build-order fact,
    // not the intended product hierarchy.
    domains: [clientReadinessDomain, workforceDomain, emergencyPreparednessDomain],
    correctiveActions,
    recentDocuments,
  };
}

// Cross-domain, priority-sorted issue list for "Needs Attention" — a
// simple, explainable ordering (worst status first), not a scored/decorative
// ranking.
const ISSUE_PRIORITY: Record<AuditReadinessStatus, number> = {
  overdue: 5,
  missing_evidence: 4,
  needs_review: 3,
  due_soon: 2,
  due: 2,
  exception: 1,
  satisfied_by_event: 0,
  compliant: 0,
  not_applicable: 0,
};

export function rankIssues(domains: readonly DomainReadinessRollup[]): DomainRequirementIssue[] {
  return domains
    .flatMap((d) => d.issues)
    .slice()
    .sort((a, b) => ISSUE_PRIORITY[b.status] - ISSUE_PRIORITY[a.status]);
}

export interface SubjectIssueGroup {
  subjectType: DomainRequirementIssue["subjectType"];
  subjectId: string;
  subjectLabel: string;
  subjectHref: string;
  issues: DomainRequirementIssue[];
}

// "Needs Attention," grouped by the person who needs it, not by individual
// requirement — a leader reads "Jane Doe — 2 items," not a flat list of 51
// requirement rows. Every field this needs already exists on
// DomainRequirementIssue; this is pure regrouping of rankIssues()'s own
// output, not a new data path. Groups are ordered worst-issue-first using
// the same ISSUE_PRIORITY the flat list already sorts by.
export function groupIssuesBySubject(issues: readonly DomainRequirementIssue[]): SubjectIssueGroup[] {
  const groups = new Map<string, SubjectIssueGroup>();
  for (const issue of issues) {
    const existing = groups.get(issue.subjectId);
    if (existing) {
      existing.issues.push(issue);
    } else {
      groups.set(issue.subjectId, {
        subjectType: issue.subjectType,
        subjectId: issue.subjectId,
        subjectLabel: issue.subjectLabel,
        subjectHref: issue.subjectHref,
        issues: [issue],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const worstA = Math.max(...a.issues.map((i) => ISSUE_PRIORITY[i.status]));
    const worstB = Math.max(...b.issues.map((i) => ISSUE_PRIORITY[i.status]));
    if (worstB !== worstA) return worstB - worstA;
    return b.issues.length - a.issues.length;
  });
}

// Shared display vocabulary — one place, reused by every Audit Readiness
// page, so the dashboard and the drill-down list can never disagree on
// what a status is called or how urgent it looks.
export const AUDIT_READINESS_STATUS_LABELS: Record<AuditReadinessStatus, string> = {
  compliant: "Compliant",
  due_soon: "Due Soon",
  due: "Due",
  overdue: "Overdue",
  missing_evidence: "Missing Evidence",
  needs_review: "Needs Review",
  not_applicable: "Not Applicable",
  exception: "Exception",
  satisfied_by_event: "Satisfied by Event",
};

export type AuditReadinessStatusTone = "success" | "warning" | "danger" | "blue" | "neutral" | "gold";

export const AUDIT_READINESS_STATUS_TONES: Record<AuditReadinessStatus, AuditReadinessStatusTone> = {
  compliant: "success",
  satisfied_by_event: "success",
  due_soon: "warning",
  due: "warning",
  overdue: "danger",
  missing_evidence: "danger",
  needs_review: "blue",
  exception: "gold",
  not_applicable: "neutral",
};

// Shared display-derivation helpers for pages that render Audit Readiness's
// domain rollups — app/audit-readiness/page.tsx and app/qapi/page.tsx.
// Extracted (2026-08-25, QAPI v0.1) from app/audit-readiness/page.tsx, where
// these previously lived as private, unexported functions, so both pages
// compute "what does this rollup mean" identically rather than each having
// its own copy that could silently drift. Pure, no I/O — mirrors
// auditReadinessDashboard.ts's own no-I/O discipline.
import type { AuditReadinessDomainId, DomainReadinessRollup } from "./auditReadinessDashboard.ts";
import { AUDIT_READINESS_STATUSES } from "./auditReadinessDashboard.ts";
import type { AuditReadinessStatus } from "./auditReadinessStatus.ts";

// "Satisfied" means every one of the engine's own satisfied outcomes
// (compliant, satisfied_by_event, exception are all presentation labels
// over the same underlying "satisfied" per auditReadinessStatus.ts — never
// a different compliance outcome). not_applicable items aren't "required,"
// so they're excluded from the denominator entirely rather than counted as
// either satisfied or not. Scoped per-domain — each domain card owns its
// own Requirement Completion number, not a cross-domain blend.
export function domainRequirementTotals(domain: DomainReadinessRollup): { satisfiedCount: number; applicableCount: number } {
  const total = AUDIT_READINESS_STATUSES.reduce((sum, s) => sum + domain.statusCounts[s], 0);
  const satisfiedCount = domain.statusCounts.compliant + domain.statusCounts.satisfied_by_event + domain.statusCounts.exception;
  const applicableCount = total - domain.statusCounts.not_applicable;
  return { satisfiedCount, applicableCount };
}

// State 2 of the three-state rule (configured + nothing to do) needs a
// domain-appropriate positive sentence — Workforce's is per-person, so its
// count is meaningful here; the other two get generic phrasing until their
// own subject model exists, matching the same "don't fabricate a count
// that isn't real yet" discipline the readiness cards already follow.
export function allClearMessage(domain: DomainReadinessRollup): string {
  if (domain.domainId === "workforce") {
    return `All ${domain.subjectCount} employee${domain.subjectCount === 1 ? "" : "s"} are audit-ready.`;
  }
  if (domain.domainId === "emergency_preparedness") return "Emergency Preparedness is audit-ready.";
  return "All applicable clients are audit-ready.";
}

// State: configured, but zero eligible subjects exist yet (see
// DomainReadinessRollup.awaitingFirstSubject's own contract) — a real,
// neutral "waiting for real data" fact, never phrased as a false
// readiness claim.
export function awaitingFirstSubjectMessage(domain: DomainReadinessRollup): string {
  const title = domain.label.endsWith("Readiness") ? domain.label : `${domain.label} Readiness`;
  return `${title} is configured and will begin automatically when the first Serve client becomes active.`;
}

// Needs Attention identifies *where the actionable work lives*, not the
// readiness domain concept — "Clients," not "Client Readiness" (the top
// card's own name for itself). Workforce/Emergency Preparedness already
// read the same way in both places, so only client_readiness needs the
// override.
export function needsAttentionLabel(domain: DomainReadinessRollup): string {
  return domain.domainId === "client_readiness" ? "Clients" : domain.label;
}

// The one deep link with a real "no hunting" resolution path today —
// lands directly on the matching requirement card, already expanded and
// scrolled to, on the workforce member's own profile. Other subject types
// (once real) fall back to the subject's plain profile link until they
// have their own equivalent anchor. This is the "direct-resolution
// behavior" every consumer of Needs Attention must keep: clicking through
// always lands on the native module's own fix-it point, never a QAPI- or
// Audit-Readiness-owned substitute.
export function resolveIssueHref(issue: { subjectType: string; subjectHref: string; requirementCode: string }): string {
  if (issue.subjectType === "workforce_member") {
    return `${issue.subjectHref}?requirement=${encodeURIComponent(issue.requirementCode)}#employee-record-audit`;
  }
  if (issue.subjectType === "agency" || issue.subjectType === "resident") {
    return `${issue.subjectHref}?requirement=${encodeURIComponent(issue.requirementCode)}`;
  }
  return issue.subjectHref;
}

// The one existing requirement drill-down page — reused by any dashboard
// that renders DomainReadinessCard's "View by requirement" link, rather
// than each dashboard building its own copy of this route/query-param
// construction.
export function auditReadinessRequirementsHref(domain: AuditReadinessDomainId | "all", status: AuditReadinessStatus | "all") {
  const params = new URLSearchParams();
  if (domain !== "all") params.set("domain", domain);
  if (status !== "all") params.set("status", status);
  const qs = params.toString();
  return `/audit-readiness/requirements${qs ? `?${qs}` : ""}`;
}

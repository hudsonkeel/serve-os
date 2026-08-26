import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { AllClearAttentionCard, AttentionCard, AwaitingFirstSubjectAttentionCard, ComingSoonAttentionCard } from "@/components/compliance/AttentionCard";
import { DomainReadinessCard } from "@/components/compliance/DomainReadinessCard";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canViewAuditReadiness } from "@/lib/compliance/permissions";
import {
  getAuditReadinessDashboardData,
  groupIssuesBySubject,
  rankIssues,
  type AuditReadinessDomainId,
} from "@/lib/compliance/auditReadinessDashboard";
import {
  allClearMessage,
  auditReadinessRequirementsHref,
  awaitingFirstSubjectMessage,
  domainRequirementTotals,
  needsAttentionLabel,
  resolveIssueHref,
} from "@/lib/compliance/auditReadinessDisplay";
import { getAuditEligibleActiveClientResidents } from "@/lib/data/residentServeRelationships";
import type { AuditReadinessStatus } from "@/lib/compliance/auditReadinessStatus";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Phase 3 — the real Audit Readiness Dashboard. Every number on this page
// comes from calling the same functions the owning domains already call
// for themselves (getWorkforceRoster(), deriveAuditReadinessStatus(),
// getAllOpenCorrectiveActionsComposed(), listRecentPersonDocuments()) —
// see lib/compliance/auditReadinessDashboard.ts for the one composition
// point. This page renders; it does not evaluate. The rollup-interpretation
// helpers below (allClearMessage, resolveIssueHref, etc.) moved to
// lib/compliance/auditReadinessDisplay.ts (2026-08-25, QAPI v0.1) so
// app/qapi/page.tsx reuses the exact same "what does this rollup mean"
// logic rather than duplicating it — this page and that one must never
// silently disagree about what a status or a resolution link means.

function statusHref(domain: AuditReadinessDomainId | "all", status: AuditReadinessStatus | "all") {
  return auditReadinessRequirementsHref(domain, status);
}

export default async function AuditReadinessPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Audit Readiness">
        <p className="font-sans text-sm text-muted">You do not have permission to view Audit Readiness.</p>
      </PageContainer>
    );
  }

  // Client Readiness's population is scoped to the currently selected
  // community (Phase E/F, sections 16-17) — a single_community filter
  // returns only that community's active clients in one query; an
  // all_communities filter aggregates in one query too, never a loop that
  // computes each community separately before displaying one. Workforce
  // and Emergency Preparedness stay organization-wide, unaffected — see
  // getAuditReadinessDashboardData's own domain composition.
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const auditEligibleActiveClients = await getAuditEligibleActiveClientResidents(communityFilter);
  const data = await getAuditReadinessDashboardData(auditEligibleActiveClients);

  return (
    <PageContainer title="Audit Readiness">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-body">Audit Readiness</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Know what&apos;s ready, what isn&apos;t, and what needs attention before an audit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/audit-readiness/drills"
            className="font-sans text-sm font-medium text-navy hover:text-navy-light"
          >
            View Past Audits →
          </Link>
          <Link
            href="/audit-readiness/drills/new"
            className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light"
          >
            Start Audit Drill
          </Link>
        </div>
      </div>

      {/* ─── Where do our domains stand — permanent 3-card layout, same slot
          for every domain whether it's configured yet or not ─── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.domains.map((domain) => {
            const { satisfiedCount, applicableCount } = domainRequirementTotals(domain);
            return (
              <DomainReadinessCard
                key={domain.domainId}
                label={domain.label}
                configured={domain.configured}
                awaitingFirstSubject={domain.awaitingFirstSubject}
                readySubjectCount={domain.readySubjectCount}
                subjectCount={domain.subjectCount}
                requirementSatisfiedCount={satisfiedCount}
                requirementApplicableCount={applicableCount}
                requirementDetailHref={statusHref(domain.domainId, "all")}
                metricType={domain.domainId === "emergency_preparedness" ? "requirements" : "people"}
                subjectNoun={domain.domainId === "client_readiness" ? "client" : "employee"}
                explanation={
                  domain.domainId === "workforce"
                    ? 'Workforce Readiness is the percent of employees whose complete file is audit-ready. Requirement Completion is the percent of individual required items currently satisfied — one employee can be "not yet ready" while most of their individual items are already satisfied.'
                    : undefined
                }
              />
            );
          })}
        </div>
      </section>

      {/* ─── What specifically needs attention — grouped by domain, one
          subsection per configured domain only ─── */}
      <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Needs Attention</h2>
        <p className="mt-1 font-sans text-xs text-muted">Audit-readiness priorities.</p>
        <div className="mt-4 space-y-6">
          {data.domains.map((domain) => {
            // Agency-level domains (Emergency Preparedness today) have
            // exactly one subject — grouping by subject would collapse
            // every issue into one card. One AttentionCard per requirement
            // instead, matching "Annual Plan Review," "Risk Assessment,"
            // etc. as their own actionable items. Checked by domainId, not
            // by whether `issues` happens to be non-empty right now — an
            // agency-level domain with zero current issues is still
            // agency-level.
            const isAgencyLevel = domain.domainId === "emergency_preparedness";
            // Rank the FULL issue list, then group — never cap the
            // resulting card list at all. The headline rollup (subjectCount
            // - readySubjectCount) is computed independently from this same
            // population, so an arbitrary cap here — even applied AFTER
            // grouping — silently drops whichever subject/requirement ranks
            // lowest while the headline keeps counting them (regression:
            // Elliot Goldberg, ranked 9th of 9 Client Readiness subjects by
            // issue count, vanished from the section under a `.slice(0, 8)`
            // even though the headline still said "9 need attention"). The
            // rendered card count must always equal the headline count —
            // no separate calculation for one versus the other.
            const rankedIssues = domain.configured ? rankIssues([domain]) : [];
            const visibleAgencyIssues = isAgencyLevel ? rankedIssues : [];
            const domainGroups = domain.configured && !isAgencyLevel ? groupIssuesBySubject(rankedIssues) : [];

            return (
              <div key={domain.domainId}>
                <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">{needsAttentionLabel(domain)}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {!domain.configured ? (
                    <ComingSoonAttentionCard />
                  ) : domain.awaitingFirstSubject ? (
                    <AwaitingFirstSubjectAttentionCard message={awaitingFirstSubjectMessage(domain)} />
                  ) : isAgencyLevel ? (
                    visibleAgencyIssues.length === 0 ? (
                      <AllClearAttentionCard message={allClearMessage(domain)} />
                    ) : (
                      visibleAgencyIssues.map((issue) => (
                        <AttentionCard
                          key={`${issue.subjectId}-${issue.requirementCode}`}
                          name={issue.requirementName}
                          itemCount={1}
                          href={resolveIssueHref(issue)}
                        />
                      ))
                    )
                  ) : domainGroups.length === 0 ? (
                    <AllClearAttentionCard message={allClearMessage(domain)} />
                  ) : (
                    domainGroups.map((group) => (
                      <AttentionCard
                        key={group.subjectId}
                        name={group.subjectLabel}
                        itemCount={group.issues.length}
                        href={
                          group.issues.length === 1
                            ? resolveIssueHref(group.issues[0])
                            : group.subjectType === "workforce_member"
                              ? `${group.subjectHref}#employee-record-audit`
                              : group.subjectHref
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </PageContainer>
  );
}

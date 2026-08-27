import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canViewAuditReadiness } from "@/lib/compliance/permissions";
import {
  AUDIT_READINESS_STATUS_LABELS,
  AUDIT_READINESS_STATUS_TONES,
  getAuditReadinessDashboardData,
  type AuditReadinessDomainId,
} from "@/lib/compliance/auditReadinessDashboard";
import type { AuditReadinessStatus } from "@/lib/compliance/auditReadinessStatus";
import { getAuditEligibleActiveClientResidents } from "@/lib/data/residentServeRelationships";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The summary -> requirement -> subject -> evidence drill-down path.
// Deliberately not a new requirement-detail UI: each row already carries
// the "why" (explanation, authority, latest evidence summary) inline, and
// the "Open record" link takes the user to the owning domain's own page
// (e.g. RequirementResolutionCard on /workforce/[id]), where the full
// evidence history/verification/playbook already lives — never
// duplicated here.
export default async function AuditReadinessRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; status?: string }>;
}) {
  const [{ domain, status }, profile] = await Promise.all([searchParams, getCurrentAuthorizedUser()]);

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Requirements">
        <p className="font-sans text-sm text-muted">You do not have permission to view Audit Readiness.</p>
      </PageContainer>
    );
  }

  // Same community scoping as /audit-readiness itself (Phase E/F, sections
  // 16-17) — this drill-down must reflect the same population, never a
  // broader one.
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const auditEligibleActiveClients = await getAuditEligibleActiveClientResidents(communityFilter);
  const data = await getAuditReadinessDashboardData(auditEligibleActiveClients);
  let issues = data.domains.flatMap((d) => d.issues);
  if (domain) issues = issues.filter((i) => i.domain === (domain as AuditReadinessDomainId));
  if (status) issues = issues.filter((i) => i.status === (status as AuditReadinessStatus));

  return (
    <PageContainer title="Requirements">
      <div className="mb-6">
        <Link href="/audit-readiness" className="font-sans text-sm font-medium text-navy hover:text-navy-light">
          ← Audit Readiness
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-light text-body">
          Requirements
          {domain && <span className="ml-2 text-lg text-muted">· {domain.replace(/_/g, " ")}</span>}
          {status && <span className="ml-2 text-lg text-muted">· {AUDIT_READINESS_STATUS_LABELS[status as AuditReadinessStatus] ?? status}</span>}
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">{issues.length} matching requirement/subject pair{issues.length === 1 ? "" : "s"}.</p>
      </div>

      <div className="rounded-xl border border-ivory-border bg-white p-5">
        {issues.length === 0 ? (
          <p className="font-sans text-sm text-muted">Nothing matches this filter.</p>
        ) : (
          <ul className="space-y-4">
            {issues.map((issue) => (
              <li key={`${issue.subjectId}-${issue.requirementCode}`} className="border-b border-ivory-border pb-4 last:border-b-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-semibold text-body">{issue.requirementName}</p>
                    <p className="mt-0.5 font-sans text-xs text-muted">
                      {issue.requirementCode}
                      {issue.regulatoryAuthority && ` · ${issue.regulatoryAuthority}`}
                    </p>
                    <p className="mt-1 font-sans text-sm text-body">{issue.explanation}</p>
                    {issue.latestEvidence && (
                      <p className="mt-1 font-sans text-xs text-muted">
                        Latest evidence: {issue.latestEvidence.verification_status.replace(/_/g, " ")}
                        {issue.latestEvidence.result && ` · ${issue.latestEvidence.result.replace(/_/g, " ")}`}
                        {issue.latestEvidence.expiration_date && ` · expires ${new Date(issue.latestEvidence.expiration_date).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={AUDIT_READINESS_STATUS_TONES[issue.status]}>{AUDIT_READINESS_STATUS_LABELS[issue.status]}</Badge>
                    <LinkButton href={issue.subjectHref} size="small">
                      {issue.subjectLabel} →
                    </LinkButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

import { Badge } from "@/components/ui/Badge";
import { DomainReadinessCard } from "./DomainReadinessCard";
import { AllClearAttentionCard, AttentionCard, AwaitingFirstSubjectAttentionCard, ComingSoonAttentionCard } from "./AttentionCard";
import { groupIssuesBySubject, rankIssues, type DomainReadinessRollup, type SubjectIssueGroup } from "@/lib/compliance/auditReadinessDashboard";
import { allClearMessage, awaitingFirstSubjectMessage, domainRequirementTotals, resolveIssueHref } from "@/lib/compliance/auditReadinessDisplay";
import { CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES } from "@/lib/clientReadiness/constants";

// Office Staff People Readiness v0.1 — evolved from WorkforceReadinessView,
// which this supersedes. The entire office_staff branch of
// app/audit-readiness/page.tsx renders this and nothing else. Built
// exclusively from the two rollups passed in (getClientReadinessDomainRollup()
// + getWorkforceDomainRollup() — no Emergency Preparedness,
// corrective-action-composition, or recent-documents data ever reaches this
// component), reusing the same DomainReadinessCard/AttentionCard/
// AllClearAttentionCard/ComingSoonAttentionCard/AwaitingFirstSubjectAttentionCard
// the full Governance dashboard already uses for its own cards — no new
// readiness math, no second compliance evaluator.
//
// Two things deliberately NOT reused from the full dashboard's own
// sections, same as WorkforceReadinessView before it:
//   - DomainReadinessCard's requirementDetailHref is omitted entirely —
//     /audit-readiness/requirements is canViewAuditReadiness-gated and
//     would 403 for office_staff.
//   - AttentionCard's actionLabel: for Workforce, always "Review & Update →"
//     (every Workforce issue is a document office_staff can upload/replace).
//     For Client Readiness, computed per-subject-group below — a group
//     containing at least one document-backed requirement still reads
//     "Review & Update →" (there is real work office_staff can do), but a
//     group whose issues are ALL attestation/governed requirements (Client
//     Profile, Triage Classification, Medication List, Care Documentation —
//     office_staff can view but never resolve) reads "View Status →"
//     instead, so the card never implies a resolution capability
//     office_staff doesn't have.
function clientGroupActionLabel(group: SubjectIssueGroup): string {
  const hasDocumentBackedIssue = group.issues.some((issue) => !CLIENT_READINESS_ATTESTATION_REQUIREMENT_CODES.has(issue.requirementCode));
  return hasDocumentBackedIssue ? "Review & Update →" : "View Status →";
}

function ReadinessStatusLegend() {
  return (
    <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
      <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">How to read a requirement&apos;s status</h2>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Badge tone="danger">Missing</Badge>
          <dd className="mt-1.5 font-sans text-xs text-muted">No document is on file yet. Upload one from the record.</dd>
        </div>
        <div>
          <Badge tone="blue">Awaiting Verification</Badge>
          <dd className="mt-1.5 font-sans text-xs text-muted">
            A document was uploaded and is waiting for an authorized reviewer to verify it — not yet Ready.
          </dd>
        </div>
        <div>
          <Badge tone="success">Ready</Badge>
          <dd className="mt-1.5 font-sans text-xs text-muted">The document has been verified. The requirement is satisfied.</dd>
        </div>
      </dl>
    </section>
  );
}

function DomainSection({
  domain,
  subjectNoun,
  explanation,
  needsAttentionTitle,
  needsAttentionDescription,
  actionLabel,
}: {
  domain: DomainReadinessRollup;
  subjectNoun: string;
  explanation: string;
  needsAttentionTitle: string;
  needsAttentionDescription: string;
  actionLabel: (group: SubjectIssueGroup) => string;
}) {
  const { satisfiedCount, applicableCount } = domainRequirementTotals(domain);
  const rankedIssues = domain.configured ? rankIssues([domain]) : [];
  const domainGroups = domain.configured ? groupIssuesBySubject(rankedIssues) : [];

  return (
    <>
      <section className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:max-w-md">
          <DomainReadinessCard
            label={domain.label}
            configured={domain.configured}
            awaitingFirstSubject={domain.awaitingFirstSubject}
            readySubjectCount={domain.readySubjectCount}
            subjectCount={domain.subjectCount}
            requirementSatisfiedCount={satisfiedCount}
            requirementApplicableCount={applicableCount}
            subjectNoun={subjectNoun}
            explanation={explanation}
          />
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">{needsAttentionTitle}</h2>
        <p className="mt-1 font-sans text-xs text-muted">{needsAttentionDescription}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!domain.configured ? (
            <ComingSoonAttentionCard />
          ) : domain.awaitingFirstSubject ? (
            <AwaitingFirstSubjectAttentionCard message={awaitingFirstSubjectMessage(domain)} />
          ) : domainGroups.length === 0 ? (
            <AllClearAttentionCard message={allClearMessage(domain)} />
          ) : (
            domainGroups.map((group) => (
              <AttentionCard
                key={group.subjectId}
                name={group.subjectLabel}
                itemCount={group.issues.length}
                // Same rule the full dashboard's Needs Attention section
                // already uses: a single issue deep-links straight to that
                // requirement; more than one lands on the subject's own
                // record generally, since there's no single requirement to
                // jump to.
                href={group.issues.length === 1 ? resolveIssueHref(group.issues[0]) : group.subjectHref}
                actionLabel={actionLabel(group)}
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

export function PeopleReadinessView({
  clientDomain,
  workforceDomain,
}: {
  clientDomain: DomainReadinessRollup;
  workforceDomain: DomainReadinessRollup;
}) {
  return (
    <>
      <ReadinessStatusLegend />

      <h2 className="mb-3 font-serif text-xl font-light text-body">Client Readiness</h2>
      <DomainSection
        domain={clientDomain}
        subjectNoun="client"
        explanation="The documents you upload directly determine a client's readiness. Uploading a document does not make a requirement Ready by itself — it moves to Awaiting Verification until an authorized reviewer confirms it. A few requirements (Client Profile, Triage Classification, Medication List, Care Documentation) are confirmed by an authorized reviewer directly and are shown here for status only."
        needsAttentionTitle="Needs Attention"
        needsAttentionDescription="Clients with a missing or unverified requirement."
        actionLabel={clientGroupActionLabel}
      />

      <h2 className="mb-3 font-serif text-xl font-light text-body">Workforce Readiness</h2>
      <DomainSection
        domain={workforceDomain}
        subjectNoun="employee"
        explanation="The personnel documents you upload directly determine a caregiver's workforce audit readiness. Uploading a document does not make a requirement Ready by itself — it moves to Awaiting Verification until an authorized reviewer confirms it."
        needsAttentionTitle="Needs Attention"
        needsAttentionDescription="Caregivers with a missing or unverified personnel document."
        actionLabel={() => "Review & Update →"}
      />
    </>
  );
}

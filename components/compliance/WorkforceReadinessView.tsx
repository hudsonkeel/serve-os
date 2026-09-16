import { Badge } from "@/components/ui/Badge";
import { DomainReadinessCard } from "./DomainReadinessCard";
import { AllClearAttentionCard, AttentionCard, ComingSoonAttentionCard } from "./AttentionCard";
import { groupIssuesBySubject, rankIssues, type DomainReadinessRollup } from "@/lib/compliance/auditReadinessDashboard";
import { allClearMessage, domainRequirementTotals, resolveIssueHref } from "@/lib/compliance/auditReadinessDisplay";

// Scoped Workforce Audit Readiness for office_staff — the entire
// office_staff branch of app/audit-readiness/page.tsx renders this and
// nothing else. Built exclusively from the one Workforce rollup passed in
// (getWorkforceDomainRollup() — no Client Readiness, Emergency
// Preparedness, corrective-action, or drill data ever reaches this
// component), reusing the same DomainReadinessCard/AttentionCard/
// AllClearAttentionCard/ComingSoonAttentionCard the full Governance
// dashboard already uses for its own Workforce card — no new readiness
// math, no second compliance evaluator.
//
// Two things are deliberately NOT reused from the full dashboard's
// Workforce section:
//   - DomainReadinessCard's requirementDetailHref is omitted entirely —
//     /audit-readiness/requirements is canViewAuditReadiness-gated and
//     would 403 for office_staff.
//   - AttentionCard's actionLabel is overridden to "Review & Update →" —
//     "Review & Resolve" implies verify/reject authority office_staff
//     does not have; only the label changes, via a prop, not a rewrite of
//     the shared component's default for every other caller.
export function WorkforceReadinessView({ domain }: { domain: DomainReadinessRollup }) {
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
            subjectNoun="employee"
            explanation="The personnel documents you upload directly determine a caregiver's workforce audit readiness. Uploading a document does not make a requirement Ready by itself — it moves to Awaiting Verification until an authorized reviewer confirms it."
          />
        </div>
      </section>

      {/* Explains the three states an office_staff user will actually see
          on a caregiver's Employee Record Audit — the exact distinction
          this scoped view exists to teach, since "Needs Attention" alone
          doesn't say whether a requirement is missing evidence or already
          has some, just not yet verified. */}
      <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">How to read a requirement&apos;s status</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Badge tone="danger">Missing</Badge>
            <dd className="mt-1.5 font-sans text-xs text-muted">No document is on file yet. Upload one from the caregiver&apos;s record.</dd>
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

      <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Needs Attention</h2>
        <p className="mt-1 font-sans text-xs text-muted">
          Caregivers with a missing or unverified personnel document.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!domain.configured ? (
            <ComingSoonAttentionCard />
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
                // requirement (?requirement=code#employee-record-audit);
                // more than one lands on the Employee Record Audit section
                // generally, since there's no single requirement to jump
                // to.
                href={
                  group.issues.length === 1
                    ? resolveIssueHref(group.issues[0])
                    : `${group.subjectHref}#employee-record-audit`
                }
                actionLabel="Review & Update →"
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { QapiDomainNoteEditor } from "@/components/qapi/QapiDomainNoteEditor";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canManageCorrectiveActions, canViewAuditReadiness } from "@/lib/compliance/permissions";
import { getAuditReadinessDashboardData } from "@/lib/compliance/auditReadinessDashboard";
import { auditReadinessRequirementsHref, needsAttentionLabel } from "@/lib/compliance/auditReadinessDisplay";
import { getAuditEligibleActiveClientResidents } from "@/lib/data/residentServeRelationships";
import { getQapiDomainNotes } from "@/lib/data/qapiDomainNotes";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import {
  buildQapiImprovementBuckets,
  getEmergencyPreparednessImprovementWork,
  qualityContextSummary,
  qualityPriorityLine,
  QAPI_DOMAIN_ID_FOR_BUCKET,
} from "@/lib/qapi/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// QAPI v0.1 (2026-08-25, revised 2026-08-25 — see DECISION_LOG.md for the
// hierarchy change). This page is deliberately NOT a second Audit Readiness
// dashboard: it answers "where are our quality concerns, and what are we
// doing about them," while Audit Readiness answers "who/what isn't ready."
// Current Quality Context and Current Quality Priorities below are
// intentionally coarse (domain-level counts and one-line summaries, no
// per-subject/per-requirement cards) and always point back to Audit
// Readiness or the owning native module for individual resolution — see
// lib/qapi/dashboard.ts's qualityContextSummary()/qualityPriorityLine() for
// exactly what each line means and why it stops short of a full breakdown.
// Active Improvement Work is the primary body: the same composed
// corrective-action list Audit Readiness's dashboard already produces,
// grouped into three domain buckets by buildQapiImprovementBuckets() — a
// pure regrouping of existing data, never a new action model. Each domain
// block also carries a "What We're Doing" leadership note (QapiDomainNoteEditor,
// backed by lib/data/qapiDomainNotes.ts) — the human-context layer system
// data alone can't provide (e.g. "revising the P&P to make EPRP its own
// governed document"). Deliberately kept out of the compact Current Quality
// Context cards above, per explicit product direction.

export default async function QapiPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Quality (QAPI)">
        <p className="font-sans text-sm text-muted">You do not have permission to view Quality (QAPI).</p>
      </PageContainer>
    );
  }

  const canEditNotes = canManageCorrectiveActions(profile?.role ?? null);

  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const [auditEligibleActiveClients, improvementWork, notes] = await Promise.all([
    getAuditEligibleActiveClientResidents(communityFilter),
    getEmergencyPreparednessImprovementWork(),
    getQapiDomainNotes(),
  ]);
  const data = await getAuditReadinessDashboardData(auditEligibleActiveClients);
  const buckets = buildQapiImprovementBuckets(data.correctiveActions, improvementWork);

  return (
    <PageContainer title="Quality (QAPI)">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-light text-body">Quality (QAPI)</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Where our quality concerns are, and what we&apos;re doing about them — a current, point-in-time view, not yet a trend.
        </p>
      </div>

      {/* ─── 1. Current Quality Context — coarse, domain-level orientation
          only. No percentage breakdown, no requirement completion figure —
          that detail lives in Audit Readiness. ─── */}
      <section className="mb-6">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Current Quality Context</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.domains.map((domain) => (
            <div key={domain.domainId} className="rounded-xl border border-ivory-border bg-white p-4">
              <p className="font-sans text-sm font-semibold text-body">{domain.label}</p>
              <p className="mt-1 font-sans text-sm text-muted">{qualityContextSummary(domain)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 2. Current Quality Priorities — one row per domain: how many
          items need attention, and a direct link to Audit Readiness for
          individual resolution. No per-subject or per-requirement cards. ─── */}
      <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Current Quality Priorities</h2>
        <p className="mt-1 font-sans text-xs text-muted">Resolve individual items in Audit Readiness or the owning module.</p>
        <div className="mt-4 space-y-2">
          {data.domains.map((domain) => (
            <div key={domain.domainId} className="flex items-center justify-between rounded-lg border border-ivory-border px-4 py-3">
              <div>
                <p className="font-sans text-sm font-medium text-body">{needsAttentionLabel(domain)}</p>
                <p className="mt-0.5 font-sans text-xs text-muted">{qualityPriorityLine(domain)}</p>
              </div>
              <Link
                href={auditReadinessRequirementsHref(domain.domainId, "all")}
                className="shrink-0 font-sans text-xs font-medium text-navy hover:text-navy-light"
              >
                Review in Audit Readiness →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 3. Active Improvement Work — the primary body. One block per
          domain: label + native link (always visible), the human-authored
          "What We're Doing" leadership note (always visible — this is the
          human-context layer System-derived data alone can't provide, e.g.
          "revising the P&P to make EPRP its own governed document"), then
          System-Tracked Work — the same composed corrective-action list
          (plus EPRP review notes, folded into the Emergency Preparedness
          bucket) — collapsed by default via native <details>, so no
          client-side state is needed for that part. ─── */}
      <section className="mb-8 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Active Improvement Work</h2>
        <p className="mt-1 font-sans text-xs text-muted">What Serve is already doing about it.</p>

        <div className="mt-4 space-y-4">
          {buckets.map((bucket) => {
            const domainId = QAPI_DOMAIN_ID_FOR_BUCKET[bucket.id];
            return (
              <div key={bucket.id} className="rounded-lg border border-ivory-border">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="font-sans text-sm font-semibold text-body">{bucket.label}</p>
                  <Link href={auditReadinessRequirementsHref(domainId, "all")} className="shrink-0 font-sans text-xs font-medium text-navy hover:text-navy-light">
                    Review in Audit Readiness →
                  </Link>
                </div>

                <div className="border-t border-ivory-border px-4 py-3">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">What We&apos;re Doing</p>
                  <div className="mt-1.5">
                    <QapiDomainNoteEditor domainId={domainId} note={notes[domainId]} canEdit={canEditNotes} />
                  </div>
                </div>

                <details className="border-t border-ivory-border">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-sans text-sm font-medium text-body">
                    <span className="flex items-center gap-2">
                      System-Tracked Work
                      <Badge tone={bucket.itemCount > 0 ? "warning" : "neutral"}>
                        {bucket.itemCount} active item{bucket.itemCount === 1 ? "" : "s"}
                      </Badge>
                    </span>
                    <span className="font-sans text-xs font-normal text-muted">{bucket.summary}</span>
                  </summary>

                  <div className="border-t border-ivory-border px-4 py-3">
                    {bucket.correctiveActions.length === 0 && bucket.reviewNotes.length === 0 ? (
                      <p className="font-sans text-sm text-muted">No active items.</p>
                    ) : (
                      <div className="space-y-2">
                        {bucket.correctiveActions.map((action) => (
                          <div key={action.id} className="rounded-lg border border-ivory-border p-3">
                            <p className="font-sans text-sm font-medium text-body">{action.title}</p>
                            <p className="mt-0.5 font-sans text-xs text-muted">{action.reason}</p>
                            <p className="mt-1 font-sans text-xs text-subtle">
                              {action.priority} priority{action.dueAt ? ` · due ${action.dueAt}` : ""} ·{" "}
                              {action.source === "workforce" ? "Workforce" : "Audit Readiness"}
                            </p>
                          </div>
                        ))}
                        {bucket.reviewNotes.length > 0 && (
                          <div>
                            <p className="mt-2 font-sans text-xs font-semibold uppercase tracking-wide text-subtle">
                              Emergency Preparedness Review Notes
                            </p>
                            <div className="mt-2 space-y-2">
                              {bucket.reviewNotes.map((item) => (
                                <div key={item.id} className="rounded-lg border border-ivory-border p-3">
                                  <p className="font-sans text-sm font-medium text-body">{item.title}</p>
                                  {item.detail && <p className="mt-0.5 font-sans text-xs text-muted">{item.detail}</p>}
                                  <p className="mt-1 font-sans text-xs text-subtle">
                                    Recorded by {item.createdBy} · {new Date(item.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── 4. Coming Soon — honest placeholders, never simulated data.
          Both are blocked on infrastructure that genuinely does not exist
          yet (see the QAPI discovery report). ─── */}
      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Coming Soon</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-ivory-border bg-ivory-warm p-4">
            <p className="font-sans text-sm font-semibold text-subtle">What&apos;s Coming Due</p>
            <p className="mt-1 font-sans text-xs text-muted">
              Requires a cadence/recurrence engine that does not exist yet — Serve OS cannot currently distinguish &quot;not yet due&quot; from
              &quot;never done.&quot;
            </p>
          </div>
          <div className="rounded-xl border border-ivory-border bg-ivory-warm p-4">
            <p className="font-sans text-sm font-semibold text-subtle">Did It Work</p>
            <p className="mt-1 font-sans text-xs text-muted">
              Requires corrective-action effectiveness follow-up that does not exist yet — closing an action today does not verify the fix held.
            </p>
          </div>
        </div>
      </section>
    </PageContainer>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canRunAuditDrill, canViewAuditReadiness } from "@/lib/compliance/permissions";
import { canAccessWorkforceDocuments } from "@/lib/workforce/permissions";
import { getAuditSessionById, getAuditSessionItems } from "@/lib/data/auditSessions";
import {
  composeAuditSessionItemView,
  getAuditDrillScopeOptions,
  getAuditSessionFollowUpSummary,
  getCorrectedSessionView,
  getRequirementsForSubject,
  resolveItemCorrectionDescriptions,
  type AuditSessionFollowUpSummary,
} from "@/lib/compliance/auditDrillView";
import { deriveAuditReadinessStatus, type AuditReadinessSetEvaluation } from "@/lib/compliance/auditReadinessStatus";
import { AUDIT_READINESS_STATUS_LABELS, AUDIT_READINESS_STATUS_TONES } from "@/lib/compliance/auditReadinessDashboard";
import { formatCentralDateTime } from "@/lib/utils/date";
import { RecordAuditFindingDialog } from "@/components/compliance/RecordAuditFindingDialog";
import { CreateWorkforceCorrectiveActionDialog } from "@/components/compliance/CreateWorkforceCorrectiveActionDialog";
import { EvidenceViewButton } from "@/components/compliance/EvidenceViewButton";
import { CompleteAuditDrillForm } from "@/components/compliance/CompleteAuditDrillForm";
import { CorrectionHistory, type CorrectionHistoryEntry } from "@/components/compliance/CorrectionHistory";
import type { AuditSessionItem, AuditSessionItemCorrection, AuditSessionItemFinding } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FINDING_LABELS: Record<AuditSessionItem["finding"], string> = {
  pass: "Pass",
  fail: "Fail",
  evidence_missing: "Evidence Missing",
  needs_review: "Needs Review",
};

function resolveHref(subjectId: string, requirementCode: string): string {
  return `/workforce/${subjectId}?requirement=${encodeURIComponent(requirementCode)}#employee-record-audit`;
}

function followUpLine(summary: AuditSessionFollowUpSummary): string {
  if (summary.totalCount === 0) return "No follow-up needed";
  if (summary.openCount === 0) return `${summary.resolvedCount} resolved`;
  return `${summary.openCount} open, ${summary.resolvedCount} resolved`;
}

export default async function AuditDrillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ subject?: string }>;
}) {
  const [{ id }, { subject: selectedSubjectId }, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentAuthorizedUser(),
  ]);

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Audit Drill">
        <p className="font-sans text-sm text-muted">You do not have permission to view this audit.</p>
      </PageContainer>
    );
  }

  const [session, items] = await Promise.all([getAuditSessionById(id), getAuditSessionItems(id)]);
  if (!session) notFound();

  const isCompleted = session.status === "completed";
  const canOperateDrill = canRunAuditDrill(profile?.role ?? null);
  const canRun = !isCompleted && canOperateDrill;
  const canViewDocuments = canAccessWorkforceDocuments(profile?.role ?? null);

  return (
    <PageContainer title={session.name}>
      <div className="mb-6">
        <Link href="/audit-readiness/drills" className="font-sans text-sm text-navy hover:text-navy-light">
          ← Audit Drills
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl font-light text-body">{session.name}</h1>
            <p className="mt-1 font-sans text-sm text-muted">
              Auditor: {session.auditor} · Started {formatCentralDateTime(session.started_at)}
            </p>
          </div>
          <Badge tone={isCompleted ? "success" : "blue"}>{isCompleted ? "Completed" : "In Progress"}</Badge>
        </div>
      </div>

      {isCompleted ? (
        <CompletedDrillView session={session} canViewDocuments={canViewDocuments} canAmend={canOperateDrill} />
      ) : (
        <ActiveDrillView
          session={session}
          items={items}
          selectedSubjectId={selectedSubjectId}
          canRun={canRun}
          canViewDocuments={canViewDocuments}
        />
      )}
    </PageContainer>
  );
}

function describeItemCorrection(ic: AuditSessionItemCorrection, requirementName: string, subjectLabel: string): string {
  if (ic.change_type === "added") {
    return `Added during correction: ${requirementName} for ${subjectLabel} — ${ic.new_finding ? FINDING_LABELS[ic.new_finding] : "—"}`;
  }
  if (ic.change_type === "removed") {
    return `Removed (entered in error): ${requirementName} for ${subjectLabel}`;
  }
  const parts: string[] = [];
  if (ic.previous_finding !== ic.new_finding) {
    const prev = ic.previous_finding ? FINDING_LABELS[ic.previous_finding] : "—";
    const next = ic.new_finding ? FINDING_LABELS[ic.new_finding] : "—";
    parts.push(`Finding changed ${prev} → ${next}`);
  }
  if (ic.previous_notes !== ic.new_notes) parts.push("Notes changed");
  return `${requirementName} for ${subjectLabel}: ${parts.length > 0 ? parts.join(", ") : "no change"}`;
}

async function CompletedDrillView({
  session,
  canViewDocuments,
  canAmend,
}: {
  session: { id: string; auditor: string; completed_at: string | null; summary: string | null };
  canViewDocuments: boolean;
  canAmend: boolean;
}) {
  const [corrected, followUp] = await Promise.all([
    getCorrectedSessionView(session.id),
    getAuditSessionFollowUpSummary(session.id),
  ]);

  const effectiveEntries = corrected.items.filter((v) => !v.isRemoved);
  const outcomeCounts = { pass: 0, fail: 0, evidence_missing: 0, needs_review: 0 } as Record<AuditSessionItemFinding, number>;
  const subjectIds = new Set<string>();
  for (const v of effectiveEntries) {
    if (v.effectiveFinding) outcomeCounts[v.effectiveFinding] += 1;
    subjectIds.add(v.item?.subject_id ?? v.subjectHref ?? v.subjectLabel);
  }

  const latestCorrection = corrected.corrections.at(-1) ?? null;

  const resolvedItemCorrections = await resolveItemCorrectionDescriptions(corrected.itemCorrections);
  const historyEntries: CorrectionHistoryEntry[] = corrected.corrections.map((c) => ({
    actor: c.actor,
    createdAt: formatCentralDateTime(c.created_at) ?? c.created_at,
    rationale: c.rationale,
    changeLines: resolvedItemCorrections
      .filter((r) => r.itemCorrection.correction_id === c.id)
      .map((r) => describeItemCorrection(r.itemCorrection, r.requirementName, r.subjectLabel)),
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-ivory-border bg-success-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-sans text-sm font-semibold text-success-text">
              Completed {session.completed_at ? formatCentralDateTime(session.completed_at) : ""} by {session.auditor}
            </p>
            {latestCorrection && (
              <p className="mt-0.5 font-sans text-sm font-semibold text-warning-text">
                Corrected {formatCentralDateTime(latestCorrection.created_at)} by {latestCorrection.actor}
              </p>
            )}
          </div>
          {canAmend && (
            <Link
              href={`/audit-readiness/drills/${session.id}/correct`}
              className="shrink-0 rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
            >
              Correct Audit
            </Link>
          )}
        </div>
        {session.summary && <p className="mt-2 font-sans text-sm text-body">{session.summary}</p>}
        <p className="mt-3 font-sans text-sm text-body">
          {effectiveEntries.length} requirement{effectiveEntries.length === 1 ? "" : "s"} reviewed across{" "}
          {subjectIds.size} {subjectIds.size === 1 ? "person" : "people"} — {outcomeCounts.pass} pass
          {outcomeCounts.fail > 0 && `, ${outcomeCounts.fail} fail`}
          {outcomeCounts.evidence_missing > 0 && `, ${outcomeCounts.evidence_missing} evidence missing`}
          {outcomeCounts.needs_review > 0 && `, ${outcomeCounts.needs_review} needs review`}. Follow-up:{" "}
          {followUpLine(followUp)}.
        </p>
        <p className="mt-2 font-sans text-xs text-success-text">
          The original audit — what was actually reviewed — is preserved unchanged underneath this view; it never
          reflects later changes to Workforce or other domain data.
        </p>
        <CorrectionHistory entries={historyEntries} />
      </section>

      <section className="rounded-xl border border-ivory-border bg-white">
        {effectiveEntries.length === 0 ? (
          <p className="p-5 font-sans text-sm text-muted">No findings were recorded in this audit.</p>
        ) : (
          <ul className="divide-y divide-ivory-border">
            {effectiveEntries.map((v, i) => (
              <li key={v.item?.id ?? `added-${i}`} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-sans text-sm font-medium text-body">
                        {v.requirement?.name ?? v.latestItemCorrection?.requirement_id}
                      </p>
                      {v.isAdded && <Badge tone="warning">Added during correction</Badge>}
                      {v.isCorrected && <Badge tone="blue">Corrected</Badge>}
                    </div>
                    <p className="mt-0.5 font-sans text-xs text-muted">
                      {v.subjectHref ? (
                        <Link href={v.subjectHref} className="text-navy hover:text-navy-light">
                          {v.subjectLabel}
                        </Link>
                      ) : (
                        v.subjectLabel
                      )}
                      {v.isAdded && v.latestCorrectionEvent && (
                        <> · added by {v.latestCorrectionEvent.actor}, {formatCentralDateTime(v.latestCorrectionEvent.created_at)}</>
                      )}
                    </p>
                    {v.isCorrected && v.item && (
                      <p className="mt-1 font-sans text-xs text-subtle line-through">
                        Originally: {v.item.finding ? FINDING_LABELS[v.item.finding] : "—"}
                        {v.item.notes ? ` — ${v.item.notes}` : ""}
                      </p>
                    )}
                    {v.effectiveNotes && <p className="mt-2 font-sans text-sm text-body">{v.effectiveNotes}</p>}
                    {v.evidence && (
                      <p className="mt-2 font-sans text-xs text-muted">
                        Evidence reviewed: {v.evidence.verification_status.replace(/_/g, " ")}
                        {v.evidence.result ? ` — ${v.evidence.result.replace(/_/g, " ")}` : ""}, recorded{" "}
                        {new Date(v.evidence.created_at).toLocaleDateString()}
                        {canViewDocuments && v.evidence.document_id && (
                          <>
                            {" · "}
                            <EvidenceViewButton documentId={v.evidence.document_id} />
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <Badge tone={v.effectiveFinding === "pass" ? "success" : v.effectiveFinding === "fail" ? "danger" : "warning"}>
                    {v.effectiveFinding ? FINDING_LABELS[v.effectiveFinding] : "—"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function ActiveDrillView({
  session,
  items,
  selectedSubjectId,
  canRun,
  canViewDocuments,
}: {
  session: { id: string; scope_domains: string[] };
  items: AuditSessionItem[];
  selectedSubjectId: string | undefined;
  canRun: boolean;
  canViewDocuments: boolean;
}) {
  const scopeOptions = await getAuditDrillScopeOptions();
  const inScope = scopeOptions.filter((o) => o.configured && session.scope_domains.includes(o.domainId));

  const outcomeCounts = { pass: 0, fail: 0, evidence_missing: 0, needs_review: 0 } as Record<AuditSessionItem["finding"], number>;
  const subjectIds = new Set<string>();
  for (const item of items) {
    outcomeCounts[item.finding] += 1;
    subjectIds.add(item.subject_id);
  }
  const followUp = canRun ? await getAuditSessionFollowUpSummary(session.id) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Subjects</h2>
        {inScope.length === 0 ? (
          <p className="mt-2 font-sans text-sm text-muted">No configured domains in this audit&apos;s scope.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {inScope.map((domain) => (
              <div key={domain.domainId}>
                <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">{domain.label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {domain.subjects.map((s) => (
                    <Link
                      key={s.subjectId}
                      href={`/audit-readiness/drills/${session.id}?subject=${s.subjectId}`}
                      className={`rounded-full border px-3 py-1.5 font-sans text-sm ${
                        selectedSubjectId === s.subjectId
                          ? "border-navy bg-navy text-white"
                          : "border-ivory-border text-body hover:border-navy/30"
                      }`}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedSubjectId && (
        <SubjectRequirementsSection
          sessionId={session.id}
          subjectId={selectedSubjectId}
          items={items}
          canRun={canRun}
          canViewDocuments={canViewDocuments}
        />
      )}

      {canRun && followUp && (
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Complete Audit</h2>
          <p className="mt-1 font-sans text-xs text-muted">
            Once completed, this audit and every finding recorded in it become immutable.
          </p>
          <CompleteAuditDrillForm
            sessionId={session.id}
            summary={{
              totalItems: items.length,
              subjectCount: subjectIds.size,
              passCount: outcomeCounts.pass,
              failCount: outcomeCounts.fail,
              evidenceMissingCount: outcomeCounts.evidence_missing,
              needsReviewCount: outcomeCounts.needs_review,
              openFollowUpCount: followUp.openCount,
            }}
          />
        </section>
      )}
    </div>
  );
}

async function SubjectRequirementsSection({
  sessionId,
  subjectId,
  items,
  canRun,
  canViewDocuments,
}: {
  sessionId: string;
  subjectId: string;
  items: AuditSessionItem[];
  canRun: boolean;
  canViewDocuments: boolean;
}) {
  const { subjectLabel, requirements } = await getRequirementsForSubject("workforce_member", subjectId);
  const itemsForSubject = items.filter((i) => i.subject_type === "workforce_member" && i.subject_id === subjectId);
  const itemByRequirement = new Map(itemsForSubject.map((i) => [i.requirement_id, i]));

  const recordedViews = await Promise.all(
    itemsForSubject.map((item) => composeAuditSessionItemView(item))
  );
  const recordedViewByItemId = new Map(recordedViews.map((v) => [v.item.id, v]));

  return (
    <section className="rounded-xl border border-ivory-border bg-white p-5">
      <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">{subjectLabel}</h2>
      <p className="mt-1 font-sans text-xs text-muted">
        {requirements.length} requirement{requirements.length === 1 ? "" : "s"} — {itemsForSubject.length} recorded
        this audit.
      </p>

      <ul className="mt-4 divide-y divide-ivory-border">
        {requirements.map((evaluation) => {
          const existingItem = itemByRequirement.get(evaluation.requirement.id);

          if (existingItem) {
            const view = recordedViewByItemId.get(existingItem.id);
            // Any finding can carry an open follow-up — a PASS the auditor
            // verified outside Serve OS still needs its canonical file, and
            // that's a legitimate coexistence, not a contradiction.
            const canOfferFollowUp = canRun && !view?.workforceCorrectiveAction;
            return (
              <li key={evaluation.requirement.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-body">{evaluation.requirement.name}</p>
                    {existingItem.notes && <p className="mt-1 font-sans text-xs text-muted">{existingItem.notes}</p>}
                    {view?.evidence && canViewDocuments && view.evidence.document_id && (
                      <div className="mt-1">
                        <EvidenceViewButton documentId={view.evidence.document_id} />
                      </div>
                    )}
                    {view?.workforceCorrectiveAction && (
                      <p className="mt-1 font-sans text-xs text-muted">
                        Follow-up open: {view.workforceCorrectiveAction.title}
                      </p>
                    )}
                    <LinkButton href={resolveHref(subjectId, evaluation.requirement.requirement_code)} size="small" className="mt-1">
                      Resolve →
                    </LinkButton>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={existingItem.finding === "pass" ? "success" : existingItem.finding === "fail" ? "danger" : "warning"}>
                      {FINDING_LABELS[existingItem.finding]}
                    </Badge>
                    {canOfferFollowUp && (
                      <CreateWorkforceCorrectiveActionDialog
                        workforceMemberId={subjectId}
                        requirementId={evaluation.requirement.id}
                        requirementName={evaluation.requirement.name}
                        context={existingItem.finding === "pass" ? "pass" : "fail"}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          }

          const translated: AuditReadinessSetEvaluation = deriveAuditReadinessStatus({
            status: "complete",
            explanation: "",
            requirements: [evaluation],
          });
          const liveStatus = translated.requirements[0];

          return (
            <li key={evaluation.requirement.id} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-medium text-body">{evaluation.requirement.name}</p>
                  <p className="mt-0.5 font-sans text-xs text-muted">{liveStatus.explanation}</p>
                  {evaluation.latestEvidence && (
                    <p className="mt-1 font-sans text-xs text-subtle">
                      On file: {evaluation.latestEvidence.verification_status.replace(/_/g, " ")}
                      {evaluation.latestEvidence.result ? ` — ${evaluation.latestEvidence.result.replace(/_/g, " ")}` : ""},
                      recorded {new Date(evaluation.latestEvidence.created_at).toLocaleDateString()}
                      {canViewDocuments && evaluation.latestEvidence.document_id && (
                        <>
                          {" · "}
                          <EvidenceViewButton documentId={evaluation.latestEvidence.document_id} />
                        </>
                      )}
                    </p>
                  )}
                  <LinkButton href={resolveHref(subjectId, evaluation.requirement.requirement_code)} size="small" className="mt-1">
                    Resolve →
                  </LinkButton>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge tone={AUDIT_READINESS_STATUS_TONES[liveStatus.status]}>
                    {AUDIT_READINESS_STATUS_LABELS[liveStatus.status]}
                  </Badge>
                  {canRun && (
                    <RecordAuditFindingDialog
                      sessionId={sessionId}
                      requirementId={evaluation.requirement.id}
                      subjectType="workforce_member"
                      subjectId={subjectId}
                      evidenceId={evaluation.latestEvidence?.id ?? null}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

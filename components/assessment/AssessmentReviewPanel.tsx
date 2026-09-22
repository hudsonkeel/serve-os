"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveAssessment,
  generateAxisCarePreview,
  generateCinchProjection,
  resolveAssessmentConflict,
  type AxisCareClientCreatePreviewResult,
} from "@/lib/actions/assessmentIntelligence";
import {
  distinctFactValues,
  getDispositionableExceptions,
  isReviewReadyForApproval,
  buildApprovedFactsForReview,
  type ApprovedFactInput,
  type DraftFactForReview,
  type ReviewException,
} from "@/lib/assessmentIntelligence/reviewExceptions";
import { getFieldDefinition } from "@/lib/assessmentIntelligence/domainRegistry";
import type { AssessmentCoverageSummary } from "@/lib/assessmentIntelligence/coverage";
import {
  buildAssessmentProjection,
  mergeEffectiveFacts,
  approvedFactInputsToEffectiveFacts,
  type EffectiveFact,
  type FieldDisplayState,
  type ProjectedDomainSection,
} from "@/lib/assessmentIntelligence/assessmentProjection";
import type { AssessmentDocumentSnapshot } from "@/lib/assessmentIntelligence/assessmentSnapshot";
import { formatCentralTimestamp } from "@/lib/utils/date";
import { describeAxisCareClientCreatePayload } from "@/lib/integrations/axiscare/clientCreateSummary";
import { Badge } from "@/components/ui/Badge";
import { SECONDARY_BUTTON_SMALL_CLASS } from "@/components/ui/actionButtonStyles";
import { ChevronDown, ChevronRight } from "lucide-react";

// Client operationalization deliberately does NOT live here (Slice 1: Service Agreement ->
// Enrolled Inactive Client, 2026-09-15). Assessment approval must never be able to activate a
// client, or establish any relationship at all — it only produces knowledge (draft/approved
// facts, pricing, previews). A signed Service Agreement is what establishes the enrolled
// (Inactive) Client relationship — see lib/actions/clientEnrollment.ts. Activating an enrolled
// client (inactive_client -> active_client) is a separate, later, explicit action, not part of
// this slice.
//
// TWO-LAYER REVIEW (2026-09-17, Assessment Workflow Slice A): "Assessment" (the complete
// proposed professional assessment, domain-grouped) and "Needs Attention" (today's exception-
// only workflow, unchanged) are two views over the exact same underlying state — one set of
// clearFacts/exceptions/resolutions, one buildApprovedFactsForReview() computation, one Approve
// action. Neither tab is a second data model; both are projections of the same review state, so
// what the Assessment tab previews is provably what Approve actually submits. See docs/
// architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §11.

interface AssessmentReviewPanelProps {
  residentId: string;
  residentName: string;
  assessmentSessionId: string;
  sessionStatus: string;
  exceptions: ReviewException[];
  clearFacts: DraftFactForReview[];
  coverage: AssessmentCoverageSummary;
  /** Reliable canonical resident/profile facts (DOB, phone, physician, family contact, address)
   * — established before this conversation, never something the resident said today. Rendered
   * in the Assessment tab with a "From Serve profile" indicator, always visually distinguishable
   * from assessment-derived facts; never merged into clearFacts/exceptions, never submitted as
   * part of approval (approval only ever writes what this assessment itself established). */
  canonicalProfileFacts: EffectiveFact[];
  /** The immutable snapshot written at approval (Assessment Workflow Slice B) — null until this
   * session is approved. Once present, this is the SOLE rendering source for the approved/
   * read-only view below: never recomputed from the live clearFacts/exceptions/
   * canonicalProfileFacts props above, which stay mutable and would silently rewrite a
   * historical assessment's displayed content as the resident's profile changes after approval. */
  approvedSnapshot: AssessmentDocumentSnapshot | null;
}

// "fact:<draftFactId>" selects that specific conflicting fact's own value as correct — used for
// non-boolean conflicts, where "confirmed_yes"/"confirmed_no" would be meaningless (e.g. two
// different physician names).
type Resolution = "confirmed_yes" | "confirmed_no" | "leave_uncertain" | `fact:${string}`;

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "(no value)";
  return String(value);
}

// A conflict already durably resolved (assessment_fact_conflicts.resolved_fact_id, read on
// page load) must render as resolved without waiting for a click — hydrate local resolution
// state from the server-computed exceptions once, on mount, rather than starting blank and
// relying purely on this session's own clicks.
function initialResolutionsFromExceptions(exceptions: ReviewException[]): Record<string, Resolution> {
  const initial: Record<string, Resolution> = {};
  for (const exception of exceptions) {
    if (exception.kind === "conflicting" && exception.resolvedFactId) {
      initial[exception.fieldPath] = `fact:${exception.resolvedFactId}`;
    }
  }
  return initial;
}

const STATE_STYLES: Record<FieldDisplayState, { label: string; className: string }> = {
  yes: { label: "Yes", className: "bg-success-surface text-success-text" },
  no: { label: "No", className: "bg-ivory-warm text-body" },
  value: { label: "", className: "bg-blue-pale text-blue" },
  uncertain: { label: "Uncertain", className: "bg-warning-surface text-warning-text" },
  needs_follow_up: { label: "Needs follow-up", className: "bg-warning-surface text-warning-text" },
  not_discussed: { label: "Not discussed", className: "bg-ivory text-subtle" },
};

export function AssessmentReviewPanel({
  residentId,
  residentName,
  assessmentSessionId,
  sessionStatus,
  exceptions,
  clearFacts,
  coverage,
  canonicalProfileFacts,
  approvedSnapshot,
}: AssessmentReviewPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"assessment" | "needs_attention">("assessment");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() =>
    initialResolutionsFromExceptions(exceptions)
  );
  const [approved, setApproved] = useState(sessionStatus === "approved" || sessionStatus === "operationalized");
  const [pricingStatus, setPricingStatus] = useState<string | null>(null);
  const [axiscarePreview, setAxiscarePreview] = useState<AxisCareClientCreatePreviewResult | null>(null);
  const [cinchGenerated, setCinchGenerated] = useState(false);
  const [expandedFieldPath, setExpandedFieldPath] = useState<string | null>(null);

  const conflictingExceptions = exceptions.filter((e) => e.kind === "conflicting");
  const uncertainExceptions = exceptions.filter((e) => e.kind === "uncertain");

  function setResolution(fieldPath: string, resolution: Resolution) {
    setResolutions((prev) => ({ ...prev, [fieldPath]: resolution }));
  }

  // The single source of truth for "what does the current review state actually approve" --
  // recomputed live as resolutions change, so a just-resolved conflict or uncertain pick appears
  // correctly in the Assessment tab immediately, with no reload and no separate implementation
  // that could show something different from what Approve will actually submit.
  const approvedFactsPreview: ApprovedFactInput[] = useMemo(
    () => buildApprovedFactsForReview(clearFacts, exceptions, resolutions),
    [clearFacts, exceptions, resolutions]
  );

  const assessmentEffectiveFacts: EffectiveFact[] = useMemo(
    () => approvedFactInputsToEffectiveFacts(approvedFactsPreview),
    [approvedFactsPreview]
  );

  // Assessment facts always win over profile facts for the same field_path -- a profile fact
  // only fills a genuine gap this conversation never addressed; it never overrides, and is never
  // relabeled as though the resident said it today (mergeEffectiveFacts preserves each fact's
  // own source tag all the way to display).
  const mergedFacts = useMemo(
    () => mergeEffectiveFacts(assessmentEffectiveFacts, canonicalProfileFacts),
    [assessmentEffectiveFacts, canonicalProfileFacts]
  );

  // Exceptions requiring a reviewer disposition before approval (conflicting + uncertain kinds
  // only -- see getDispositionableExceptions()'s own comment). A field_path lands in
  // needsFollowUpFieldPaths when its disposition is "leave_uncertain" ("Neither / needs
  // follow-up" for a conflict, "Leave Unknown" for an uncertain field) -- it produces no
  // approved fact (buildApprovedFactsForReview() above still skips it, unchanged), so
  // buildAssessmentProjection needs this set to render it "Needs follow-up" instead of
  // indistinguishably "Not discussed".
  const exceptionsNeedingDisposition = useMemo(() => getDispositionableExceptions(exceptions), [exceptions]);
  const needsFollowUpFieldPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const exception of exceptionsNeedingDisposition) {
      if (resolutions[exception.fieldPath] === "leave_uncertain") paths.add(exception.fieldPath);
    }
    return paths;
  }, [exceptionsNeedingDisposition, resolutions]);

  const projection = useMemo(
    () => buildAssessmentProjection(mergedFacts, needsFollowUpFieldPaths),
    [mergedFacts, needsFollowUpFieldPaths]
  );

  const assessmentFactDetails = useMemo(() => {
    const map = new Map<string, ApprovedFactInput>();
    for (const f of approvedFactsPreview) map.set(f.field_path, f);
    return map;
  }, [approvedFactsPreview]);

  // The one place this decision is computed (isReviewReadyForApproval, reviewExceptions.ts) --
  // every rendered conflicting/uncertain exception must have SOME explicit reviewer disposition;
  // "Neither / needs follow-up" and "Leave Unknown" count exactly like a definitive pick, only an
  // exception no one has looked at yet blocks approval.
  const canApprove = useMemo(
    () => isReviewReadyForApproval(clearFacts, exceptions, resolutions),
    [clearFacts, exceptions, resolutions]
  );

  function handleResolveConflict(fieldPath: string, factId: string) {
    setError(null);
    startTransition(async () => {
      const result = await resolveAssessmentConflict({ assessmentSessionId, fieldPath, resolvedFactId: factId });
      if (result.error) {
        setError(result.error);
        return;
      }
      setResolution(fieldPath, `fact:${factId}`);
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveAssessment({
        assessmentSessionId,
        approvedFacts: approvedFactsPreview,
        needsFollowUpFieldPaths: [...needsFollowUpFieldPaths],
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setApproved(true);
      setPricingStatus(result.pricingStatus ?? null);
      // approvedSnapshot is a server-fetched prop, not local state — this action just wrote it
      // (ensureApprovedAssessmentSnapshot(), inside approveAssessment()), so a refresh is what
      // picks it up. Until it lands, the approved-but-no-snapshot branch below covers the gap
      // honestly rather than rendering stale/empty content.
      router.refresh();
    });
  }

  function handleAxisCarePreview() {
    setError(null);
    startTransition(async () => {
      const result = await generateAxisCarePreview(assessmentSessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAxiscarePreview(result);
    });
  }

  function handleCinchProjection() {
    setError(null);
    startTransition(async () => {
      const result = await generateCinchProjection(assessmentSessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCinchGenerated(true);
    });
  }

  if (exceptions.length === 0 && clearFacts.length === 0) {
    return (
      <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
        <p className="font-sans text-sm text-muted">
          No facts have been extracted for this assessment yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!approved && (
        <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
          <div className="flex border-b border-ivory-border px-6 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab("assessment")}
              className={`mr-6 border-b-2 pb-3 font-sans text-sm font-semibold transition-colors ${
                activeTab === "assessment" ? "border-navy text-body" : "border-transparent text-muted hover:text-body"
              }`}
            >
              Assessment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("needs_attention")}
              className={`border-b-2 pb-3 font-sans text-sm font-semibold transition-colors ${
                activeTab === "needs_attention" ? "border-navy text-body" : "border-transparent text-muted hover:text-body"
              }`}
            >
              Needs Attention ({exceptions.length})
            </button>
          </div>

          <div className="p-6">
            {activeTab === "assessment" && (
              <AssessmentTab
                projection={projection}
                assessmentFactDetails={assessmentFactDetails}
                expandedFieldPath={expandedFieldPath}
                onToggleExpand={(fieldPath) => setExpandedFieldPath((prev) => (prev === fieldPath ? null : fieldPath))}
              />
            )}

            {activeTab === "needs_attention" && (
              <div>
                {coverage.summary && <p className="mb-4 font-sans text-sm text-body">{coverage.summary}</p>}

                <h3 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
                  Needs Your Attention ({exceptions.length})
                </h3>
                <p className="mb-4 font-sans text-sm text-muted">
                  {clearFacts.length} field{clearFacts.length === 1 ? "" : "s"} extracted with confidence and no
                  conflicts — see the Assessment tab for the complete proposed assessment. Only exceptions require a
                  decision here.
                </p>

                {conflictingExceptions.map((exception) => {
                  const isBooleanField = getFieldDefinition(exception.fieldPath)?.isBoolean === true;
                  return (
                    <div key={exception.fieldPath} className="mb-4 rounded-lg border border-danger-text/30 bg-ivory px-4 py-3">
                      <p className="mb-2 font-sans text-sm font-semibold text-body">{exception.label} — conflicting statements</p>
                      {exception.facts.map((fact) => (
                        <p key={fact.id} className="font-sans text-sm text-muted">
                          {fact.reporter ?? "unknown"}: <span className="text-body">{displayValue(fact.value)}</span>
                          {fact.evidence && <span className="italic"> — &ldquo;{fact.evidence}&rdquo;</span>}
                        </p>
                      ))}
                      <ConflictResolutionButtons
                        exception={exception}
                        isBooleanField={isBooleanField}
                        current={resolutions[exception.fieldPath]}
                        onSelectValue={handleResolveConflict}
                        onSelectNeither={(fieldPath) => setResolution(fieldPath, "leave_uncertain")}
                      />
                    </div>
                  );
                })}

                {uncertainExceptions.map((exception) => (
                  <div key={exception.fieldPath} className="mb-4 rounded-lg border border-warning-surface bg-ivory px-4 py-3">
                    <p className="mb-2 font-sans text-sm font-semibold text-body">{exception.label} — uncertain</p>
                    {exception.facts.map((fact) => (
                      <p key={fact.id} className="font-sans text-sm text-muted">
                        <span className="text-body">{displayValue(fact.value)}</span>
                        {fact.evidence && <span className="italic"> — &ldquo;{fact.evidence}&rdquo;</span>}
                      </p>
                    ))}
                    <ResolutionButtons fieldPath={exception.fieldPath} current={resolutions[exception.fieldPath]} onSelect={setResolution} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-ivory-border px-6 py-4">
            <button
              type="button"
              onClick={handleApprove}
              disabled={!canApprove || isPending}
              className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Approving…" : "Approve Assessment"}
            </button>
            {!canApprove && exceptionsNeedingDisposition.length > 0 && (
              <p className="mt-2 font-sans text-xs text-danger-text">
                Review each flagged item before approving the assessment — see the Needs Attention tab.
              </p>
            )}
          </div>
        </div>
      )}

      {approved && approvedSnapshot && (
        <ApprovedAssessmentDocument residentId={residentId} residentName={residentName} snapshot={approvedSnapshot} />
      )}

      {approved && !approvedSnapshot && (
        <div className="rounded-xl border border-warning-surface bg-warning-surface/40 p-6 shadow-card print:hidden">
          <p className="font-sans text-sm text-body">
            This assessment was approved, but its formal document is still being prepared — refresh in a moment.
          </p>
        </div>
      )}

      {approved && (
        <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card print:hidden">
          <h3 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Operationalize
          </h3>
          {pricingStatus && (
            <p className="mb-3 font-sans text-sm text-body">
              Pricing:{" "}
              {pricingStatus === "recommended" ? (
                <span className="text-success-text">a deterministic option was recommended</span>
              ) : (
                <span className="text-warning-text">Pricing review required — no rate was manufactured</span>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAxisCarePreview}
              disabled={isPending}
              className="inline-flex h-10 items-center rounded-lg border border-ivory-border bg-ivory px-5 font-sans text-sm font-semibold text-body hover:bg-white disabled:opacity-50"
            >
              Preview AxisCare Payload
            </button>
            <button
              type="button"
              onClick={handleCinchProjection}
              disabled={isPending}
              className="inline-flex h-10 items-center rounded-lg border border-ivory-border bg-ivory px-5 font-sans text-sm font-semibold text-body hover:bg-white disabled:opacity-50"
            >
              Generate Cinch Projection
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center rounded-lg border border-ivory-border bg-ivory px-5 font-sans text-sm font-semibold text-body hover:bg-white"
            >
              Print / Save as PDF
            </button>
          </div>
          {axiscarePreview && <AxisCareClientCreatePreviewPanel preview={axiscarePreview} />}
          {cinchGenerated && <p className="mt-3 font-sans text-sm text-success-text">Cinch projection generated (draft — not sent).</p>}
          <p className="mt-3 font-sans text-xs text-muted">
            Client enrollment happens when a signed Service Agreement is recorded on{" "}
            {residentName}&rsquo;s profile — not from this screen.
          </p>
        </div>
      )}

      {error && <p className="font-sans text-sm text-danger-text print:hidden">{error}</p>}

      <Link
        href={`/residents/${residentId}`}
        className="inline-block font-sans text-sm text-navy hover:text-navy-light print:hidden"
      >
        ← Back to {residentName}
      </Link>
    </div>
  );
}

// The formal, immutable Serve Assessment — rendered exclusively from the approval-time snapshot
// (Assessment Workflow Slice B), never from this component's own live clearFacts/exceptions/
// canonicalProfileFacts props. Same domain-grouped structure as AssessmentTab's live preview
// below, deliberately simpler (no evidence-expand — ProjectedField carries no evidence detail,
// and re-deriving it from today's draft facts would reintroduce a live dependency this view must
// not have), and print-ready as-is: this is the one thing on the page NOT hidden by print:hidden.
function ApprovedAssessmentDocument({
  residentId,
  residentName,
  snapshot,
}: {
  residentId: string;
  residentName: string;
  snapshot: AssessmentDocumentSnapshot;
}) {
  const assessmentDateDisplay = formatCentralTimestamp(snapshot.assessmentDate) ?? snapshot.assessmentDate;
  const approvedAtDisplay = formatCentralTimestamp(snapshot.approvedAt) ?? snapshot.approvedAt;

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card print:rounded-none print:border-none print:p-0 print:shadow-none print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
      <div className="mb-6 border-b border-ivory-border pb-4">
        <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Serve Assessment</p>
        <h2 className="font-serif text-card-title font-light text-body">{residentName}</h2>
        <p className="mt-1 font-sans text-sm text-muted">Assessment date: {assessmentDateDisplay}</p>
        <p className="font-sans text-sm text-muted">
          Approved {approvedAtDisplay} by {snapshot.approvedBy}
        </p>
      </div>
      <AssessmentDocumentSections residentId={residentId} sections={snapshot.sections} />
    </div>
  );
}

// A domain section this historical document renders exactly as captured is, by definition, a
// point-in-time record — but "Important People" is the one domain that ALSO has a living,
// evolving counterpart elsewhere on this person's page (Slice C.3's canonical Important People,
// automatically kept current from every approved assessment). Every other domain has no such
// counterpart, so only this one needs the "this is history, here's where the current picture
// lives" treatment — communicated with a small label and a direct link, never a paragraph.
const DOMAIN_WITH_LIVE_COUNTERPART = "important_people";

function AssessmentDocumentSections({
  residentId,
  sections,
}: {
  residentId: string;
  sections: readonly ProjectedDomainSection[];
}) {
  if (sections.length === 0) {
    return <p className="font-sans text-sm text-muted">Nothing was established in this assessment.</p>;
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const hasLiveCounterpart = section.domain === DOMAIN_WITH_LIVE_COUNTERPART;
        return (
          <div key={section.domain}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
                {section.label}
                {hasLiveCounterpart && <span className="text-subtle"> · At Assessment</span>}
              </h3>
              {hasLiveCounterpart && (
                <Link
                  href={`/residents/${residentId}#important-people`}
                  className="font-sans text-xs font-semibold text-navy underline underline-offset-2 print:hidden"
                >
                  Current Important People →
                </Link>
              )}
            </div>
            <div className="divide-y divide-ivory-border rounded-lg border border-ivory-border print:divide-ivory-border print:rounded-none print:border-0 print:border-t">
              {section.fields.map((field) => {
                const style = STATE_STYLES[field.state];
                return (
                  <div key={field.fieldPath} className="px-4 py-2.5 print:px-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-sans text-sm text-body">{field.label}</p>
                        {field.source === "profile" && (
                          <span
                            className="inline-flex items-center rounded-full bg-ivory-warm px-2 py-0.5 font-sans text-[11px] font-medium text-subtle"
                            title="Already known from this person's Serve profile, not stated during this conversation"
                          >
                            From Serve profile
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-semibold ${style.className}`}>
                          {field.state === "value" ? (field.displayValue ?? "—") : style.label}
                        </span>
                        {field.state === "uncertain" && field.displayValue && (
                          <span className="font-sans text-xs text-muted">{field.displayValue}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The complete proposed professional assessment, organized by the canonical domain model
// (domainRegistry.ts) -- never 61 raw database rows. A domain with no real content at all (e.g.
// Advance Planning, often untouched) is simply absent from `projection`, per
// buildAssessmentProjection()'s own rule.
function AssessmentTab({
  projection,
  assessmentFactDetails,
  expandedFieldPath,
  onToggleExpand,
}: {
  projection: ReturnType<typeof buildAssessmentProjection>;
  assessmentFactDetails: Map<string, ApprovedFactInput>;
  expandedFieldPath: string | null;
  onToggleExpand: (fieldPath: string) => void;
}) {
  if (projection.length === 0) {
    return <p className="font-sans text-sm text-muted">Nothing has been established yet.</p>;
  }

  return (
    <div className="space-y-6">
      {projection.map((section) => (
        <div key={section.domain}>
          <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            {section.label}
          </h3>
          <div className="divide-y divide-ivory-border rounded-lg border border-ivory-border">
            {section.fields.map((field) => {
              const detail = field.source === "assessment" ? assessmentFactDetails.get(field.fieldPath) : undefined;
              const canExpand = field.source === "assessment" && Boolean(detail?.evidence);
              const isExpanded = expandedFieldPath === field.fieldPath;
              const style = STATE_STYLES[field.state];
              return (
                <div key={field.fieldPath} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-sans text-sm text-body">{field.label}</p>
                      {field.source === "profile" && (
                        <span
                          className="inline-flex items-center rounded-full bg-ivory-warm px-2 py-0.5 font-sans text-[11px] font-medium text-subtle"
                          title="Already known from this person's Serve profile, not stated during this conversation"
                        >
                          From Serve profile
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-semibold ${style.className}`}>
                        {field.state === "value" ? (field.displayValue ?? "—") : style.label}
                      </span>
                      {field.state === "uncertain" && field.displayValue && (
                        <span className="font-sans text-xs text-muted">{field.displayValue}</span>
                      )}
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => onToggleExpand(field.fieldPath)}
                          className="font-sans text-xs text-navy hover:text-navy-light"
                        >
                          {isExpanded ? "Hide evidence" : "Evidence"}
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && detail && (
                    <div className="mt-1.5 rounded-md bg-ivory px-3 py-2 font-sans text-xs text-muted">
                      {detail.reporter && <p>Reported by: {detail.reporter}</p>}
                      {detail.evidence && <p className="italic">&ldquo;{detail.evidence}&rdquo;</p>}
                      {detail.collection_method && <p>Collection method: {detail.collection_method}</p>}
                      {detail.confidence && <p>Confidence: {detail.confidence}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// axiscareReadiness.ts's evaluateAxisCareClientCreate() computes `integrationGaps` as full
// technical sentences (see that function's own doc comment) -- aimed at a developer reading raw
// output, not an office operator. This maps each KNOWN gap to a short, accurate, operator-facing
// summary line while keeping the original technical sentence available in "Integration details"
// for troubleshooting. Deliberately does NOT invent a future capability ("will be added
// separately") that doesn't exist yet -- only states what this request does and doesn't include.
// This is presentation only: the underlying gap list/wording/trigger conditions in
// axiscareReadiness.ts are unchanged. If that module's exact wording for either gap ever changes,
// update the match strings below to match.
function describeIntegrationGap(gap: string): { summary: string; detail: string } {
  if (gap.includes("Responsible Party")) {
    return { summary: "Primary contact — not included in this initial AxisCare client-create request.", detail: gap };
  }
  if (gap.toLowerCase().includes("community")) {
    return { summary: "Partner community — not included in this initial AxisCare client-create request.", detail: gap };
  }
  return { summary: gap, detail: gap };
}

// The real AxisCare client-create request preview (Slice B.1, 2026-09-18; UX polish
// 2026-09-19) -- surfaces the four distinct, never-collapsed categories
// evaluateAxisCareClientCreate() computes (API hard blockers, Serve's separate identity-
// duplicate process blocker, non-blocking recommended information, and known AxisCare-
// integration gaps), but leads with what an office operator actually needs in ~5 seconds: who's
// being created, the safety-critical Inactive status, and whether anything blocks it. The human
// summary (describeAxisCareClientCreatePayload()) reads only from `preview.payload` -- the exact
// same object rendered as JSON below it -- so the two views can never disagree; this component
// never re-derives client data from anywhere else. The rendered JSON is the literal object a
// future Send-to-AxisCare action would submit, never a re-derived or re-interpreted summary.
function AxisCareClientCreatePreviewPanel({ preview }: { preview: AxisCareClientCreatePreviewResult }) {
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);
  const [isIntegrationDetailsExpanded, setIsIntegrationDetailsExpanded] = useState(false);

  const apiHardBlockers = preview.apiHardBlockers ?? [];
  const processHardBlockers = preview.processHardBlockers ?? [];
  const recommendedMissing = preview.recommendedMissing ?? [];
  const integrationGaps = preview.integrationGaps ?? [];
  const hasHardBlockers = apiHardBlockers.length > 0 || processHardBlockers.length > 0;
  const summary = preview.payload ? describeAxisCareClientCreatePayload(preview.payload) : null;

  return (
    <div className="mt-4 rounded-lg border border-ivory-border bg-ivory px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-sm font-semibold text-body">AxisCare Client Create Preview</p>
        <div className="flex items-center gap-2">
          <span className="font-sans text-xs font-medium text-muted">Technical readiness</span>
          <Badge tone={preview.technicallyReady ? "success" : "danger"}>{preview.technicallyReady ? "Ready" : "Blocked"}</Badge>
        </div>
      </div>

      <div className={isJsonExpanded ? "grid gap-4 md:grid-cols-2" : ""}>
        <div className="min-w-0 space-y-3">
          {summary && (
            <div>
              <p className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
                Client to be created
              </p>
              <p className="font-sans text-base font-semibold text-body">{summary.fullName}</p>
              {summary.clientRows.length > 0 && (
                <dl className="mt-1 space-y-0.5">
                  {summary.clientRows.map((row) => (
                    <div key={row.label} className="flex flex-wrap gap-1 font-sans text-sm text-body">
                      <dt className="text-muted">{row.label}:</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-3 flex items-center gap-2">
                <span className="font-sans text-xs font-medium text-muted">AxisCare Status</span>
                <Badge tone={summary.statusActive ? "danger" : "success"}>
                  {summary.statusActive ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </div>

              {summary.assessmentDateDisplay && (
                <p className="mt-2 font-sans text-sm text-body">
                  <span className="text-muted">Assessment date:</span> {summary.assessmentDateDisplay}
                </p>
              )}
            </div>
          )}

          {hasHardBlockers && (
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-wide text-danger-text">Blocking issues</p>
              <ul className="ml-4 list-disc font-sans text-sm text-body">
                {apiHardBlockers.map((f) => (
                  <li key={f.fieldPath}>Missing: {f.label}</li>
                ))}
                {processHardBlockers.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {recommendedMissing.length > 0 && (
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-wide text-warning-text">
                Recommended information still missing
              </p>
              <ul className="ml-4 list-disc font-sans text-sm text-body">
                {recommendedMissing.map((f) => (
                  <li key={f.fieldPath}>{f.label}</li>
                ))}
              </ul>
            </div>
          )}

          {integrationGaps.length > 0 && (
            <div>
              <ul className="ml-4 list-disc font-sans text-sm text-muted">
                {integrationGaps.map((gap, i) => (
                  <li key={i}>{describeIntegrationGap(gap).summary}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setIsIntegrationDetailsExpanded((prev) => !prev)}
                aria-expanded={isIntegrationDetailsExpanded}
                aria-controls="axiscare-integration-details"
                className="mt-1 ml-4 inline-flex items-center gap-1 rounded font-sans text-xs text-navy transition-colors hover:text-navy-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              >
                {isIntegrationDetailsExpanded ? (
                  <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                )}
                Integration details
              </button>
              {isIntegrationDetailsExpanded && (
                <ul id="axiscare-integration-details" className="ml-8 list-disc font-sans text-xs text-muted">
                  {integrationGaps.map((gap, i) => (
                    <li key={i}>{describeIntegrationGap(gap).detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {isJsonExpanded && preview.payload && (
          <div id="axiscare-technical-json" className="min-w-0">
            <p className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
              Technical request JSON
            </p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-ivory-border bg-white px-3 py-2 font-mono text-xs leading-relaxed text-body">
              {JSON.stringify(preview.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {preview.payload && (
        <button
          type="button"
          onClick={() => setIsJsonExpanded((prev) => !prev)}
          aria-expanded={isJsonExpanded}
          aria-controls="axiscare-technical-json"
          className={`${SECONDARY_BUTTON_SMALL_CLASS} mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40`}
        >
          Technical request JSON
          {isJsonExpanded ? (
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      )}

      <p className="mt-3 font-sans text-xs text-muted">
        Preview only — nothing has been sent to AxisCare. Sending to AxisCare will require a
        separate human action.
      </p>
    </div>
  );
}

function ResolutionButtons({
  fieldPath,
  current,
  onSelect,
}: {
  fieldPath: string;
  current: Resolution | undefined;
  onSelect: (fieldPath: string, resolution: Resolution) => void;
}) {
  const options: { value: Resolution; label: string }[] = [
    { value: "confirmed_yes", label: "Confirm Yes" },
    { value: "confirmed_no", label: "Confirm No" },
    { value: "leave_uncertain", label: "Leave Unknown" },
  ];
  return (
    <div className="mt-2 flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(fieldPath, opt.value)}
          className={`rounded-md px-3 py-1 font-sans text-xs font-semibold ${
            current === opt.value ? "bg-navy text-white" : "border border-ivory-border bg-white text-body"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Every conflict resolution — boolean or not — reduces to "which of the actual conflicting
// facts was correct." A non-boolean conflict (e.g. two different physician names) can't be
// resolved with "Confirm Yes/No" — that pair is meaningless when the disagreement is about
// which value is correct, not whether something is true — so this renders one button per
// genuinely distinct value actually claimed (labeled "Confirm Yes"/"Confirm No" for a boolean
// field, the raw value otherwise), plus an explicit, non-resolving opt-out. onSelectValue
// durably persists (see handleResolveConflict); onSelectNeither deliberately does not.
function ConflictResolutionButtons({
  exception,
  isBooleanField,
  current,
  onSelectValue,
  onSelectNeither,
}: {
  exception: ReviewException;
  isBooleanField: boolean;
  current: Resolution | undefined;
  onSelectValue: (fieldPath: string, factId: string) => void;
  onSelectNeither: (fieldPath: string) => void;
}) {
  const choices = distinctFactValues(exception.facts);
  return (
    <div className="mt-2">
      <p className="mb-1 font-sans text-xs font-medium text-muted">Which is correct?</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const resolution: Resolution = `fact:${choice.factId}`;
          const label = isBooleanField
            ? choice.value === true
              ? "Confirm Yes"
              : choice.value === false
                ? "Confirm No"
                : displayValue(choice.value)
            : displayValue(choice.value);
          return (
            <button
              key={choice.factId}
              type="button"
              onClick={() => onSelectValue(exception.fieldPath, choice.factId)}
              className={`rounded-md px-3 py-1 font-sans text-xs font-semibold ${
                current === resolution ? "bg-navy text-white" : "border border-ivory-border bg-white text-body"
              }`}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onSelectNeither(exception.fieldPath)}
          className={`rounded-md px-3 py-1 font-sans text-xs font-semibold ${
            current === "leave_uncertain" ? "bg-navy text-white" : "border border-ivory-border bg-white text-body"
          }`}
        >
          Neither / needs follow-up
        </button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  approveAssessment,
  generateAxisCarePreview,
  generateCinchProjection,
  resolveAssessmentConflict,
  type ApprovedFactInput,
} from "@/lib/actions/assessmentIntelligence";
import {
  distinctFactValues,
  isConflictResolutionComplete,
  type DraftFactForReview,
  type ReviewException,
} from "@/lib/assessmentIntelligence/reviewExceptions";
import { getFieldDefinition } from "@/lib/assessmentIntelligence/domainRegistry";
import type { AssessmentCoverageSummary } from "@/lib/assessmentIntelligence/coverage";

// Client operationalization deliberately does NOT live here (Slice 1:
// Service Agreement -> Enrolled Inactive Client, 2026-09-15). Assessment
// approval must never be able to activate a client, or establish any
// relationship at all — it only produces knowledge (draft/approved
// facts, pricing, previews). A signed Service Agreement is what
// establishes the enrolled (Inactive) Client relationship — see
// lib/actions/clientEnrollment.ts, called from
// recordServiceAgreementEvidenceAction(). Activating an enrolled client
// (inactive_client -> active_client) is a separate, later, explicit
// action, not part of this slice.

interface AssessmentReviewPanelProps {
  residentId: string;
  residentName: string;
  assessmentSessionId: string;
  sessionStatus: string;
  exceptions: ReviewException[];
  clearFacts: DraftFactForReview[];
  readyForApproval: boolean;
  coverage: AssessmentCoverageSummary;
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

export function AssessmentReviewPanel({
  residentId,
  residentName,
  assessmentSessionId,
  sessionStatus,
  exceptions,
  clearFacts,
  readyForApproval,
  coverage,
}: AssessmentReviewPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() =>
    initialResolutionsFromExceptions(exceptions)
  );
  const [approved, setApproved] = useState(sessionStatus === "approved" || sessionStatus === "operationalized");
  const [pricingStatus, setPricingStatus] = useState<string | null>(null);
  const [axiscareReadiness, setAxiscareReadiness] = useState<string | null>(null);
  const [cinchGenerated, setCinchGenerated] = useState(false);

  const conflictingExceptions = exceptions.filter((e) => e.kind === "conflicting");
  const uncertainExceptions = exceptions.filter((e) => e.kind === "uncertain");

  // requiredForReview/"missing_required" (reviewExceptions.ts) still computes server-side for
  // this pilot — kept for later cleanup once the Watermere pilot validates the new coverage
  // behavior below — but is deliberately not rendered here, to avoid showing two overlapping
  // "what's missing" lists on one screen. `coverage` (informational, Core/fired-Conditional)
  // is now the single missing-topics surface in this UI.

  function setResolution(fieldPath: string, resolution: Resolution) {
    setResolutions((prev) => ({ ...prev, [fieldPath]: resolution }));
  }

  // A conflict is an explicit data-integrity exception (two facts genuinely disagree) — the
  // reviewer's choice must be durably persisted the moment it's made, not deferred until the
  // whole assessment is approved, so it survives a reload or another session picking up the
  // review from here. "Neither / needs follow-up" deliberately does NOT call this — it must
  // not resolve the conflict (see the panel's onSelectNeither handler below).
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

  // readyForApproval (reviewExceptions.ts, prop received but deliberately not used for gating
  // below) folds "at least one draft fact exists" together with "no open DB-persisted conflict
  // exists" into one flag computed once, server-side, at page-load time — it can't reflect a
  // resolution the reviewer makes live, in this session, without a full page reload. The gate
  // below is re-derived from signals this component actually has live access to instead:
  // whether there's any data at all, and isConflictResolutionComplete's durable-or-just-
  // persisted-this-session resolution check (reviewExceptions.ts) — a "leave uncertain"/
  // "neither, needs follow-up" choice is a deliberate non-resolution and correctly does NOT
  // satisfy it; only an actual picked value does.
  const hasAnyDraftFacts = clearFacts.length > 0 || exceptions.length > 0;
  const canApprove = useMemo(
    () => hasAnyDraftFacts && isConflictResolutionComplete(conflictingExceptions, resolutions),
    [hasAnyDraftFacts, conflictingExceptions, resolutions]
  );

  function handleApprove() {
    setError(null);
    const approvedFacts: ApprovedFactInput[] = [];

    for (const fact of clearFacts) {
      approvedFacts.push({
        field_path: fact.fieldPath,
        value: fact.value,
        assertion_state: fact.assertionState,
        collection_method: fact.collectionMethod,
        reporter: fact.reporter,
        evidence: fact.evidence,
        confidence: fact.confidence,
        source_draft_fact_id: fact.id,
        supersedes_fact_id: null,
      });
    }

    for (const exception of [...uncertainExceptions, ...conflictingExceptions]) {
      const resolution = resolutions[exception.fieldPath];
      if (!resolution || resolution === "leave_uncertain") continue; // stays unknown, not silently approved

      if (resolution.startsWith("fact:")) {
        // Non-boolean conflict, resolved by picking which of the actual conflicting facts was
        // correct — approve that fact's own real value/evidence/reporter, never a fabricated one.
        const selectedFactId = resolution.slice("fact:".length);
        const selectedFact = exception.facts.find((f) => f.id === selectedFactId);
        if (!selectedFact) continue;
        approvedFacts.push({
          field_path: exception.fieldPath,
          value: selectedFact.value,
          assertion_state: selectedFact.assertionState,
          collection_method: selectedFact.collectionMethod,
          reporter: selectedFact.reporter,
          evidence: selectedFact.evidence,
          confidence: selectedFact.confidence,
          source_draft_fact_id: selectedFact.id,
          supersedes_fact_id: null,
        });
        continue;
      }

      const sourceFact = exception.facts[0];
      approvedFacts.push({
        field_path: exception.fieldPath,
        value: resolution === "confirmed_yes",
        assertion_state: resolution,
        collection_method: sourceFact?.collectionMethod ?? null,
        reporter: "reviewer",
        evidence: `Reviewer resolution during assessment approval.`,
        confidence: "high",
        source_draft_fact_id: sourceFact?.id ?? null,
        supersedes_fact_id: null,
      });
    }

    startTransition(async () => {
      const result = await approveAssessment({ assessmentSessionId, approvedFacts });
      if (result.error) {
        setError(result.error);
        return;
      }
      setApproved(true);
      setPricingStatus(result.pricingStatus ?? null);
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
      setAxiscareReadiness(result.readiness ?? null);
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
        <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
          {coverage.summary && (
            <p className="mb-4 font-sans text-sm text-body">{coverage.summary}</p>
          )}

          <h3 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Needs Your Attention ({exceptions.length})
          </h3>
          <p className="mb-4 font-sans text-sm text-muted">
            {clearFacts.length} field{clearFacts.length === 1 ? "" : "s"} extracted with confidence and no
            conflicts — not shown individually. Only exceptions require a decision.
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

          <button
            type="button"
            onClick={handleApprove}
            disabled={!canApprove || isPending}
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Approving…" : "Approve Assessment"}
          </button>
          {!isConflictResolutionComplete(conflictingExceptions, resolutions) && conflictingExceptions.length > 0 && (
            <p className="mt-2 font-sans text-xs text-danger-text">
              Resolve all conflicting statements before approving.
            </p>
          )}
        </div>
      )}

      {approved && (
        <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
          <h3 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Approved
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
          </div>
          {axiscareReadiness && (
            <p className="mt-3 font-sans text-sm text-body">AxisCare readiness: {axiscareReadiness.replace(/_/g, " ")}</p>
          )}
          {cinchGenerated && <p className="mt-3 font-sans text-sm text-success-text">Cinch projection generated (draft — not sent).</p>}
          <p className="mt-3 font-sans text-xs text-muted">
            Client enrollment happens when a signed Service Agreement is recorded on{" "}
            {residentName}&rsquo;s profile — not from this screen.
          </p>
        </div>
      )}

      {error && <p className="font-sans text-sm text-danger-text">{error}</p>}

      <Link href={`/residents/${residentId}`} className="inline-block font-sans text-sm text-navy hover:text-navy-light">
        ← Back to {residentName}
      </Link>
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

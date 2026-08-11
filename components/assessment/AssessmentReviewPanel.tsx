"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  approveAssessment,
  generateAxisCarePreview,
  generateCinchProjection,
  type ApprovedFactInput,
} from "@/lib/actions/assessmentIntelligence";
import { makeActiveClientFromAssessment } from "@/lib/actions/assessmentClientOperationalization";
import type { DraftFactForReview, ReviewException } from "@/lib/assessmentIntelligence/reviewExceptions";

interface AssessmentReviewPanelProps {
  residentId: string;
  residentName: string;
  assessmentSessionId: string;
  sessionStatus: string;
  exceptions: ReviewException[];
  clearFacts: DraftFactForReview[];
  readyForApproval: boolean;
}

type Resolution = "confirmed_yes" | "confirmed_no" | "leave_uncertain";

function displayValue(fact: DraftFactForReview): string {
  if (fact.value === null || fact.value === undefined) return "(no value)";
  return String(fact.value);
}

export function AssessmentReviewPanel({
  residentId,
  residentName,
  assessmentSessionId,
  sessionStatus,
  exceptions,
  clearFacts,
  readyForApproval,
}: AssessmentReviewPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [approved, setApproved] = useState(sessionStatus === "approved" || sessionStatus === "operationalized");
  const [pricingStatus, setPricingStatus] = useState<string | null>(null);
  const [axiscareReadiness, setAxiscareReadiness] = useState<string | null>(null);
  const [cinchGenerated, setCinchGenerated] = useState(false);
  const [conversionResult, setConversionResult] = useState<string | null>(null);

  const conflictingExceptions = exceptions.filter((e) => e.kind === "conflicting");
  const uncertainExceptions = exceptions.filter((e) => e.kind === "uncertain");
  const missingExceptions = exceptions.filter((e) => e.kind === "missing_required");

  const openConflictCount = conflictingExceptions.length;

  function setResolution(fieldPath: string, resolution: Resolution) {
    setResolutions((prev) => ({ ...prev, [fieldPath]: resolution }));
  }

  const canApprove = useMemo(() => openConflictCount === 0 && readyForApproval, [openConflictCount, readyForApproval]);

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

  function handleMakeActiveClient() {
    setError(null);
    startTransition(async () => {
      const result = await makeActiveClientFromAssessment({
        assessmentSessionId,
        residentId,
        residentDisplayName: residentName,
        effectiveStartDate: new Date().toISOString().slice(0, 10),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setConversionResult(`Converted to Active Client (relationship ${result.relationshipId?.slice(0, 8)}…).`);
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
          <h3 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Needs Your Attention ({exceptions.length})
          </h3>
          <p className="mb-4 font-sans text-sm text-muted">
            {clearFacts.length} field{clearFacts.length === 1 ? "" : "s"} extracted with confidence and no
            conflicts — not shown individually. Only exceptions require a decision.
          </p>

          {conflictingExceptions.map((exception) => (
            <div key={exception.fieldPath} className="mb-4 rounded-lg border border-danger-text/30 bg-ivory px-4 py-3">
              <p className="mb-2 font-sans text-sm font-semibold text-body">{exception.label} — conflicting statements</p>
              {exception.facts.map((fact) => (
                <p key={fact.id} className="font-sans text-sm text-muted">
                  {fact.reporter ?? "unknown"}: <span className="text-body">{displayValue(fact)}</span>
                  {fact.evidence && <span className="italic"> — &ldquo;{fact.evidence}&rdquo;</span>}
                </p>
              ))}
              <ResolutionButtons fieldPath={exception.fieldPath} current={resolutions[exception.fieldPath]} onSelect={setResolution} />
            </div>
          ))}

          {uncertainExceptions.map((exception) => (
            <div key={exception.fieldPath} className="mb-4 rounded-lg border border-warning-surface bg-ivory px-4 py-3">
              <p className="mb-2 font-sans text-sm font-semibold text-body">{exception.label} — uncertain</p>
              {exception.facts.map((fact) => (
                <p key={fact.id} className="font-sans text-sm text-muted">
                  <span className="text-body">{displayValue(fact)}</span>
                  {fact.evidence && <span className="italic"> — &ldquo;{fact.evidence}&rdquo;</span>}
                </p>
              ))}
              <ResolutionButtons fieldPath={exception.fieldPath} current={resolutions[exception.fieldPath]} onSelect={setResolution} />
            </div>
          ))}

          {missingExceptions.length > 0 && (
            <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
              <p className="mb-1 font-sans text-sm font-semibold text-body">Not discussed / missing</p>
              <ul className="list-disc pl-5 font-sans text-sm text-muted">
                {missingExceptions.map((m) => (
                  <li key={m.fieldPath}>{m.label} — not raised in this conversation</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleApprove}
            disabled={!canApprove || isPending}
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Approving…" : "Approve Assessment"}
          </button>
          {openConflictCount > 0 && (
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
            <button
              type="button"
              onClick={handleMakeActiveClient}
              disabled={isPending}
              className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white hover:bg-navy-light disabled:opacity-50"
            >
              Make Active Client
            </button>
          </div>
          {axiscareReadiness && (
            <p className="mt-3 font-sans text-sm text-body">AxisCare readiness: {axiscareReadiness.replace(/_/g, " ")}</p>
          )}
          {cinchGenerated && <p className="mt-3 font-sans text-sm text-success-text">Cinch projection generated (draft — not sent).</p>}
          {conversionResult && <p className="mt-3 font-sans text-sm text-success-text">{conversionResult}</p>}
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

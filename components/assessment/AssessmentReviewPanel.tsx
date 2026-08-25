"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  approveAssessment,
  generateAxisCarePreview,
  generateCinchProjection,
  getAssessmentTranscriptForReview,
  retryFailedAssessment,
  type ApprovedFactInput,
} from "@/lib/actions/assessmentIntelligence";
import { makeActiveClientFromAssessment } from "@/lib/actions/assessmentClientOperationalization";
import type { DraftFactForReview, ReviewException } from "@/lib/assessmentIntelligence/reviewExceptions";

interface AssessmentReviewPanelProps {
  residentId: string;
  residentName: string;
  assessmentSessionId: string;
  sessionStatus: string;
  isSyntheticTest: boolean;
  exceptions: ReviewException[];
  clearFacts: DraftFactForReview[];
  readyForApproval: boolean;
}

type Resolution = "confirmed_yes" | "confirmed_no" | "leave_uncertain";

function displayValue(fact: DraftFactForReview): string {
  if (fact.value === null || fact.value === undefined) return "(no value)";
  return String(fact.value);
}

// A session marked synthetic (is_synthetic_test) was created only through the admin-only
// createSyntheticAssessmentSessionAction, specifically to exercise real AWS Transcribe/Bedrock
// calls with fabricated audio without setting PHI_AWS_PROCESSING_CONFIRMED — see pipeline.ts's
// isSessionAuthorizedForConfiguredTranscriptionProvider. Shown unconditionally, at the very top,
// on every session status, so it's never possible to miss that a given review is synthetic (and,
// by extension, that any facts extracted on this screen came from fabricated content) — this is
// also the only visibility this scope builds toward eventual governed cleanup (see the migration
// comment on intake_assessment_sessions.is_synthetic_test).
function SyntheticTestBanner() {
  return (
    <div className="rounded-xl border-2 border-dashed border-warning-text/60 bg-warning-surface px-5 py-3">
      <p className="font-sans text-sm font-semibold uppercase tracking-widest text-warning-text">
        Synthetic Test Session — Not a Real Assessment
      </p>
      <p className="mt-1 font-sans text-sm text-warning-text">
        Created via the admin synthetic-test tool to validate the AWS processing pipeline. Any facts shown here were
        extracted from fabricated, non-PHI audio.
      </p>
    </div>
  );
}

export function AssessmentReviewPanel({
  residentId,
  residentName,
  assessmentSessionId,
  sessionStatus,
  isSyntheticTest,
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

  if (sessionStatus === "failed") {
    return (
      <div className="space-y-6">
        {isSyntheticTest && <SyntheticTestBanner />}
        <FailedBanner assessmentSessionId={assessmentSessionId} />
        <Link href={`/residents/${residentId}`} className="inline-block font-sans text-sm text-navy hover:text-navy-light">
          ← Back to {residentName}
        </Link>
      </div>
    );
  }

  if (sessionStatus === "processing") {
    return (
      <div className="space-y-6">
        {isSyntheticTest && <SyntheticTestBanner />}
        <ProcessingBanner />
        <Link href={`/residents/${residentId}`} className="inline-block font-sans text-sm text-navy hover:text-navy-light">
          ← Back to {residentName}
        </Link>
      </div>
    );
  }

  if (exceptions.length === 0 && clearFacts.length === 0) {
    return (
      <div className="space-y-6">
        {isSyntheticTest && <SyntheticTestBanner />}
        <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
          <p className="font-sans text-sm text-muted">
            No facts have been extracted for this assessment yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isSyntheticTest && <SyntheticTestBanner />}
      <TranscriptSection assessmentSessionId={assessmentSessionId} />

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

// Phase 12 — "the review experience should allow the user to understand: Source conversation
// versus Extracted facts." Lazy-loaded on demand (not fetched on every page load) via a
// dedicated, self-authorizing server action (getAssessmentTranscriptForReview) — no RLS was
// loosened; this is the same application-layer canEditResidentProfile() check every other
// assessment action already uses. No diarization — the transcript is shown as one continuous,
// readable block, matching what the underlying data actually is (speaker is null throughout).
function TranscriptSection({ assessmentSessionId }: { assessmentSessionId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    if (transcript !== null) return; // already fetched
    startTransition(async () => {
      const result = await getAssessmentTranscriptForReview(assessmentSessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTranscript(result.transcriptText || "(No transcript text is on file for this session.)");
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <button
        type="button"
        onClick={handleToggle}
        className="font-sans text-label font-semibold uppercase tracking-widest text-muted hover:text-body"
      >
        {isOpen ? "Hide" : "View"} Source Conversation
      </button>
      {isOpen && (
        <div className="mt-4">
          {isPending && <p className="font-sans text-sm text-muted">Loading transcript…</p>}
          {error && <p className="font-sans text-sm text-danger-text">{error}</p>}
          {transcript && (
            <p className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-ivory-border bg-ivory p-4 font-sans text-sm leading-relaxed text-body">
              {transcript}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Production Assessment Transcription Orchestration (2026-08-15) — this assessment's audio is
// finalized and a background worker (netlify/functions/assessment-processing-worker.ts) is
// transcribing and extracting it independently; nothing about being on this page keeps that
// work alive. Refreshed periodically (NOT every second — a background worker tick runs every 2
// minutes, so checking more often than that would only ever see the same state) so a reviewer
// who leaves this tab open sees it flip to "Ready for Review" or "Processing Failed" on its own,
// without a manual reload.
const PROCESSING_REFRESH_INTERVAL_MS = 20_000;

function ProcessingBanner() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), PROCESSING_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">Processing</h3>
      <p className="font-sans text-sm text-muted">
        The recording is safely saved and the conversation is being transcribed and reviewed for facts. This can take
        a few minutes for a longer assessment — you don&rsquo;t need to keep this page open; check back here, or from{" "}
        this resident&rsquo;s Assessment History, whenever it&rsquo;s convenient. This page will update on its own
        once it&rsquo;s ready for review.
      </p>
    </div>
  );
}

// Phase 13 — the previously-identified "stuck at processing forever, no explanation" gap, now
// surfaced explicitly with a real retry action rather than a silent dead end.
function FailedBanner({ assessmentSessionId }: { assessmentSessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [retried, setRetried] = useState(false);

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryFailedAssessment(assessmentSessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRetried(true);
    });
  }

  return (
    <div className="rounded-xl border border-danger-text/30 bg-surface p-6 shadow-card">
      <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-danger-text">
        Processing Failed
      </h3>
      <p className="mb-4 font-sans text-sm text-muted">
        Transcription or extraction failed for this assessment. Any audio already captured remains safely stored —
        nothing was lost. You can retry from where it left off.
      </p>
      {retried ? (
        <p className="font-sans text-sm text-success-text">Retry started — refresh this page in a moment to see the result.</p>
      ) : (
        <button
          type="button"
          onClick={handleRetry}
          disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Retrying…" : "Retry"}
        </button>
      )}
      {error && <p className="mt-2 font-sans text-sm text-danger-text">{error}</p>}
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

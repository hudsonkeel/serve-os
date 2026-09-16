"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";
import { submitPastedTranscriptAndExtract, retryFailedAssessmentProcessing } from "@/lib/actions/assessmentIntelligence";
import { decideRetryEligibility, SAFE_PROCESSING_FAILURE_MESSAGE } from "@/lib/assessmentIntelligence/processingQueue";
import type { AssessmentSessionRecord } from "@/lib/data/assessmentIntelligence";

interface AssessmentSectionProps {
  residentId: string;
  residentName: string;
  sessions: AssessmentSessionRecord[];
}

const STATUS_LABELS: Record<string, string> = {
  recording: "Recording",
  queued: "Queued",
  processing: "Processing",
  failed: "Failed",
  draft: "Draft — needs review",
  needs_review: "Needs review",
  approved: "Approved",
  amended: "Amended",
  operationalized: "Operationalized",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "operationalized"
      ? "bg-success-surface text-success-text"
      : status === "needs_review"
        ? "bg-warning-surface text-warning-text"
        : status === "failed"
          ? "bg-overdue-surface text-danger-text"
          : "bg-ivory text-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 font-sans text-xs font-semibold ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function RetrySessionButton({ session }: { session: AssessmentSessionRecord }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const eligibility = decideRetryEligibility({
    status: session.status,
    processingAttemptCount: session.processing_attempt_count,
    processingClaimedAt: session.processing_claimed_at,
  });
  if (!eligibility.allowed) {
    return <p className="font-sans text-xs text-muted">{eligibility.reason}</p>;
  }

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryFailedAssessmentProcessing(session.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRetry}
        disabled={isPending}
        className="inline-flex h-8 items-center rounded-lg border border-ivory-border bg-white px-3 font-sans text-xs font-semibold text-body transition-colors hover:bg-ivory disabled:opacity-50"
      >
        {isPending ? "Retrying…" : "Retry"}
      </button>
      {error && <p className="font-sans text-xs text-danger-text">{error}</p>}
    </div>
  );
}

export function AssessmentSection({ residentId, residentName, sessions }: AssessmentSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPasteForm, setShowPasteForm] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [extractResult, setExtractResult] = useState<string | null>(null);

  // Queues rather than extracts synchronously (2026-09-16 async extraction queue) — the
  // transcript is durably saved and the session is marked 'queued' by
  // submitPastedTranscriptAndExtract(), which returns immediately; a background worker performs
  // the actual extraction from there. This is what keeps a slow provider call from ever holding
  // this request/the browser open, so there is no navigation to a review page that would have
  // nothing to show yet — the session's progress (Queued -> Processing -> Needs review, or
  // Failed -> Retry) is visible in the Assessment History list above once refreshed.
  function handlePasteSubmit() {
    setError(null);
    setExtractResult(null);
    if (!transcriptText.trim()) {
      setError("Paste a transcript first.");
      return;
    }
    startTransition(async () => {
      // Create a session for this new development/validation-path assessment first.
      const { startAssessmentForExistingPerson } = await import("@/lib/actions/assessmentIntelligence");
      const session = await startAssessmentForExistingPerson(residentId);
      if (session.error || !session.assessmentSessionId) {
        setError(session.error || "Could not start the assessment.");
        return;
      }
      const submission = await submitPastedTranscriptAndExtract(session.assessmentSessionId, transcriptText);
      if (submission.error) {
        setError(submission.error);
        return;
      }
      setExtractResult("Transcript saved and queued for processing — check back here for its status.");
      setTranscriptText("");
      setShowPasteForm(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Assessment History
      </h3>

      {sessions.length > 0 ? (
        <div className="mb-4 space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-lg border border-ivory-border bg-ivory px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="font-sans text-sm font-medium text-body">
                  {new Date(s.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}
                  {s.initiated_from === "new_provisional" ? "New prospect" : "Existing person"}
                </p>
                <div className="flex items-center gap-3">
                  <StatusBadge status={s.status} />
                  {(s.status === "draft" || s.status === "needs_review" || s.status === "approved") && (
                    <LinkButton href={`/residents/${residentId}/assessment/${s.id}`} size="small">
                      Review →
                    </LinkButton>
                  )}
                </div>
              </div>
              {/* Never renders s.failure_reason — administrator/debugging detail only, stored
                  but not shown here. Only the fixed, safe message below. */}
              {s.status === "failed" && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="font-sans text-xs text-danger-text">{SAFE_PROCESSING_FAILURE_MESSAGE}</p>
                  <RetrySessionButton session={s} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 font-sans text-sm text-muted">No assessments yet.</p>
      )}

      {/* The primary launch action ("Capture Assessment") now lives at the
          top of the person record (AssessmentCaptureButton, always visible,
          no scrolling) — removed here as a duplicate rather than left as a
          second entry point to the same action. This section keeps exactly
          what isn't duplicated: history/status above, and the admin/test
          fallback below. */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowPasteForm((v) => !v)}
          className="inline-flex h-10 items-center rounded-lg border border-ivory-border bg-ivory px-5 font-sans text-sm font-semibold text-body transition-colors hover:bg-white"
        >
          {showPasteForm ? "Cancel" : "Paste Transcript (admin/test fallback)"}
        </button>
      </div>

      {showPasteForm && (
        <div className="mt-4">
          <p className="mb-2 font-sans text-xs text-muted">
            Admin/test fallback only — not the normal operator workflow. The normal path is the
            Assessment button at the top of this page (mobile audio, transcribed automatically).
            Use this only to validate the pipeline or recover a session whose audio can&rsquo;t
            be transcribed.
          </p>
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            rows={8}
            placeholder={`Paste an assessment conversation transcript for ${residentName}…`}
            className="w-full rounded-lg border border-ivory-border bg-ivory p-3 font-sans text-sm text-body"
          />
          <button
            type="button"
            onClick={handlePasteSubmit}
            disabled={isPending}
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Queuing…" : "Extract Facts"}
          </button>
        </div>
      )}

      {extractResult && <p className="mt-3 font-sans text-sm text-success-text">{extractResult}</p>}
      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}

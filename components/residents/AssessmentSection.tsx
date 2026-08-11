"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { startAssessmentCapture } from "@/lib/actions/assessmentCapture";
import { submitPastedTranscriptAndExtract } from "@/lib/actions/assessmentIntelligence";
import type { AssessmentSessionRecord } from "@/lib/data/assessmentIntelligence";

interface AssessmentSectionProps {
  residentId: string;
  residentName: string;
  sessions: AssessmentSessionRecord[];
}

const STATUS_LABELS: Record<string, string> = {
  recording: "Recording",
  processing: "Processing",
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
        : "bg-ivory text-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 font-sans text-xs font-semibold ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function AssessmentSection({ residentId, residentName, sessions }: AssessmentSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPasteForm, setShowPasteForm] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [extractResult, setExtractResult] = useState<string | null>(null);

  function handleCaptureClick() {
    setError(null);
    startTransition(async () => {
      const result = await startAssessmentCapture(residentId);
      if (result.error || !result.captureUrl) {
        setError(result.error || "Could not start assessment capture.");
        return;
      }
      window.open(result.captureUrl, "_blank", "noopener,noreferrer");
    });
  }

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
      const extraction = await submitPastedTranscriptAndExtract(session.assessmentSessionId, transcriptText);
      if (extraction.error) {
        setError(extraction.error);
        return;
      }
      setExtractResult(
        `Extracted ${extraction.draftFactCount ?? 0} fact(s)${
          extraction.rejectedCount ? ` (${extraction.rejectedCount} rejected by normalization — see server logs)` : ""
        }. Opening review…`
      );
      window.location.href = `/residents/${residentId}/assessment/${session.assessmentSessionId}`;
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
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-ivory-border bg-ivory px-4 py-3">
              <div>
                <p className="font-sans text-sm font-medium text-body">
                  {new Date(s.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}
                  {s.initiated_from === "new_provisional" ? "New prospect" : "Existing person"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={s.status} />
                {(s.status === "draft" || s.status === "needs_review" || s.status === "approved") && (
                  <Link
                    href={`/residents/${residentId}/assessment/${s.id}`}
                    className="font-sans text-sm font-medium text-navy hover:text-navy-light"
                  >
                    Review →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 font-sans text-sm text-muted">No assessments yet.</p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCaptureClick}
          disabled={isPending}
          className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Capture Assessment"}
        </button>
        <button
          type="button"
          onClick={() => setShowPasteForm((v) => !v)}
          className="inline-flex h-10 items-center rounded-lg border border-ivory-border bg-ivory px-5 font-sans text-sm font-semibold text-body transition-colors hover:bg-white"
        >
          {showPasteForm ? "Cancel" : "Paste Transcript"}
        </button>
      </div>

      {showPasteForm && (
        <div className="mt-4">
          <p className="mb-2 font-sans text-xs text-muted">
            Development/validation entry point — a temporary way to feed the assessment
            pipeline without live transcription. Not the intended long-term operator workflow.
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
            {isPending ? "Extracting…" : "Extract Facts"}
          </button>
        </div>
      )}

      {extractResult && <p className="mt-3 font-sans text-sm text-success-text">{extractResult}</p>}
      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAccidentalWorkforceUpload,
  getWorkforceDocumentSignedUrl,
  markWorkforceEvidenceEnteredInError,
  reassignWorkforceEvidence,
  rejectWorkforceEvidence,
  supersedeWorkforceEvidence,
  updateUnverifiedWorkforceEvidenceDetails,
  uploadWorkforceDocument,
  verifyWorkforceEvidence,
} from "@/lib/actions/workforce";
import { getAvailableEvidenceActions, isEffectivelyExpired, type EvidenceAction } from "@/lib/workforce/evidenceLifecycle";
import { resolveRequirementDisplay } from "@/lib/workforce/registrySummary";
import type { WorkforceLifecycleStatus } from "@/lib/workforce/lifecycleStatus";
import type { RequirementEvaluation } from "@/lib/compliance/requirementSetStatus";
import type { PersonEvidence, PersonEvidenceResult } from "@/lib/supabase/types";

const RESULT_OPTIONS: { value: PersonEvidenceResult; label: string }[] = [
  { value: "no_record_returned", label: "No record returned" },
  { value: "listed_no_findings", label: "Listed, no findings" },
  { value: "listed_with_findings", label: "Listed with findings" },
  { value: "requires_review", label: "Requires review" },
  { value: "unable_to_determine", label: "Unable to determine" },
];

const STATUS_LABELS: Record<string, string> = {
  satisfied: "Verified",
  missing: "Missing",
  awaiting_verification: "Awaiting verification",
  requires_review: "Requires review",
  expired: "Expired",
  expiring_soon: "Expiring soon",
  not_currently_required: "Not currently required",
};

const STATUS_STYLES: Record<string, string> = {
  satisfied: "bg-emerald-50 text-emerald-700",
  missing: "bg-amber-50 text-amber-700",
  awaiting_verification: "bg-blue-50 text-blue-700",
  requires_review: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
  expiring_soon: "bg-amber-50 text-amber-700",
  not_currently_required: "bg-ivory-warm text-muted",
};

const ACTION_LABELS: Record<EvidenceAction, string> = {
  edit_details: "Edit details",
  reassign: "Reassign",
  delete: "Delete accidental upload",
  replace: "Replace",
  correct: "Correct",
  mark_entered_in_error: "Mark entered in error",
  upload_renewal: "Upload renewal",
  view_history: "View history",
};

type Mode = "view" | EvidenceAction;

function DocumentLink({ documentId, isPending, onView }: { documentId: string; isPending: boolean; onView: (id: string) => void }) {
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => onView(documentId)}
      className="font-sans text-sm font-medium text-navy underline hover:text-navy-light disabled:opacity-50"
    >
      View PDF
    </button>
  );
}

function HistoryList({
  history,
  isPending,
  onView,
}: {
  history: PersonEvidence[];
  isPending: boolean;
  onView: (id: string) => void;
}) {
  if (history.length === 0) {
    return <p className="font-sans text-xs text-muted">No prior evidence on record.</p>;
  }
  return (
    <ul className="space-y-3">
      {history
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((e) => (
          <li key={e.id} className="border-l-2 border-ivory-border pl-3 font-sans text-xs text-body">
            <p className="font-medium">
              {e.lifecycle_status.replace(/_/g, " ")} — {e.verification_status.replace(/_/g, " ")}
              {e.result ? ` — ${e.result.replace(/_/g, " ")}` : ""}
            </p>
            {e.verified_by && (
              <p className="text-muted">
                Verified by {e.verified_by}
                {e.verified_at ? ` on ${new Date(e.verified_at).toLocaleDateString()}` : ""}
              </p>
            )}
            {e.lifecycle_status_reason && (
              <p className="text-muted">
                {e.lifecycle_status.replace(/_/g, " ")}: {e.lifecycle_status_reason}
                {e.lifecycle_status_changed_by ? ` — ${e.lifecycle_status_changed_by}` : ""}
                {e.lifecycle_status_changed_at ? ` on ${new Date(e.lifecycle_status_changed_at).toLocaleDateString()}` : ""}
              </p>
            )}
            {e.document_id && (
              <div className="mt-1">
                <DocumentLink documentId={e.document_id} isPending={isPending} onView={onView} />
              </div>
            )}
          </li>
        ))}
    </ul>
  );
}

export function RegistryEvidenceCard({
  evaluation,
  workforceMemberId,
  canManage,
  history,
  rosterOptions,
  lifecycleStatus,
}: {
  evaluation: RequirementEvaluation;
  workforceMemberId: string;
  canManage: boolean;
  history: PersonEvidence[];
  lifecycleStatus: WorkforceLifecycleStatus;
  rosterOptions: Array<{ workforceMemberId: string; displayName: string }>;
}) {
  const { requirement, latestEvidence } = evaluation;
  // "Not currently required" overrides only a genuinely missing
  // requirement for a terminated caregiver — verified/awaiting/rejected/
  // expired evidence always displays as its real, historical status. See
  // lib/workforce/registrySummary.ts's resolveRequirementDisplay().
  const display = resolveRequirementDisplay(evaluation, lifecycleStatus);
  const status = display.displayStatus;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");

  // Verify/reject form state
  const [result, setResult] = useState<PersonEvidenceResult>("no_record_returned");
  const [notes, setNotes] = useState("");
  const [numericScore, setNumericScore] = useState("");

  // Edit-details form state
  const [editDocumentDate, setEditDocumentDate] = useState(latestEvidence?.effective_date ?? "");
  const [editNotes, setEditNotes] = useState(latestEvidence?.notes ?? "");

  // Reassign form state
  const [reassignTarget, setReassignTarget] = useState("");
  const [reassignRationale, setReassignRationale] = useState("");

  // Replace/correct/renew form state
  const [supersedeRationale, setSupersedeRationale] = useState("");

  // Entered-in-error form state
  const [errorReason, setErrorReason] = useState("");

  const availableActions = getAvailableEvidenceActions(latestEvidence);
  const expired = latestEvidence ? isEffectivelyExpired(latestEvidence) : false;

  function resetAndRefresh() {
    setMode("view");
    setError(null);
    router.refresh();
  }

  function viewDocument(documentId: string) {
    setError(null);
    startTransition(async () => {
      const res = await getWorkforceDocumentSignedUrl(documentId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  function handleUpload(formData: FormData) {
    formData.set("workforceMemberId", workforceMemberId);
    formData.set("requirementCode", requirement.requirement_code);
    formData.set("documentType", requirement.requirement_code.toLowerCase());
    setError(null);
    startTransition(async () => {
      const res = await uploadWorkforceDocument(formData);
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleVerify() {
    if (!latestEvidence) return;
    if (requirement.required_score !== null && !numericScore.trim()) {
      setError(`A score is required to verify ${requirement.name} (minimum ${requirement.required_score}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await verifyWorkforceEvidence({
        evidenceId: latestEvidence.id,
        workforceMemberId,
        requirementName: requirement.name,
        result,
        notes: notes.trim() || null,
        numericScore: numericScore.trim() ? Number(numericScore) : null,
      });
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleReject() {
    if (!latestEvidence) return;
    if (!notes.trim()) {
      setError("A reason is required to reject this evidence.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await rejectWorkforceEvidence({
        evidenceId: latestEvidence.id,
        workforceMemberId,
        requirementName: requirement.name,
        notes,
      });
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleEditDetails() {
    if (!latestEvidence) return;
    setError(null);
    startTransition(async () => {
      const res = await updateUnverifiedWorkforceEvidenceDetails({
        evidenceId: latestEvidence.id,
        documentDate: editDocumentDate || null,
        notes: editNotes || null,
      });
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleReassign() {
    if (!latestEvidence) return;
    if (!reassignTarget) {
      setError("Select the caregiver this evidence actually belongs to.");
      return;
    }
    if (!reassignRationale.trim()) {
      setError("A rationale is required to reassign evidence.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await reassignWorkforceEvidence({
        evidenceId: latestEvidence.id,
        newWorkforceMemberId: reassignTarget,
        rationale: reassignRationale,
      });
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleDelete() {
    if (!latestEvidence) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAccidentalWorkforceUpload(latestEvidence.id);
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleMarkEnteredInError() {
    if (!latestEvidence) return;
    if (!errorReason.trim()) {
      setError("A reason is required to mark this evidence entered in error.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await markWorkforceEvidenceEnteredInError({ evidenceId: latestEvidence.id, reason: errorReason });
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  function handleSupersede(formData: FormData, actionKind: "replace" | "correct" | "renew") {
    if (!latestEvidence) return;
    if (!supersedeRationale.trim()) {
      setError("A reason is required.");
      return;
    }
    formData.set("oldEvidenceId", latestEvidence.id);
    formData.set("rationale", supersedeRationale);
    setError(null);
    startTransition(async () => {
      const res = await supersedeWorkforceEvidence(formData, actionKind);
      if (res.error) setError(res.error);
      else resetAndRefresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-serif text-lg text-body">{requirement.name}</h4>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${
            STATUS_STYLES[status] ?? "bg-ivory-warm text-muted"
          }`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>

      {latestEvidence ? (
        <dl className="space-y-1 font-sans text-sm text-body">
          <div>
            <dt className="inline text-muted">Verification: </dt>
            <dd className="inline">{latestEvidence.verification_status.replace(/_/g, " ")}</dd>
          </div>
          {latestEvidence.lifecycle_status !== "active" && (
            <div>
              <dt className="inline text-muted">Currency: </dt>
              <dd className="inline">{latestEvidence.lifecycle_status.replace(/_/g, " ")}</dd>
            </div>
          )}
          {latestEvidence.result && (
            <div>
              <dt className="inline text-muted">Result: </dt>
              <dd className="inline">{latestEvidence.result.replace(/_/g, " ")}</dd>
            </div>
          )}
          {latestEvidence.numeric_score !== null && (
            <div>
              <dt className="inline text-muted">Score: </dt>
              <dd className="inline">
                {latestEvidence.numeric_score}
                {requirement.required_score !== null ? ` (required: ${requirement.required_score})` : ""}
              </dd>
            </div>
          )}
          {latestEvidence.effective_date && (
            <div>
              <dt className="inline text-muted">Search date: </dt>
              <dd className="inline">{latestEvidence.effective_date}</dd>
            </div>
          )}
          {latestEvidence.verified_by && (
            <div>
              <dt className="inline text-muted">Verified by: </dt>
              <dd className="inline">{latestEvidence.verified_by}</dd>
            </div>
          )}
          {latestEvidence.notes && (
            <div>
              <dt className="inline text-muted">Notes: </dt>
              <dd className="inline">{latestEvidence.notes}</dd>
            </div>
          )}
          {latestEvidence.document_id && canManage && (
            <div className="pt-1">
              <DocumentLink documentId={latestEvidence.document_id} isPending={isPending} onView={viewDocument} />
            </div>
          )}
        </dl>
      ) : (
        <p className="font-sans text-sm text-muted">
          {status === "not_currently_required" ? display.displayExplanation : "No evidence on file."}
        </p>
      )}

      {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}

      {/* Verify/reject — still-unreviewed evidence */}
      {canManage && latestEvidence && latestEvidence.verification_status === "unverified" && (
        <div className="mt-4 space-y-2 border-t border-ivory-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as PersonEvidenceResult)}
              className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            >
              {RESULT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {requirement.required_score !== null && (
              <input
                type="number"
                value={numericScore}
                onChange={(e) => setNumericScore(e.target.value)}
                placeholder={`Score (min. ${requirement.required_score})`}
                className="w-36 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
            )}
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (required to reject)"
              className="w-56 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleVerify}
              className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
            >
              Verify
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleReject}
              className="rounded-lg border border-ivory-border px-3.5 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* First upload */}
      {canManage && !latestEvidence && (
        <form action={handleUpload} className="mt-4 flex flex-wrap items-center gap-2 border-t border-ivory-border pt-4">
          <input type="file" name="file" accept="application/pdf" required className="font-sans text-xs text-body" />
          <input
            type="date"
            name="documentDate"
            className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
          >
            Upload
          </button>
        </form>
      )}

      {/* State-dependent actions menu */}
      {canManage && latestEvidence && availableActions.length > 0 && (
        <div className="mt-4 border-t border-ivory-border pt-4">
          <div className="flex flex-wrap gap-2">
            {availableActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setMode(mode === action ? "view" : action)}
                className={`rounded-lg px-3.5 py-1.5 font-sans text-xs font-medium ${
                  mode === action
                    ? "bg-navy text-white"
                    : "border border-ivory-border text-muted hover:border-navy/20 hover:text-body"
                }`}
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
          </div>

          {mode === "edit_details" && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={editDocumentDate}
                  onChange={(e) => setEditDocumentDate(e.target.value)}
                  className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                />
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes"
                  className="w-56 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={handleEditDetails}
                className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          {mode === "reassign" && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={reassignTarget}
                  onChange={(e) => setReassignTarget(e.target.value)}
                  className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                >
                  <option value="">Select the correct caregiver…</option>
                  {rosterOptions
                    .filter((r) => r.workforceMemberId !== workforceMemberId)
                    .map((r) => (
                      <option key={r.workforceMemberId} value={r.workforceMemberId}>
                        {r.displayName}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={reassignRationale}
                  onChange={(e) => setReassignRationale(e.target.value)}
                  placeholder="Why was this uploaded to the wrong caregiver?"
                  className="w-72 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={handleReassign}
                className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                Reassign
              </button>
            </div>
          )}

          {mode === "delete" && (
            <div className="mt-3 space-y-2">
              <p className="font-sans text-xs text-muted">
                This permanently removes the upload and its file. Only possible because it has never been reviewed.
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm delete
              </button>
            </div>
          )}

          {(mode === "replace" || mode === "correct" || mode === "upload_renewal") && (
            <form
              action={(fd) => handleSupersede(fd, mode === "upload_renewal" ? "renew" : mode)}
              className="mt-3 space-y-2"
            >
              <p className="font-sans text-xs text-muted">
                {mode === "correct"
                  ? "Corrects the recorded result/dates. Upload a new file only if the document itself was wrong."
                  : "The prior record is preserved in history — this creates a new record for review."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="file" name="file" accept="application/pdf" className="font-sans text-xs text-body" />
                <input
                  type="date"
                  name="documentDate"
                  className="rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                />
                <input
                  type="text"
                  value={supersedeRationale}
                  onChange={(e) => setSupersedeRationale(e.target.value)}
                  placeholder="Reason (required)"
                  className="w-56 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-navy px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                {mode === "upload_renewal" ? "Upload renewal" : ACTION_LABELS[mode]}
              </button>
            </form>
          )}

          {mode === "mark_entered_in_error" && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={errorReason}
                  onChange={(e) => setErrorReason(e.target.value)}
                  placeholder="Why was this entered in error?"
                  className="w-72 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={handleMarkEnteredInError}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          )}

          {mode === "view_history" && (
            <div className="mt-3">
              <HistoryList history={history} isPending={isPending} onView={viewDocument} />
            </div>
          )}
        </div>
      )}

      {/* History always available when there is any, even without an action button showing it */}
      {canManage && history.length > 0 && !availableActions.includes("view_history") && (
        <div className="mt-4 border-t border-ivory-border pt-4">
          <button
            type="button"
            onClick={() => setMode(mode === "view_history" ? "view" : "view_history")}
            className="font-sans text-xs font-medium text-muted underline hover:text-body"
          >
            {mode === "view_history" ? "Hide history" : `View history (${history.length})`}
          </button>
          {mode === "view_history" && (
            <div className="mt-3">
              <HistoryList history={history} isPending={isPending} onView={viewDocument} />
            </div>
          )}
        </div>
      )}

      {!canManage && expired && <p className="mt-3 font-sans text-xs text-muted">Contact an admin or manager to renew this evidence.</p>}
    </div>
  );
}

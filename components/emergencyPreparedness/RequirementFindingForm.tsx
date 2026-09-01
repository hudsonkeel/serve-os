"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordEmergencyPreparednessRequirementFindingAction,
  createEmergencyPreparednessCorrectiveActionAction,
} from "@/lib/actions/emergencyPreparedness";
import { FileUploadField } from "@/components/ui/FileUploadField";
import type {
  ComplianceCorrectiveActionPriority,
  ComplianceCorrectiveActionType,
  EmergencyPreparednessReviewOutcome,
} from "@/lib/supabase/types";

const OUTCOME_OPTIONS: { value: EmergencyPreparednessReviewOutcome; label: string }[] = [
  { value: "no_change_needed", label: "Reviewed — No Change Needed" },
  { value: "update_needed", label: "Reviewed — Update Needed" },
  { value: "evidence_needed", label: "Evidence Needed" },
  { value: "needs_review", label: "Needs Review" },
];

const PRIORITY_OPTIONS: ComplianceCorrectiveActionPriority[] = ["low", "normal", "high", "urgent"];

// Governance Connective Slice v0.1 — evidence_needed maps onto the
// existing evidence_missing corrective-action type; needs_review maps
// onto evidence_requires_review. No new action_type was needed for EPRP
// (unlike Incidents/Infections, whose follow-up work doesn't fit any
// existing evidence-shaped value).
function correctiveActionTypeFor(outcome: EmergencyPreparednessReviewOutcome): ComplianceCorrectiveActionType {
  return outcome === "evidence_needed" ? "evidence_missing" : "evidence_requires_review";
}

// Records one requirement finding for the review currently in progress —
// 'update_needed' requires a new supporting document (the artifact actually
// changed); every other outcome does not. Never rewrites the requirement's
// existing evidence — see lib/emergencyPreparedness/emergencyPreparednessReviews.ts.
//
// Governance Connective Slice v0.1 — after an evidence_needed/needs_review
// finding is saved, offers a confirm-gated "Create Corrective Action for
// this finding?" step, prefilled from the finding just recorded. Never
// automatic — the reviewer decides whether real tracked work is warranted,
// matching the same non-auto-create discipline used for Incidents/
// Infections (see CreateSourceLinkedCorrectiveActionButton). The created
// action is linked to this specific review item (reviewItemId), not just
// the requirement, so its provenance survives across future review cycles
// that might flag the same requirement again.
export function RequirementFindingForm({
  reviewId,
  requirementCode,
}: {
  reviewId: string;
  requirementCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EmergencyPreparednessReviewOutcome>("no_change_needed");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Set once the finding is saved, only for evidence_needed/needs_review —
  // drives the follow-on confirm-step below.
  const [pendingAction, setPendingAction] = useState<{
    reviewItemId: string;
    requirementId: string;
    outcome: EmergencyPreparednessReviewOutcome;
  } | null>(null);
  const [actionTitle, setActionTitle] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionPriority, setActionPriority] = useState<ComplianceCorrectiveActionPriority>("normal");
  const [actionDueAt, setActionDueAt] = useState("");
  const [actionCreated, setActionCreated] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("reviewId", reviewId);
      formData.set("requirementCode", requirementCode);
      formData.set("outcome", outcome);
      if (notes.trim()) formData.set("notes", notes.trim());
      if (file) formData.set("file", file);

      const res = await recordEmergencyPreparednessRequirementFindingAction(formData);
      if (res.error) {
        setError(res.error);
        return;
      }

      if ("item" in res && res.item && (outcome === "evidence_needed" || outcome === "needs_review") && res.item.requirement_id) {
        setPendingAction({ reviewItemId: res.item.id, requirementId: res.item.requirement_id, outcome });
        setActionTitle(`Emergency Preparedness follow-up — ${requirementCode}`);
        setActionReason(notes.trim() || (outcome === "evidence_needed" ? "Evidence needed." : "Needs review."));
      } else {
        setOpen(false);
      }
      setNotes("");
      setFile(null);
      router.refresh();
    });
  }

  function handleCreateAction(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAction) return;
    setError(null);
    if (!actionReason.trim()) {
      setError("Reason is required.");
      return;
    }
    startTransition(async () => {
      const res = await createEmergencyPreparednessCorrectiveActionAction({
        requirementId: pendingAction.requirementId,
        actionType: correctiveActionTypeFor(pendingAction.outcome),
        title: actionTitle.trim() || `Emergency Preparedness follow-up — ${requirementCode}`,
        reason: actionReason.trim(),
        priority: actionPriority,
        dueAt: actionDueAt || null,
        reviewItemId: pendingAction.reviewItemId,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setActionCreated(true);
      router.refresh();
    });
  }

  function closeAll() {
    setOpen(false);
    setPendingAction(null);
    setActionCreated(false);
  }

  if (actionCreated) {
    return <p className="font-sans text-xs text-muted">Corrective action created and linked to this finding.</p>;
  }

  if (pendingAction) {
    return (
      <form onSubmit={handleCreateAction} className="w-72 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
        <p className="font-sans text-[11px] text-muted">
          Finding recorded. Create a tracked corrective action for it? This is optional — the finding is saved either way.
        </p>
        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Title</span>
          <input
            type="text"
            value={actionTitle}
            onChange={(e) => setActionTitle(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Reason</span>
          <textarea
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            rows={2}
            className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Priority</span>
            <select
              value={actionPriority}
              onChange={(e) => setActionPriority(e.target.value as ComplianceCorrectiveActionPriority)}
              className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-sans text-[11px] font-medium text-muted">Due (optional)</span>
            <input
              type="date"
              value={actionDueAt}
              onChange={(e) => setActionDueAt(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
            />
          </label>
        </div>
        {error && <p className="font-sans text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create Corrective Action"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={closeAll}
            className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
          >
            Skip
          </button>
        </div>
      </form>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
      >
        Record Finding
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Outcome</span>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as EmergencyPreparednessReviewOutcome)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        >
          {OUTCOME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {outcome === "update_needed" && (
        <FileUploadField label="New document (PDF)" accept="application/pdf" value={file} onChange={setFile} />
      )}

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

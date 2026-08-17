"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkforceCorrectiveActionFromFindingAction } from "@/lib/actions/auditReadiness";
import type { WorkforceComplianceActionPriority, WorkforceComplianceActionType } from "@/lib/supabase/types";

const ACTION_TYPE_OPTIONS: { value: WorkforceComplianceActionType; label: string }[] = [
  { value: "evidence_missing", label: "Evidence Missing" },
  { value: "evidence_expired", label: "Evidence Expired" },
  { value: "evidence_expiring_soon", label: "Evidence Expiring Soon" },
  { value: "evidence_requires_review", label: "Evidence Requires Review" },
  { value: "evidence_awaiting_verification", label: "Evidence Awaiting Verification" },
];

const PRIORITY_OPTIONS: WorkforceComplianceActionPriority[] = ["low", "normal", "high", "urgent"];

// Creates a workforce_compliance_actions row from an audit finding — the
// workforce-native equivalent of the Audit-Readiness-native "create
// corrective action" step (compliance_corrective_actions structurally
// excludes workforce_member subjects). See
// createWorkforceCorrectiveActionFromFindingAction's own comment for why.
//
// `context` distinguishes two real, different reasons to open this: "fail"
// is the ordinary corrective-action case (evidence is genuinely missing/
// wrong); "pass" is the auditor having verified the requirement some other
// way (e.g. saw the original document in person) while the canonical file
// still isn't in Serve OS — a legitimate PASS that still needs a follow-up,
// not a failure. Same data (a WorkforceComplianceAction), different framing
// so a PASS finding with an open follow-up doesn't read as contradictory.
export function CreateWorkforceCorrectiveActionDialog({
  workforceMemberId,
  requirementId,
  requirementName,
  context = "fail",
}: {
  workforceMemberId: string;
  requirementId: string;
  requirementName: string;
  context?: "fail" | "pass";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<WorkforceComplianceActionType>(
    context === "pass" ? "evidence_awaiting_verification" : "evidence_requires_review"
  );
  const [title, setTitle] = useState(
    context === "pass" ? `Upload canonical evidence: ${requirementName}` : `Audit finding: ${requirementName}`
  );
  const [reason, setReason] = useState(
    context === "pass" ? "Verified outside Serve OS by the auditor — the canonical file still needs to be uploaded." : ""
  );
  const [priority, setPriority] = useState<WorkforceComplianceActionPriority>("normal");
  const [dueAt, setDueAt] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    startTransition(async () => {
      const res = await createWorkforceCorrectiveActionFromFindingAction({
        workforceMemberId,
        requirementId,
        actionType,
        title: title.trim() || requirementName,
        reason: reason.trim(),
        priority,
        dueAt: dueAt || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
      >
        {context === "pass" ? "Flag Canonical Evidence Needed" : "Create Corrective Action"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      {context === "pass" && (
        <p className="font-sans text-[11px] text-muted">
          You verified this outside Serve OS — this tracks that the canonical file still needs to be uploaded. It
          won&apos;t change the PASS finding you already recorded.
        </p>
      )}
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Type</span>
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as WorkforceComplianceActionType)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        >
          {ACTION_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-sans text-[11px] font-medium text-muted">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as WorkforceComplianceActionPriority)}
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
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
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
          Create
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

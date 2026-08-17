"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordAuditFindingAction } from "@/lib/actions/auditReadiness";
import type { AuditSessionItemFinding, AuditSessionItemSubjectType } from "@/lib/supabase/types";

const FINDING_OPTIONS: { value: AuditSessionItemFinding; label: string }[] = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "evidence_missing", label: "Evidence Missing" },
  { value: "needs_review", label: "Needs Review" },
];

// Records the auditor's finding for one (requirement, subject) pair in this
// session. evidenceId is fixed to whatever evidence the auditor was just
// shown for this requirement — it is not user-selectable, since this
// records a finding about the evidence already inspected, not a new
// evidence-linking action.
export function RecordAuditFindingDialog({
  sessionId,
  requirementId,
  subjectType,
  subjectId,
  evidenceId,
}: {
  sessionId: string;
  requirementId: string;
  subjectType: AuditSessionItemSubjectType;
  subjectId: string;
  evidenceId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState<AuditSessionItemFinding>("pass");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await recordAuditFindingAction({
        sessionId,
        requirementId,
        subjectType,
        subjectId,
        evidenceId,
        finding,
        notes: notes.trim() || null,
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
        className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
      >
        Record Finding
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Finding</span>
        <select
          value={finding}
          onChange={(e) => setFinding(e.target.value as AuditSessionItemFinding)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        >
          {FINDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

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
          Save
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

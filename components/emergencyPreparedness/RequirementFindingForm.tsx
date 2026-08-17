"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordEmergencyPreparednessRequirementFindingAction } from "@/lib/actions/emergencyPreparedness";
import { FileUploadField } from "@/components/ui/FileUploadField";
import type { EmergencyPreparednessReviewOutcome } from "@/lib/supabase/types";

const OUTCOME_OPTIONS: { value: EmergencyPreparednessReviewOutcome; label: string }[] = [
  { value: "no_change_needed", label: "Reviewed — No Change Needed" },
  { value: "update_needed", label: "Reviewed — Update Needed" },
  { value: "evidence_needed", label: "Evidence Needed" },
  { value: "needs_review", label: "Needs Review" },
];

// Records one requirement finding for the review currently in progress —
// 'update_needed' requires a new supporting document (the artifact actually
// changed); every other outcome does not. Never rewrites the requirement's
// existing evidence — see lib/emergencyPreparedness/emergencyPreparednessReviews.ts.
export function RequirementFindingForm({ reviewId, requirementCode }: { reviewId: string; requirementCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EmergencyPreparednessReviewOutcome>("no_change_needed");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

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
      setOpen(false);
      setNotes("");
      setFile(null);
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

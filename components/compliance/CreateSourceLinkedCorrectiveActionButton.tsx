"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createIncidentCorrectiveActionAction } from "@/lib/actions/incidents";
import { createInfectionCorrectiveActionAction } from "@/lib/actions/infections";
import type { ComplianceCorrectiveActionPriority } from "@/lib/supabase/types";

const PRIORITY_OPTIONS: ComplianceCorrectiveActionPriority[] = ["low", "normal", "high", "urgent"];

// Governance Connective Slice v0.1 — the confirm-gated corrective-action
// affordance for Incidents/Infections (see components/compliance/
// CreateWorkforceCorrectiveActionDialog.tsx, whose interaction pattern
// this mirrors). Deliberately never shown/wired automatically on
// follow_up_required=true — the caller (the incident/infection detail
// page) only renders this when status is open, follow_up_required is
// true, and no corrective action is already linked; confirming here is
// the one explicit, human decision that real tracked corrective work is
// warranted. title/reason are prefilled by the caller from the record's
// own fields so nothing already known is re-typed — the reviewer can
// still edit before confirming.
export function CreateSourceLinkedCorrectiveActionButton({
  kind,
  recordId,
  defaultTitle,
  defaultReason,
}: {
  kind: "incident" | "infection";
  recordId: string;
  defaultTitle: string;
  defaultReason: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [reason, setReason] = useState(defaultReason);
  const [priority, setPriority] = useState<ComplianceCorrectiveActionPriority>("normal");
  const [dueAt, setDueAt] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    startTransition(async () => {
      const res =
        kind === "incident"
          ? await createIncidentCorrectiveActionAction({
              incidentId: recordId,
              title: title.trim() || defaultTitle,
              reason: reason.trim(),
              priority,
              dueAt: dueAt || null,
            })
          : await createInfectionCorrectiveActionAction({
              infectionId: recordId,
              title: title.trim() || defaultTitle,
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
        Create Corrective Action
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
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
            onChange={(e) => setPriority(e.target.value as ComplianceCorrectiveActionPriority)}
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

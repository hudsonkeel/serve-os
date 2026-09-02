"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveCorrectiveActionAction } from "@/lib/actions/auditReadiness";

// Today's Work Actionability slice — the canonical resolution affordance
// for compliance_corrective_actions, wherever an open corrective Action is
// shown (incident/infection detail pages, Emergency Preparedness's
// requirement board). Mirrors components/compliance/
// CreateSourceLinkedCorrectiveActionButton.tsx's exact interaction pattern
// (compact affordance, explicit human action, expandable inline
// confirmation form) and calls the already-existing, already-authorized
// resolveCorrectiveActionAction() — never a new completion mechanism or a
// duplicate workspace-owned record. Resolving here changes only
// compliance_corrective_actions.status; it never rewrites or reopens the
// Incident/Infection/EPRP record that originated the Action.
export function ResolveCorrectiveActionButton({ actionId, actionTitle }: { actionId: string; actionTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  function handleSubmit(status: "resolved" | "dismissed") {
    if (!resolutionNote.trim()) {
      setError("A resolution note is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await resolveCorrectiveActionAction({ actionId, status, resolutionNote: resolutionNote.trim() });
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
        Resolve Corrective Action
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="w-80 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3"
    >
      <p className="font-sans text-xs font-medium text-muted">{actionTitle}</p>
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Resolution Note</span>
        <textarea
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={2}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSubmit("resolved")}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Resolve"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSubmit("dismissed")}
          className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

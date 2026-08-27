"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { resolveWorkforceComplianceActionAction } from "@/lib/actions/workforce";
import type { WorkforceComplianceAction } from "@/lib/supabase/types";

const PRIORITY_STYLES: Record<WorkforceComplianceAction["priority"], string> = {
  urgent: "bg-red-50 text-red-700",
  high: "bg-amber-50 text-amber-700",
  normal: "bg-blue-50 text-blue-700",
  low: "bg-ivory-warm text-muted",
};

function ActionRow({ action, workforceMemberId, canManage }: { action: WorkforceComplianceAction; workforceMemberId: string; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [resolving, setResolving] = useState<"resolved" | "dismissed" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function runResolve(status: "resolved" | "dismissed") {
    if (!note.trim()) {
      setError("A resolution note is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resolveWorkforceComplianceActionAction({
        actionId: action.id,
        workforceMemberId,
        status,
        resolutionNote: note,
      });
      if (result.error) setError(result.error);
      else {
        setResolving(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-ivory-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-sm font-medium text-body">{action.title}</p>
          <p className="mt-0.5 font-sans text-xs text-muted">{action.reason}</p>
          <p className="mt-1 font-sans text-[11px] text-subtle">
            {action.owner ? `Owner: ${action.owner}` : "Unassigned"}
            {action.due_at ? ` · Due ${new Date(action.due_at).toLocaleDateString()}` : ""}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${PRIORITY_STYLES[action.priority]}`}>
          {action.priority}
        </span>
      </div>

      {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}

      {canManage && (
        <div className="mt-2">
          {resolving ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (required)"
                className="w-64 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => runResolve(resolving)}
                className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
              >
                Confirm {resolving}
              </button>
              <Button type="button" size="small" onClick={() => setResolving(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResolving("resolved")}
                className="rounded-lg border border-ivory-border px-3 py-1 font-sans text-xs font-medium text-muted hover:border-navy/20"
              >
                Mark resolved
              </button>
              <button
                type="button"
                onClick={() => setResolving("dismissed")}
                className="rounded-lg border border-ivory-border px-3 py-1 font-sans text-xs font-medium text-muted hover:border-navy/20"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The Employee Record Audit's operational work queue — "who owns fixing
// it, and when is it due." Actions are generated automatically (see
// lib/workforce/complianceActionSync.ts) and resolve automatically once
// their requirement is satisfied; this list is for the ones still open.
export function WorkforceComplianceActionsList({
  actions,
  workforceMemberId,
  canManage,
}: {
  actions: WorkforceComplianceAction[];
  workforceMemberId: string;
  canManage: boolean;
}) {
  if (actions.length === 0) {
    return <p className="font-sans text-sm text-muted">No open compliance actions.</p>;
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <ActionRow key={action.id} action={action} workforceMemberId={workforceMemberId} canManage={canManage} />
      ))}
    </div>
  );
}

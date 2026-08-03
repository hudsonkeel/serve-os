"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerWorkforceComplianceActionSync } from "@/lib/actions/workforce";

// The on-demand equivalent of a scheduled sweep (this codebase has no
// cron) — reconciles every workforce member's Employee Record Audit
// actions against their current evidence. Same pattern as SyncNowButton.
export function SyncComplianceActionsButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await triggerWorkforceComplianceActionSync();
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setMessage(`Synced ${result.syncedCount ?? 0} workforce members.`);
            router.refresh();
          });
        }}
        className="rounded-lg border border-ivory-border px-4 py-2 font-sans text-sm font-medium text-muted hover:border-navy/20 hover:text-body disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync Compliance Actions"}
      </button>
      {message && <span className="font-sans text-xs text-muted">{message}</span>}
    </div>
  );
}

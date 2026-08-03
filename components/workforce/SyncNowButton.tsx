"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerAxisCareCaregiverSync } from "@/lib/actions/workforce";

export function SyncNowButton() {
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
            const result = await triggerAxisCareCaregiverSync();
            if (result.error) {
              setMessage(result.error);
              return;
            }
            const s = result.summary;
            setMessage(
              s
                ? `Sync complete: ${s.recordsReceived} received, ${s.reviewCandidatesCreated} new candidates for review, ${s.errors.length} errors.`
                : "Sync complete."
            );
            router.refresh();
          });
        }}
        className="rounded-lg border border-navy/20 bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync Now"}
      </button>
      {message && <span className="font-sans text-xs text-muted">{message}</span>}
    </div>
  );
}

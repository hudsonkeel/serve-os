"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerAxisCareCaregiverSync } from "@/lib/actions/workforce";
import { resolveSyncSummaryDisplay, type SyncStatusDisplay } from "@/lib/workforce/syncStatusDisplay";
import { Badge } from "@/components/ui/Badge";

export function SyncNowButton() {
  const [isPending, startTransition] = useTransition();
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [display, setDisplay] = useState<SyncStatusDisplay | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setPermissionError(null);
          setDisplay(null);
          startTransition(async () => {
            const result = await triggerAxisCareCaregiverSync();
            if (result.error) {
              setPermissionError(result.error);
              return;
            }
            if (result.summary) {
              setDisplay(resolveSyncSummaryDisplay(result.summary));
            }
            router.refresh();
          });
        }}
        className="rounded-lg border border-navy/20 bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync Now"}
      </button>
      {permissionError && <span className="font-sans text-xs text-muted">{permissionError}</span>}
      {display && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone={display.tone}>{display.tone === "danger" ? "Sync failed" : display.tone === "warning" ? "Completed with issues" : display.tone === "neutral" ? "Disabled" : "Success"}</Badge>
            <span className="font-sans text-xs text-muted">{display.message}</span>
          </div>
          {display.detail && <span className="font-sans text-xs text-muted">{display.detail}</span>}
        </div>
      )}
    </div>
  );
}

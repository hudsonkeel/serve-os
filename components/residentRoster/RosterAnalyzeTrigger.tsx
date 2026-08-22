"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeCommunityRosterImport } from "@/lib/actions/communityRosterImport";

// The normal Upload → Analyze flow never leaves a run sitting at
// 'analyzing' status on the client (uploadAndAnalyzeCommunityRoster does
// both steps in one server round trip). This component only matters for
// genuine failure recovery (section 106) — a run stuck at 'analyzing'
// because a prior attempt errored before completing. Deliberately a plain
// button, not an effect that auto-fires on mount: an explicit action the
// operator takes, not silent automation retrying on page load.
export function RosterAnalyzeTrigger({ runId }: { runId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runAnalysis() {
    setError(null);
    startTransition(async () => {
      const result = await analyzeCommunityRosterImport(runId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-ivory-border bg-ivory px-4 py-3">
      <p className="font-sans text-sm text-muted">
        {error ?? "This roster hasn't been analyzed yet."}
      </p>
      <button
        type="button"
        onClick={runAnalysis}
        disabled={isPending}
        className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Analyzing…" : "Analyze"}
      </button>
    </div>
  );
}

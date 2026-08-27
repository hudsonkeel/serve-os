"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { resolveOpenLoop } from "@/lib/actions/relationships";
import { RelationshipOpenLoop } from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface RelationshipOpenLoopsSectionProps {
  openLoops: RelationshipOpenLoop[];
}

export function RelationshipOpenLoopsSection({ openLoops }: RelationshipOpenLoopsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const open = openLoops.filter((o) => o.status === "open");

  function handleResolve(openLoopId: string, status: "resolved" | "no_longer_relevant") {
    startTransition(async () => {
      await resolveOpenLoop({ openLoopId, status });
      router.refresh();
    });
  }

  return (
    <div>
      <h4 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">Open Loops</h4>
      <p className="mb-4 font-sans text-sm text-subtle">Unresolved questions, dependencies, and decisions.</p>

      {open.length > 0 ? (
        <div className="space-y-3">
          {open.map((loop) => (
            <div key={loop.id} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                {loop.owner && <span className="font-sans text-sm text-muted">Owner: {loop.owner}</span>}
                {loop.target_resolution_date && (
                  <span className="font-sans text-sm text-muted">Target {compactDate(loop.target_resolution_date)}</span>
                )}
              </div>
              <p className="font-sans text-sm text-body">{loop.question}</p>
              <div className="mt-2 flex gap-3">
                <Button type="button" size="small" disabled={isPending} onClick={() => handleResolve(loop.id, "resolved")}>
                  Mark Resolved
                </Button>
                <Button type="button" size="small" disabled={isPending} onClick={() => handleResolve(loop.id, "no_longer_relevant")}>
                  No Longer Relevant
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState description="No open loops are currently tracked." />
      )}
    </div>
  );
}

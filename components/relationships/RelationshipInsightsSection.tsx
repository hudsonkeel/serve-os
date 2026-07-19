"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveInsight } from "@/lib/actions/relationships";
import { RELATIONSHIP_INSIGHT_CATEGORY_LABELS } from "@/lib/relationships/constants";
import { RelationshipInsight } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface RelationshipInsightsSectionProps {
  insights: RelationshipInsight[];
}

// Active Insights only — resolved/outdated Insights stay in the database
// (never deleted) but aren't shown here; this is "what currently matters,"
// not a full history. Correcting an outdated Insight means marking it
// outdated here and logging a new Interaction with the updated
// understanding — never editing this row's content in place.
export function RelationshipInsightsSection({ insights }: RelationshipInsightsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const active = insights.filter((i) => i.status === "active");

  function handleResolve(insightId: string, status: "resolved" | "outdated") {
    startTransition(async () => {
      await resolveInsight({ insightId, status });
      router.refresh();
    });
  }

  return (
    <div>
      <h4 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Active Insights
      </h4>
      <p className="mb-4 font-sans text-sm text-subtle">What Serve has learned that may matter later.</p>

      {active.length > 0 ? (
        <div className="space-y-3">
          {active.map((insight) => (
            <div key={insight.id} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Badge tone="blue">{RELATIONSHIP_INSIGHT_CATEGORY_LABELS[insight.category]}</Badge>
                <span className="font-sans text-sm text-muted">{compactDate(insight.created_at)}</span>
              </div>
              <p className="font-sans text-sm text-body">{insight.content}</p>
              {insight.why_it_matters && (
                <p className="mt-1 font-sans text-sm text-muted">Why it matters: {insight.why_it_matters}</p>
              )}
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleResolve(insight.id, "resolved")}
                  className="font-sans text-sm font-medium text-navy hover:text-navy-light disabled:opacity-60"
                >
                  Mark Resolved
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleResolve(insight.id, "outdated")}
                  className="font-sans text-sm font-medium text-muted hover:text-body disabled:opacity-60"
                >
                  Mark Outdated
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState description="No active insights recorded yet." />
      )}
    </div>
  );
}

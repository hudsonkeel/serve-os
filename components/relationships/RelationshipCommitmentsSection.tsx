"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveCommitment } from "@/lib/actions/relationships";
import { RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS } from "@/lib/relationships/constants";
import { RelationshipCommitment } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface RelationshipCommitmentsSectionProps {
  commitments: RelationshipCommitment[];
}

export function RelationshipCommitmentsSection({ commitments }: RelationshipCommitmentsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const open = commitments.filter((c) => c.status === "open");

  function handleResolve(commitmentId: string, status: "completed" | "cancelled") {
    startTransition(async () => {
      await resolveCommitment({ commitmentId, status });
      router.refresh();
    });
  }

  return (
    <div>
      <h4 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Open Commitments
      </h4>
      <p className="mb-4 font-sans text-sm text-subtle">What someone agreed to do.</p>

      {open.length > 0 ? (
        <div className="space-y-3">
          {open.map((commitment) => (
            <div key={commitment.id} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Badge tone="gold">
                  {RELATIONSHIP_COMMITMENT_RESPONSIBLE_PARTY_TYPE_LABELS[commitment.responsible_party_type]}
                  {commitment.responsible_party_reference ? ` — ${commitment.responsible_party_reference}` : ""}
                </Badge>
                {commitment.expected_date && (
                  <span className="font-sans text-sm text-muted">Expected {compactDate(commitment.expected_date)}</span>
                )}
              </div>
              <p className="font-sans text-sm text-body">{commitment.description}</p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleResolve(commitment.id, "completed")}
                  className="font-sans text-sm font-medium text-navy hover:text-navy-light disabled:opacity-60"
                >
                  Mark Completed
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleResolve(commitment.id, "cancelled")}
                  className="font-sans text-sm font-medium text-muted hover:text-body disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState description="No commitments are currently open." />
      )}
    </div>
  );
}

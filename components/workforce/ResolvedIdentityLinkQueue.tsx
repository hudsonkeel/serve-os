"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenWorkforceIdentityLink } from "@/lib/actions/workforce";
import type { PersonVendorIdentityLink } from "@/lib/supabase/types";

export interface ResolvedIdentityReviewRow {
  link: PersonVendorIdentityLink;
  candidateDisplayName: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  rejected: "bg-red-50 text-red-700",
  deferred: "bg-amber-50 text-amber-700",
};

function ResolvedIdentityRowView({ row }: { row: ResolvedIdentityReviewRow }) {
  const [isPending, startTransition] = useTransition();
  const [rationale, setRationale] = useState("");
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const { link, candidateDisplayName } = row;

  function runReopen() {
    if (!rationale.trim()) {
      setError("A rationale is required to reopen this decision.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reopenWorkforceIdentityLink({ linkId: link.id, rationale });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans text-sm font-medium text-body">
            AxisCare: {link.vendor_display_name ?? link.vendor_record_id}
          </p>
          <p className="mt-0.5 font-sans text-xs text-muted">
            {candidateDisplayName ? `Considered match: ${candidateDisplayName}` : "No candidate was proposed"}
          </p>
          <p className="mt-0.5 font-sans text-xs text-muted">
            {link.resolution_rationale} — {link.resolved_by}
            {link.resolved_at ? `, ${new Date(link.resolved_at).toLocaleString()}` : ""}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${STATUS_STYLES[link.status] ?? "bg-ivory-warm text-muted"}`}>
          {link.status}
        </span>
      </div>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      {reopening ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Rationale for reopening (required)"
            className="w-80 rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={runReopen}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
          >
            Confirm reopen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setReopening(true)}
          className="rounded-lg border border-ivory-border px-3.5 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Reopen for review
        </button>
      )}
    </div>
  );
}

export function ResolvedIdentityLinkQueue({ rows }: { rows: ResolvedIdentityReviewRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
        <p className="font-serif text-xl text-muted">No resolved identity decisions</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ivory-border rounded-xl border border-ivory-border bg-surface shadow-card">
      {rows.map((row) => (
        <ResolvedIdentityRowView key={row.link.id} row={row} />
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

export interface InfectionRowView {
  id: string;
  residentLabel: string;
  disclosedAtLabel: string;
  conditionSummary: string;
  status: "open" | "resolved";
  reviewStatus: "not_reviewed" | "reviewed";
  followUpRequired: boolean;
  owner: string | null;
}

type FilterTab = "all" | "open" | "needs_review" | "resolved";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "needs_review", label: "Needs Review" },
  { id: "resolved", label: "Resolved" },
];

function matchesFilter(row: InfectionRowView, tab: FilterTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "open":
      return row.status === "open";
    case "needs_review":
      return row.reviewStatus === "not_reviewed";
    case "resolved":
      return row.status === "resolved";
  }
}

export function InfectionRegisterTable({ rows }: { rows: InfectionRowView[] }) {
  const [tab, setTab] = useState<FilterTab>("all");
  const filtered = rows.filter((row) => matchesFilter(row, tab));

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {FILTER_TABS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTab(f.id)}
            className={`rounded-full border px-3 py-1.5 font-sans text-xs font-medium ${
              tab === f.id ? "border-navy bg-navy text-white" : "border-ivory-border text-muted hover:border-navy/30"
            }`}
          >
            {f.label} ({rows.filter((r) => matchesFilter(r, f.id)).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No infection records in this view</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ivory-border bg-white">
          <table className="w-full text-left font-sans text-sm">
            <thead className="border-b border-ivory-border bg-ivory-warm">
              <tr>
                <th className="px-4 py-3 font-medium text-muted">Client</th>
                <th className="px-4 py-3 font-medium text-muted">Disclosed</th>
                <th className="px-4 py-3 font-medium text-muted">Condition</th>
                <th className="px-4 py-3 font-medium text-muted">Status</th>
                <th className="px-4 py-3 font-medium text-muted">Review</th>
                <th className="px-4 py-3 font-medium text-muted">Owner</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-ivory-border last:border-b-0">
                  <td className="px-4 py-3 text-body">{row.residentLabel}</td>
                  <td className="px-4 py-3 text-muted">{row.disclosedAtLabel}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-muted">{row.conditionSummary}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.status === "resolved" ? "success" : "blue"}>
                      {row.status === "resolved" ? "Resolved" : "Open"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={row.reviewStatus === "reviewed" ? "neutral" : "warning"}>
                        {row.reviewStatus === "reviewed" ? "Reviewed" : "Needs Review"}
                      </Badge>
                      {row.followUpRequired && <Badge tone="warning">Follow-up Required</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{row.owner ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <LinkButton href={`/qapi/infections/${row.id}`} size="small">
                      View →
                    </LinkButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { OPERATIONAL_STATE_LABELS, OPERATIONAL_STATE_ORDER, OPERATIONAL_STATE_TONES } from "./operationalStateLabels";
import type { IncidentOperationalState } from "@/lib/compliance/incidentOperationalState";

export interface IncidentRowView {
  id: string;
  occurredAtLabel: string;
  involvedLabel: string;
  typeLabel: string;
  operationalState: IncidentOperationalState;
  owner: string | null;
}

type FilterTab = "all" | IncidentOperationalState;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  ...OPERATIONAL_STATE_ORDER.map((state) => ({ id: state, label: OPERATIONAL_STATE_LABELS[state] })),
];

function matchesFilter(row: IncidentRowView, tab: FilterTab): boolean {
  return tab === "all" || row.operationalState === tab;
}

// Incident Corrective Action Lifecycle v0.1 — the register answers "What
// happened? What requires my attention next? Who owns it?" via one derived
// operational-state badge (lib/compliance/incidentOperationalState.ts)
// rather than separately-shown status/review/follow-up flags, which the
// state itself already accounts for.
export function IncidentRegisterTable({ rows }: { rows: IncidentRowView[] }) {
  const [tab, setTab] = useState<FilterTab>("all");
  const filtered = rows.filter((row) => matchesFilter(row, tab));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
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
          <p className="font-serif text-xl text-muted">No incidents in this view</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ivory-border bg-white">
          <table className="w-full text-left font-sans text-sm">
            <thead className="border-b border-ivory-border bg-ivory-warm">
              <tr>
                <th className="px-4 py-3 font-medium text-muted">Occurred</th>
                <th className="px-4 py-3 font-medium text-muted">Involved</th>
                <th className="px-4 py-3 font-medium text-muted">Type</th>
                <th className="px-4 py-3 font-medium text-muted">Status</th>
                <th className="px-4 py-3 font-medium text-muted">Owner</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-ivory-border last:border-b-0">
                  <td className="px-4 py-3 text-muted">{row.occurredAtLabel}</td>
                  <td className="px-4 py-3 text-body">{row.involvedLabel}</td>
                  <td className="px-4 py-3 text-muted">{row.typeLabel}</td>
                  <td className="px-4 py-3">
                    <Badge tone={OPERATIONAL_STATE_TONES[row.operationalState]}>
                      {OPERATIONAL_STATE_LABELS[row.operationalState]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{row.owner ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <LinkButton href={`/qapi/incidents/${row.id}`} size="small">
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

"use client";

import { useState } from "react";

export interface CorrectionHistoryEntry {
  actor: string;
  createdAt: string;
  rationale: string;
  changeLines: string[];
}

// The structured diff log a completed audit's "View changes →" expands
// into — every correction event, its rationale, and exactly what changed
// under it. Purely presentational; all resolution (requirement/subject
// names, description text) already happened server-side.
export function CorrectionHistory({ entries }: { entries: CorrectionHistoryEntry[] }) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-sans text-sm font-medium text-navy hover:text-navy-light"
      >
        {open ? "Hide changes" : "View changes"} →
      </button>
      {open && (
        <ul className="mt-3 space-y-4">
          {entries.map((entry, i) => (
            <li key={i} className="rounded-lg border border-ivory-border bg-ivory-warm p-3">
              <p className="font-sans text-xs font-medium text-muted">
                {entry.actor}, {entry.createdAt}
              </p>
              <p className="mt-1 font-sans text-sm text-body">{entry.rationale}</p>
              <ul className="mt-2 space-y-1">
                {entry.changeLines.map((line, j) => (
                  <li key={j} className="font-sans text-xs text-muted">
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

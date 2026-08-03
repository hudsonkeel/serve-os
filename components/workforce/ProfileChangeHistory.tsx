"use client";

import { useState } from "react";
import type { WorkforceProfileChange } from "@/lib/supabase/types";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  canonical_correction: "Canonical correction",
  preferred_value_change: "Preference change",
  community_override: "Community update",
  profile_reviewed: "Profile reviewed",
  profile_unlocked: "Profile unlocked",
  profile_locked: "Profile locked",
  discrepancy_flagged: "Discrepancy flagged",
  discrepancy_resolved: "Discrepancy resolved",
};

// "Do not rely only on updated_at" — one row per changed field, per save.
// See supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
export function ProfileChangeHistory({ changes }: { changes: WorkforceProfileChange[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 font-sans text-label font-semibold uppercase tracking-widest text-muted"
      >
        <span>Profile Change History ({changes.length})</span>
        <span className="font-sans text-xs normal-case tracking-normal text-subtle">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="divide-y divide-ivory-border border-t border-ivory-border">
          {changes.length === 0 ? (
            <p className="px-6 py-6 font-sans text-sm text-muted">No changes recorded yet.</p>
          ) : (
            changes.map((change) => (
              <div key={change.id} className="px-6 py-3">
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-subtle">
                  {new Date(change.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
                  {CHANGE_TYPE_LABELS[change.change_type] ?? change.change_type}
                </p>
                <p className="mt-1 font-sans text-sm text-body">
                  <span className="font-medium">{change.field_name.replace(/_/g, " ")}</span> changed:{" "}
                  <span className="text-muted">{change.previous_value ?? "—"}</span> {"->"} <span>{change.new_value ?? "—"}</span>
                </p>
                <p className="mt-0.5 font-sans text-xs text-muted">
                  Changed by {change.actor}
                  {change.rationale ? ` · Reason: ${change.rationale}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

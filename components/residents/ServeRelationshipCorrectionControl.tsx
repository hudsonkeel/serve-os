"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { correctServeRelationship } from "@/lib/actions/residents";
import type { ServeRelationship } from "@/lib/residents/serveRelationshipProjection";

const RELATIONSHIP_OPTIONS: { value: ServeRelationship; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "active_client", label: "Active Client" },
  { value: "inactive_client", label: "Inactive Client" },
  { value: "no_current_relationship", label: "No Current Relationship" },
  { value: "needs_review", label: "Needs Review" },
];

interface ServeRelationshipCorrectionControlProps {
  residentId: string;
  // Seeds the dropdown's initial selection — the currently DISPLAYED
  // (possibly already-corrected) relationship, so the control opens on
  // whatever's governing today.
  currentValue: ServeRelationship;
  // The live, uncorrected natural/source relationship (see
  // ServeRelationshipProjectionWithCorrection.naturalRelationship) —
  // deliberately distinct from currentValue. This is what gets recorded
  // as the new correction's previousValue, so a later comparison can
  // tell "the source hasn't changed since this was reviewed" from "the
  // source changed." Using currentValue here instead would, after a
  // first correction, capture the prior correction's own chosen value
  // rather than the source, breaking that comparison on every
  // subsequent correction.
  naturalValue: ServeRelationship;
}

// Governed "fix incorrect stuff" control for a resident's Serve
// relationship — never a way to mask a known matching/projection
// defect (those get fixed at the source, like the Michele Helsley and
// Bob/Pam Hatch matcher fixes), only a way to record reviewed Serve
// canonical truth when the computed answer is genuinely wrong for a
// reason evidence can't capture. Every correction is durable and
// audited (actor, timestamp, rationale, previous/new value) — see
// lib/data/residentServeRelationshipCorrections.ts.
export function ServeRelationshipCorrectionControl({ residentId, currentValue, naturalValue }: ServeRelationshipCorrectionControlProps) {
  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState<ServeRelationship>(currentValue);
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function handleSubmit() {
    if (!rationale.trim()) {
      setMessage({ type: "error", text: "A rationale is required." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await correctServeRelationship({ residentId, previousValue: naturalValue, newValue, rationale: rationale.trim() });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Correction saved." });
        setOpen(false);
        setRationale("");
      }
    });
  }

  return (
    <div className="pointer-events-auto relative z-[2]" onClick={(e) => e.stopPropagation()}>
      {!open ? (
        <Button type="button" size="small" onClick={() => setOpen(true)}>
          Correct relationship
        </Button>
      ) : (
        <div className="mt-2 max-w-sm space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
          <select
            value={newValue}
            onChange={(e) => setNewValue(e.target.value as ServeRelationship)}
            className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          >
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            placeholder="Rationale (required)"
            className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              Save Correction
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className={`mt-1 font-sans text-sm ${message.type === "error" ? "text-danger-text" : "text-success-text"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

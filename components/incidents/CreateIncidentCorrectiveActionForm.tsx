"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { createIncidentCorrectiveActionAction } from "@/lib/actions/incidents";
import type { ComplianceCorrectiveActionPriority } from "@/lib/supabase/types";

const PRIORITY_OPTIONS: ComplianceCorrectiveActionPriority[] = ["low", "normal", "high", "urgent"];

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

// Incident Corrective Action Lifecycle v0.1 — replaces the old single-shot
// CreateSourceLinkedCorrectiveActionButton for incidents (that component
// still serves infections, unchanged). Deliberately does NOT prefill
// Finding from the incident's description — incident facts already exist
// on the source incident; a corrective action's Finding is its own
// statement of why this specific action exists. Reusable for "Add
// Additional Action" after a Partially Effective/Ineffective effectiveness
// review — every call is a plain new row, multiple actions per incident
// are fully supported.
export function CreateIncidentCorrectiveActionForm({
  incidentId,
  defaultTitle,
  onDone,
}: {
  incidentId: string;
  defaultTitle?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [finding, setFinding] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<ComplianceCorrectiveActionPriority>("normal");
  const [dueAt, setDueAt] = useState("");

  const [effectivenessRequired, setEffectivenessRequired] = useState(false);
  const [effectivenessDueAt, setEffectivenessDueAt] = useState("");
  const [effectivenessOwner, setEffectivenessOwner] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    if (!finding.trim()) {
      setError("A finding / reason is required.");
      return;
    }
    if (!actionPlan.trim()) {
      setError("An action to be taken is required.");
      return;
    }
    if (effectivenessRequired && !effectivenessDueAt) {
      setError("An effectiveness review due date is required.");
      return;
    }
    if (effectivenessRequired && !successCriteria.trim()) {
      setError("Success criteria are required for an effectiveness review.");
      return;
    }

    startTransition(async () => {
      const res = await createIncidentCorrectiveActionAction({
        incidentId,
        title: title.trim(),
        finding: finding.trim(),
        actionPlan: actionPlan.trim(),
        owner: owner.trim() || null,
        priority,
        dueAt: dueAt || null,
        effectivenessReviewRequired: effectivenessRequired,
        effectivenessReviewDueAt: effectivenessRequired ? effectivenessDueAt : null,
        effectivenessReviewOwner: effectivenessRequired ? effectivenessOwner.trim() || null : null,
        effectivenessSuccessCriteria: effectivenessRequired ? successCriteria.trim() : null,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      router.refresh();
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ivory-border bg-ivory-warm p-4">
      <label className="block">
        <span className={labelClassName}>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClassName} />
      </label>

      <label className="block">
        <span className={labelClassName}>Finding / Reason</span>
        <AutoGrowTextarea
          value={finding}
          onChange={(e) => setFinding(e.target.value)}
          minRows={2}
          placeholder="Why is this corrective action needed?"
        />
      </label>

      <label className="block">
        <span className={labelClassName}>Action to Be Taken</span>
        <AutoGrowTextarea
          value={actionPlan}
          onChange={(e) => setActionPlan(e.target.value)}
          minRows={2}
          placeholder="What will be done."
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Owner</span>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Who owns this action?"
            className={fieldClassName}
          />
        </label>

        <label className="block">
          <span className={labelClassName}>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as ComplianceCorrectiveActionPriority)} className={fieldClassName}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Target Completion Date</span>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={fieldClassName} />
        </label>
      </div>

      <div className="border-t border-ivory-border pt-4">
        <label className="flex items-center gap-2 font-sans text-sm text-body">
          <input
            type="checkbox"
            checked={effectivenessRequired}
            onChange={(e) => setEffectivenessRequired(e.target.checked)}
          />
          Effectiveness review required
        </label>

        {effectivenessRequired && (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClassName}>Effectiveness Review Due Date</span>
                <input
                  type="date"
                  value={effectivenessDueAt}
                  onChange={(e) => setEffectivenessDueAt(e.target.value)}
                  className={fieldClassName}
                />
              </label>
              <label className="block">
                <span className={labelClassName}>Effectiveness Review Owner (optional)</span>
                <input
                  type="text"
                  value={effectivenessOwner}
                  onChange={(e) => setEffectivenessOwner(e.target.value)}
                  placeholder="Who will evaluate effectiveness?"
                  className={fieldClassName}
                />
              </label>
            </div>
            <label className="block">
              <span className={labelClassName}>Success Criteria / Expected Evidence</span>
              <AutoGrowTextarea
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                minRows={2}
                placeholder="What evidence would show this action worked?"
              />
            </label>
          </div>
        )}
      </div>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : "Create Corrective Action"}
        </Button>
        {onDone && (
          <Button type="button" onClick={onDone} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { CorrectiveActionCard } from "@/components/compliance/CorrectiveActionCard";
import { CreateIncidentCorrectiveActionForm } from "./CreateIncidentCorrectiveActionForm";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, CorrectiveActionUpdate } from "@/lib/supabase/types";

// Incident Corrective Action Lifecycle v0.1 — replaces the old single-
// action "Corrective Action" section. Owns the one "create a new action"
// form's open/closed state so both the top-level "+ Add Corrective Action"
// affordance and any card's "+ Add Additional Action" (after a Partially
// Effective/Ineffective effectiveness review) open the exact same form,
// never a second, divergent creation path.
export function IncidentCorrectiveActionsSection({
  incidentId,
  actions,
  effectivenessReviewsByActionId,
  updatesByActionId,
  canManage,
  canCreate,
}: {
  incidentId: string;
  actions: ComplianceCorrectiveAction[];
  effectivenessReviewsByActionId: Map<string, CorrectiveActionEffectivenessReview>;
  updatesByActionId: Map<string, CorrectiveActionUpdate[]>;
  canManage: boolean;
  canCreate: boolean;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="space-y-4">
      {actions.length === 0 && !showCreateForm && (
        <p className="font-sans text-sm text-muted">No corrective actions tracked yet.</p>
      )}

      {actions.map((action) => (
        <CorrectiveActionCard
          key={action.id}
          action={action}
          effectivenessReview={effectivenessReviewsByActionId.get(action.id) ?? null}
          updates={updatesByActionId.get(action.id) ?? []}
          canManage={canManage}
          onRequestAdditionalAction={() => setShowCreateForm(true)}
        />
      ))}

      {canCreate && showCreateForm && (
        <CreateIncidentCorrectiveActionForm incidentId={incidentId} onDone={() => setShowCreateForm(false)} />
      )}

      {canCreate && !showCreateForm && (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          {actions.length > 0 ? "+ Add Another Corrective Action" : "+ Add Corrective Action"}
        </button>
      )}
    </div>
  );
}

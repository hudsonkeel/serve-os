"use client";

import { useState } from "react";
import { CorrectiveActionCard } from "@/components/compliance/CorrectiveActionCard";
import { CreateInfectionCorrectiveActionForm } from "./CreateInfectionCorrectiveActionForm";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, CorrectiveActionUpdate } from "@/lib/supabase/types";

// Infection Lifecycle & Learning Loop v0.1 — the OPTIONAL Serve corrective
// action branch, structurally mirroring
// components/incidents/IncidentCorrectiveActionsSection.tsx. Always
// available (canCreate is never gated on follow_up_required — see
// create_infection_corrective_action's own comment) — a Serve process/
// infection-control/service-delivery concern can be identified whether or
// not the client's own follow-up loop is open.
export function InfectionCorrectiveActionsSection({
  infectionId,
  actions,
  effectivenessReviewsByActionId,
  updatesByActionId,
  canManage,
  canCreate,
}: {
  infectionId: string;
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
        <p className="font-sans text-sm text-muted">No Serve process or infection-control concern has been raised for this record.</p>
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
        <CreateInfectionCorrectiveActionForm infectionId={infectionId} onDone={() => setShowCreateForm(false)} />
      )}

      {canCreate && !showCreateForm && (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          {actions.length > 0 ? "+ Add Another Corrective Action" : "+ Raise Serve Process / Infection-Control Concern"}
        </button>
      )}
    </div>
  );
}

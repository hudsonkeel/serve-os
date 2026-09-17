"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getRelationshipsByResident, getResidentDisplayNameById } from "@/lib/data/relationships";
import { createRelationship } from "@/lib/actions/relationships";
import { decideClientEnrollmentAction } from "@/lib/relationships/enrollment";

// Client enrollment (Slice 1: Service Agreement -> Enrolled Inactive
// Client, 2026-09-15). Called from recordServiceAgreementEvidenceAction()
// the moment signed Service Agreement evidence is recorded for a resident
// -- never from assessment approval. Establishes the person as an
// enrolled Serve Client whose canonical ServeRelationship is
// inactive_client (see lib/residents/serveRelationshipProjection.ts).
// Deliberately has no way to produce active_client -- activation is a
// separate, later, explicit action (not part of this slice), so
// enrollment can never accidentally create an Active AxisCare client
// (Serve is billed by AxisCare per Active client).
//
// Known, deferred concurrency risk: the create_then_convert path below
// has no locking around "check for an existing relationship, else create
// one" -- see docs/assessment/ASSESSMENT_TO_CLIENT_V0.1_HANDOFF.md §10a.
// Acknowledged, explicitly out of scope for this slice.

export interface EnrollResidentResult {
  error?: string;
  relationshipId?: string;
  alreadyEnrolled?: boolean;
}

export async function enrollResidentAsInactiveClient(input: {
  residentId: string;
  actor: string;
  effectiveDate?: string;
  conversionNote?: string;
}): Promise<EnrollResidentResult> {
  const existingRelationships = await getRelationshipsByResident(input.residentId);
  const decision = decideClientEnrollmentAction(
    existingRelationships.map((r) => ({ id: r.id, relationshipType: r.relationship_type, status: r.status }))
  );

  if (decision.kind === "already_enrolled") {
    return { relationshipId: decision.relationshipId, alreadyEnrolled: true };
  }

  let relationshipId: string;
  if (decision.kind === "convert_existing") {
    relationshipId = decision.relationshipId;
  } else {
    const displayName = (await getResidentDisplayNameById(input.residentId)) ?? "Unnamed Resident";
    const created = await createRelationship({
      relationshipType: "resident_prospect",
      stage: "assessment_completed",
      displayName: `${displayName} — Prospect`,
      residentId: input.residentId,
      priority: "normal",
      sourceType: "client_readiness",
      sourceLabel: "Service Agreement recorded",
    });
    if (created.error || !created.id) {
      return { error: created.error || "Could not create the prospect relationship needed for enrollment." };
    }
    relationshipId = created.id;
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc("convert_resident_prospect_to_inactive_client", {
    p_relationship_id: relationshipId,
    p_effective_date: input.effectiveDate ?? new Date().toISOString().slice(0, 10),
    p_conversion_note: input.conversionNote ?? "Enrolled as a Serve Client — signed Service Agreement on file.",
    p_actor: input.actor,
  });

  if (error) {
    return { error: `Could not enroll as a Client: ${error.message}` };
  }

  return { relationshipId };
}

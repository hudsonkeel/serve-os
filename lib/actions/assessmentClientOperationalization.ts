"use server";

// Client operationalization — "Make Active Client" from an approved assessment. Reuses the
// EXISTING convert_resident_prospect_to_active_client() RPC and createRelationship() action
// rather than duplicating any of that governed logic — see docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §7. Never creates a second person: Resident and
// Client are not mutually exclusive identities, this only changes a relationship's type.

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/supabase/server";
import { getRelationshipsByResident } from "@/lib/data/relationships";
import { createRelationship } from "@/lib/actions/relationships";
import { updateAssessmentSessionStatus } from "@/lib/data/assessmentIntelligence";

export async function makeActiveClientFromAssessment(input: {
  assessmentSessionId: string;
  residentId: string;
  residentDisplayName: string;
  effectiveStartDate: string;
  conversionNote?: string;
}): Promise<{ error?: string; relationshipId?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in." };
  if (!canEditResidentProfile(profile.role)) {
    return { error: "You do not have permission to convert this person to an Active Client." };
  }
  const actor = profile.full_name || profile.email;

  const existingRelationships = await getRelationshipsByResident(input.residentId);
  let resientProspectRelationshipId = existingRelationships.find(
    (r) => r.relationship_type === "resident_prospect" && r.status !== "closed"
  )?.id;

  if (!resientProspectRelationshipId) {
    const created = await createRelationship({
      relationshipType: "resident_prospect",
      stage: "assessment_completed",
      displayName: `${input.residentDisplayName} — Prospect`,
      residentId: input.residentId,
      priority: "normal",
      sourceType: "assessment_intelligence",
      sourceLabel: "Assessment approval",
    });
    if (created.error || !created.id) {
      return { error: created.error || "Could not create the prospect relationship needed for conversion." };
    }
    resientProspectRelationshipId = created.id;
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc("convert_resident_prospect_to_active_client", {
    p_relationship_id: resientProspectRelationshipId,
    p_effective_start_date: input.effectiveStartDate,
    p_conversion_note: input.conversionNote ?? "Converted from an approved Serve assessment.",
    // "dismiss", not "complete" — this automated conversion path has no basis to claim any
    // pre-existing open action was actually completed; verified valid values by reading
    // resolve_relationship_open_actions() directly (only 'complete'|'dismiss' exist).
    p_open_action_disposition: "dismiss",
    p_onboarding_action_title: "Confirm AxisCare readiness",
    p_onboarding_action_type: "follow_up",
    p_onboarding_action_due_at: null,
    p_actor: actor,
  });

  if (error) {
    return { error: `Could not convert to Active Client: ${error.message}` };
  }

  await updateAssessmentSessionStatus(input.assessmentSessionId, "operationalized");

  return { relationshipId: resientProspectRelationshipId };
}

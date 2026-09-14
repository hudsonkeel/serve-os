// Data layer for infection_follow_ups — the append-only longitudinal
// follow-up timeline (Infection Lifecycle & Learning Loop v0.1). No
// Incident analog. See
// supabase/migrations/20260913000000_add_infection_follow_up_lifecycle.sql
// for the schema/RPC contract this mirrors.
import { createServerClient } from "../supabase/server.ts";
import type {
  InfectionFollowUp,
  InfectionFollowUpInformationSource,
  InfectionFollowUpPurpose,
  InfectionFollowUpReportedStatus,
  InfectionFollowUpServiceImpact,
} from "../supabase/types.ts";

export async function getFollowUpsForInfection(infectionId: string): Promise<InfectionFollowUp[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("infection_follow_ups")
    .select("*")
    .eq("infection_id", infectionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getFollowUpsForInfection]", { infectionId, message: error.message });
    return [];
  }

  return (data as InfectionFollowUp[] | null) ?? [];
}

export interface RecordInfectionFollowUpInput {
  infectionId: string;
  reportedStatus: InfectionFollowUpReportedStatus;
  serviceImpact: InfectionFollowUpServiceImpact;
  serveResponse: string[];
  narrativeNote: string | null;
  informationSource: InfectionFollowUpInformationSource;
  additionalFollowUpRequired: boolean;
  nextFollowUpDate: string | null;
  nextFollowUpPurpose: InfectionFollowUpPurpose | null;
  nextFollowUpPurposeNote: string | null;
  actor: string;
}

// The real observation entry — inserts one append-only timeline row and,
// server-side in the same transaction, sets or clears the parent
// infection's current-obligation columns. See record_infection_follow_up.
export async function recordInfectionFollowUp(
  input: RecordInfectionFollowUpInput
): Promise<{ followUp?: InfectionFollowUp; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("record_infection_follow_up", {
      p_infection_id: input.infectionId,
      p_reported_status: input.reportedStatus,
      p_service_impact: input.serviceImpact,
      p_serve_response: input.serveResponse,
      p_narrative_note: input.narrativeNote,
      p_information_source: input.informationSource,
      p_additional_follow_up_required: input.additionalFollowUpRequired,
      p_next_follow_up_date: input.nextFollowUpDate,
      p_next_follow_up_purpose: input.nextFollowUpPurpose,
      p_next_follow_up_purpose_note: input.nextFollowUpPurposeNote,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not record infection follow-up: ${error?.message}` };
  }

  return { followUp: data as InfectionFollowUp };
}

// Data layer for the incidents table — plain CRUD + the three governed
// state transitions (create/mark-reviewed/resolve), each backed by the RPC
// of the same name in
// supabase/migrations/20260907000000_create_incidents_and_infections.sql.
// No business logic lives here: community resolution, subject-existence
// checks, and role authorization all happen one layer up in
// lib/actions/incidents.ts, which is the only caller that may pass an
// `actor` — this file trusts whatever actor string it's given, the same
// way lib/data/complianceCorrectiveActions.ts does.
import { createServerClient } from "../supabase/server.ts";
import type { CommunityQueryFilter } from "../auth/communityScope.ts";
import type { Incident, IncidentType } from "../supabase/types.ts";

export async function listIncidents(filter: CommunityQueryFilter): Promise<Incident[]> {
  if (filter.mode === "none") return [];

  const supabase = createServerClient();
  let query = supabase.from("incidents").select("*");
  if (filter.mode === "single") {
    query = query.eq("community_id", filter.communityId);
  }

  const { data, error } = await query.order("occurred_at", { ascending: false });

  if (error) {
    console.error("[incidents:listIncidents:error]", { message: error.message });
    return [];
  }

  return (data as Incident[] | null) ?? [];
}

export async function getIncidentById(id: string): Promise<Incident | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("incidents").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[incidents:getIncidentById:error]", { id, message: error.message });
    return null;
  }

  return (data as Incident | null) ?? null;
}

export interface CreateIncidentInput {
  communityId: string | null;
  residentId: string | null;
  workforceMemberId: string | null;
  occurredAt: string;
  location: string | null;
  incidentType: IncidentType;
  incidentTypeOther: string | null;
  description: string;
  immediateResponse: string | null;
  injuryOccurred: boolean;
  injuryMedicalDetails: string | null;
  partiesNotified: string[];
  followUpRequired: boolean;
  owner: string | null;
  notes: string | null;
  actor: string;
}

export async function createIncident(input: CreateIncidentInput): Promise<{ incident?: Incident; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("create_incident", {
      p_community_id: input.communityId,
      p_resident_id: input.residentId,
      p_workforce_member_id: input.workforceMemberId,
      p_occurred_at: input.occurredAt,
      p_location: input.location,
      p_incident_type: input.incidentType,
      p_incident_type_other: input.incidentTypeOther,
      p_description: input.description,
      p_immediate_response: input.immediateResponse,
      p_injury_occurred: input.injuryOccurred,
      p_injury_medical_details: input.injuryMedicalDetails,
      p_parties_notified: input.partiesNotified,
      p_follow_up_required: input.followUpRequired,
      p_owner: input.owner,
      p_notes: input.notes,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not create incident: ${error?.message}` };
  }

  return { incident: data as Incident };
}

export interface MarkIncidentReviewedInput {
  incidentId: string;
  followUpRequired: boolean;
  owner: string | null;
  actor: string;
}

export async function markIncidentReviewed(input: MarkIncidentReviewedInput): Promise<{ incident?: Incident; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("mark_incident_reviewed", {
      p_incident_id: input.incidentId,
      p_follow_up_required: input.followUpRequired,
      p_owner: input.owner,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not mark incident reviewed: ${error?.message}` };
  }

  return { incident: data as Incident };
}

export interface ResolveIncidentInput {
  incidentId: string;
  resolutionNote: string;
  actor: string;
}

export async function resolveIncident(input: ResolveIncidentInput): Promise<{ incident?: Incident; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("resolve_incident", {
      p_incident_id: input.incidentId,
      p_resolution_note: input.resolutionNote,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not resolve incident: ${error?.message}` };
  }

  return { incident: data as Incident };
}

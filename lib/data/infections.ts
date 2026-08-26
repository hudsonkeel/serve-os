// Data layer for the infections table — mirrors lib/data/incidents.ts
// exactly (plain CRUD + the three governed RPC-backed state transitions).
// See supabase/migrations/20260907000000_create_incidents_and_infections.sql
// for the schema/RPC contract. No business logic here — community
// resolution, resident-existence checks, and role authorization live in
// lib/actions/infections.ts.
import { createServerClient } from "../supabase/server.ts";
import type { CommunityQueryFilter } from "../auth/communityScope.ts";
import type { Infection } from "../supabase/types.ts";

export async function listInfections(filter: CommunityQueryFilter): Promise<Infection[]> {
  if (filter.mode === "none") return [];

  const supabase = createServerClient();
  let query = supabase.from("infections").select("*");
  if (filter.mode === "single") {
    query = query.eq("community_id", filter.communityId);
  }

  const { data, error } = await query.order("disclosed_at", { ascending: false });

  if (error) {
    console.error("[infections:listInfections:error]", { message: error.message });
    return [];
  }

  return (data as Infection[] | null) ?? [];
}

export async function getInfectionById(id: string): Promise<Infection | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("infections").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[infections:getInfectionById:error]", { id, message: error.message });
    return null;
  }

  return (data as Infection | null) ?? null;
}

export interface CreateInfectionInput {
  communityId: string | null;
  residentId: string;
  disclosedAt: string;
  conditionDescription: string;
  treatmentDescription: string | null;
  disclosedBy: string | null;
  followUpRequired: boolean;
  owner: string | null;
  notes: string | null;
  actor: string;
}

export async function createInfection(input: CreateInfectionInput): Promise<{ infection?: Infection; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("create_infection", {
      p_community_id: input.communityId,
      p_resident_id: input.residentId,
      p_disclosed_at: input.disclosedAt,
      p_condition_description: input.conditionDescription,
      p_treatment_description: input.treatmentDescription,
      p_disclosed_by: input.disclosedBy,
      p_follow_up_required: input.followUpRequired,
      p_owner: input.owner,
      p_notes: input.notes,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not create infection record: ${error?.message}` };
  }

  return { infection: data as Infection };
}

export interface MarkInfectionReviewedInput {
  infectionId: string;
  followUpRequired: boolean;
  owner: string | null;
  actor: string;
}

export async function markInfectionReviewed(input: MarkInfectionReviewedInput): Promise<{ infection?: Infection; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("mark_infection_reviewed", {
      p_infection_id: input.infectionId,
      p_follow_up_required: input.followUpRequired,
      p_owner: input.owner,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not mark infection record reviewed: ${error?.message}` };
  }

  return { infection: data as Infection };
}

export interface ResolveInfectionInput {
  infectionId: string;
  resolutionNote: string;
  actor: string;
}

export async function resolveInfection(input: ResolveInfectionInput): Promise<{ infection?: Infection; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("resolve_infection", {
      p_infection_id: input.infectionId,
      p_resolution_note: input.resolutionNote,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not resolve infection record: ${error?.message}` };
  }

  return { infection: data as Infection };
}

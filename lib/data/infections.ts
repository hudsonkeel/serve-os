// Data layer for the infections table — mirrors lib/data/incidents.ts
// exactly (plain CRUD + the three governed RPC-backed state transitions).
// See supabase/migrations/20260907000000_create_incidents_and_infections.sql
// for the schema/RPC contract. No business logic here — community
// resolution, resident-existence checks, and role authorization live in
// lib/actions/infections.ts.
import { createServerClient } from "../supabase/server.ts";
import { getResidentsByIds } from "./residents.ts";
import type { CommunityQueryFilter } from "../auth/communityScope.ts";
import type { Infection, InfectionFollowUpPurpose } from "../supabase/types.ts";

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
  // Infection Lifecycle & Learning Loop v0.1 — only ever actually written
  // on the infection's first review, or as a one-time legacy backfill when
  // it was reviewed before this field existed and still reads null (Linda
  // Kaplan's real record is in exactly this state) — see
  // mark_infection_reviewed's own freeze-after-first-write discipline.
  // Safe to pass on every call; the RPC decides whether it's actually used.
  reviewFindings?: string | null;
  actor: string;
}

export async function markInfectionReviewed(input: MarkInfectionReviewedInput): Promise<{ infection?: Infection; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("mark_infection_reviewed", {
      p_infection_id: input.infectionId,
      p_follow_up_required: input.followUpRequired,
      p_owner: input.owner,
      p_review_findings: input.reviewFindings ?? null,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not mark infection record reviewed: ${error?.message}` };
  }

  return { infection: data as Infection };
}

// Infection Lifecycle & Learning Loop v0.1 — lightweight: sets only the
// infection's current follow-up obligation (no timeline row). See
// record_infection_follow_up in lib/data/infectionFollowUps.ts for the
// real observation entry, which sets/clears these same columns as a side
// effect of recording what happened.
export interface ScheduleInfectionFollowUpInput {
  infectionId: string;
  nextFollowUpDate: string;
  purpose: InfectionFollowUpPurpose;
  purposeNote: string | null;
  actor: string;
}

export async function scheduleInfectionFollowUp(input: ScheduleInfectionFollowUpInput): Promise<{ infection?: Infection; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("schedule_infection_follow_up", {
      p_infection_id: input.infectionId,
      p_next_follow_up_date: input.nextFollowUpDate,
      p_purpose: input.purpose,
      p_purpose_note: input.purposeNote,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not schedule infection follow-up: ${error?.message}` };
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

// ─── Governance Connective Slice v0.1 ─────────────────────────────────────
// Mirrors lib/data/incidents.ts exactly. Infections are always
// resident-linked (schema-enforced), so residentDisplayName is never null
// here in practice, but the type stays nullable to match Incident's shape
// and to fail safely if a resident lookup misses.

export interface InfectionWithResidentName extends Infection {
  residentDisplayName: string | null;
}

async function withResidentNames(rows: Infection[]): Promise<InfectionWithResidentName[]> {
  const residentIds = [...new Set(rows.map((r) => r.resident_id))];
  const residents = residentIds.length > 0 ? await getResidentsByIds(residentIds) : [];
  const nameById = new Map(residents.map((r) => [r.id, r.display_name || r.full_name || "Resident"]));

  return rows.map((row) => ({
    ...row,
    residentDisplayName: nameById.get(row.resident_id) ?? null,
  }));
}

export async function getActionableInfections(): Promise<InfectionWithResidentName[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("infections").select("*").eq("status", "open");

  if (error) {
    console.error("[infections:getActionableInfections:error]", { message: error.message });
    return [];
  }

  return withResidentNames((data as Infection[] | null) ?? []);
}

export async function getRecentlyResolvedInfections(withinDays = 7): Promise<InfectionWithResidentName[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("infections")
    .select("*")
    .eq("status", "resolved")
    .gte("resolved_at", since);

  if (error) {
    console.error("[infections:getRecentlyResolvedInfections:error]", { message: error.message });
    return [];
  }

  return withResidentNames((data as Infection[] | null) ?? []);
}

// Infection Lifecycle & Learning Loop v0.1 — Today's Work's source for the
// "infection_follow_up" WorkItem: every open infection currently carrying
// an outstanding follow-up obligation. Read directly off infections, no
// join to infection_follow_ups required — see the migration header for why
// these two columns are the single canonical "is there outstanding
// follow-up work" signal.
export async function getInfectionsWithOutstandingFollowUp(): Promise<Infection[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("infections")
    .select("*")
    .eq("status", "open")
    .not("next_follow_up_date", "is", null);

  if (error) {
    console.error("[infections:getInfectionsWithOutstandingFollowUp:error]", { message: error.message });
    return [];
  }

  return (data as Infection[] | null) ?? [];
}

// Plain counts for the QAPI factual aggregate — no filtering, no
// interpretation. See lib/qapi/signals.ts.
export async function getAllInfectionsForSignals(): Promise<Infection[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("infections").select("*");

  if (error) {
    console.error("[infections:getAllInfectionsForSignals:error]", { message: error.message });
    return [];
  }

  return (data as Infection[] | null) ?? [];
}

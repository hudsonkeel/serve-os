// Data layer for the durable Serve workforce identity — see
// docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md Part 1. Deliberately
// small: no name/contact fields, only the link back to the originating
// recruiting lead.
//
// Nothing in this file ever writes to recruiting_leads.status.
import { createServerClient } from "../supabase/server.ts";
import type { WorkforceMember } from "../supabase/types.ts";

export async function getWorkforceMemberById(id: string): Promise<WorkforceMember | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("workforce_members").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getWorkforceMemberById]", { id, message: error.message });
    return null;
  }

  return (data as WorkforceMember | null) ?? null;
}

export async function listWorkforceMembers(): Promise<WorkforceMember[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("workforce_members").select("*");

  if (error) {
    console.error("[listWorkforceMembers]", { message: error.message });
    return [];
  }

  return (data as WorkforceMember[] | null) ?? [];
}

export async function getWorkforceMemberByRecruitingLeadId(recruitingLeadId: string): Promise<WorkforceMember | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_members")
    .select("*")
    .eq("source_recruiting_lead_id", recruitingLeadId)
    .maybeSingle();

  if (error) {
    console.error("[getWorkforceMemberByRecruitingLeadId]", { recruitingLeadId, message: error.message });
    return null;
  }

  return (data as WorkforceMember | null) ?? null;
}

// Idempotent — returns the existing row if one is already linked to this
// recruiting lead, never creates a second one (source_recruiting_lead_id
// is unique). Creation is always explicit and attributed — never silently
// inferred from vendor evidence arriving.
//
// displayName is required — the canonical identity is initialized at
// creation, not computed later at read time (see
// supabase/migrations/20260812000000_add_workforce_member_canonical_identity.sql
// and lib/workforce/roster.ts's resolveDisplayName(), which now only
// falls back to a legacy computed name defensively, if this was ever
// unexpectedly left null).
export async function createWorkforceMember(input: {
  recruitingLeadId: string;
  createdBy: string;
  displayName: string;
  legalFirstName?: string | null;
  legalLastName?: string | null;
  preferredName?: string | null;
}): Promise<{ member?: WorkforceMember; error?: string }> {
  const existing = await getWorkforceMemberByRecruitingLeadId(input.recruitingLeadId);
  if (existing) return { member: existing };

  if (!input.displayName || input.displayName.trim().length === 0) {
    return { error: "A display name is required to create a workforce member." };
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_members")
    .insert({
      source_recruiting_lead_id: input.recruitingLeadId,
      created_by: input.createdBy,
      display_name: input.displayName.trim(),
      legal_first_name: input.legalFirstName ?? null,
      legal_last_name: input.legalLastName ?? null,
      preferred_name: input.preferredName ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not create workforce member: ${error?.message}` };
  }

  return { member: data as WorkforceMember };
}

// Creates a workforce identity with no recruiting_leads link at all — the
// AxisCare-only case (a caregiver hired before Serve OS's recruiting
// pipeline existed, or who applied via Apploi directly, which today never
// creates a recruiting_leads row). Always explicit and attributed, never
// silently inferred from vendor evidence arriving — same discipline as
// createWorkforceMember() above. Callers are expected to have already
// confirmed there's no plausible existing workforce_members match (see
// lib/actions/workforce.ts's identity-review confirmation flow).
//
// displayName is required and must be initialized from the approved
// AxisCare source data (lib/workforce/axiscareFieldAllowlist.ts's
// deriveCanonicalIdentityFromAxisCare()) BEFORE this call — never left to
// be computed later by a join, since the confirming identity link isn't
// even linked to this member's id yet at the moment this row is inserted.
export async function createStandaloneWorkforceMember(input: {
  createdBy: string;
  displayName: string;
  legalFirstName?: string | null;
  legalLastName?: string | null;
  preferredName?: string | null;
}): Promise<{ member?: WorkforceMember; error?: string }> {
  if (!input.displayName || input.displayName.trim().length === 0) {
    return { error: "A display name is required to create a workforce member." };
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_members")
    .insert({
      source_recruiting_lead_id: null,
      created_by: input.createdBy,
      display_name: input.displayName.trim(),
      legal_first_name: input.legalFirstName ?? null,
      legal_last_name: input.legalLastName ?? null,
      preferred_name: input.preferredName ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not create workforce member: ${error?.message}` };
  }

  return { member: data as WorkforceMember };
}

// ─── Canonical Profile Editor ──────────────────────────────────────────
// All writes to workforce_members' canonical fields after creation go
// through these RPC wrappers — never a direct .update() from application
// code. See
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.

export async function updateWorkforceCanonicalProfile(input: {
  workforceMemberId: string;
  legalFirstName: string | null;
  legalMiddleName: string | null;
  legalLastName: string | null;
  preferredName: string | null;
  displayName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  actor: string;
  rationale: string | null;
}): Promise<{ member?: WorkforceMember; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("update_workforce_canonical_profile", {
      p_workforce_member_id: input.workforceMemberId,
      p_legal_first_name: input.legalFirstName,
      p_legal_middle_name: input.legalMiddleName,
      p_legal_last_name: input.legalLastName,
      p_preferred_name: input.preferredName,
      p_display_name: input.displayName,
      p_primary_email: input.primaryEmail,
      p_primary_phone: input.primaryPhone,
      p_actor: input.actor,
      p_rationale: input.rationale,
    })
    .single();

  if (error || !data) {
    return { error: `Could not update canonical profile: ${error?.message}` };
  }

  return { member: data as WorkforceMember };
}

export async function reviewWorkforceCanonicalProfile(input: {
  workforceMemberId: string;
  actor: string;
  rationale: string;
}): Promise<{ member?: WorkforceMember; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("review_workforce_canonical_profile", {
      p_workforce_member_id: input.workforceMemberId,
      p_actor: input.actor,
      p_rationale: input.rationale,
    })
    .single();

  if (error || !data) {
    return { error: `Could not review canonical profile: ${error?.message}` };
  }

  return { member: data as WorkforceMember };
}

export async function lockWorkforceCanonicalProfile(input: {
  workforceMemberId: string;
  actor: string;
  rationale: string;
}): Promise<{ member?: WorkforceMember; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("lock_workforce_canonical_profile", {
      p_workforce_member_id: input.workforceMemberId,
      p_actor: input.actor,
      p_rationale: input.rationale,
    })
    .single();

  if (error || !data) {
    return { error: `Could not lock canonical profile: ${error?.message}` };
  }

  return { member: data as WorkforceMember };
}

export async function unlockWorkforceCanonicalProfile(input: {
  workforceMemberId: string;
  actor: string;
  rationale: string;
}): Promise<{ member?: WorkforceMember; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("unlock_workforce_canonical_profile", {
      p_workforce_member_id: input.workforceMemberId,
      p_actor: input.actor,
      p_rationale: input.rationale,
    })
    .single();

  if (error || !data) {
    return { error: `Could not unlock canonical profile: ${error?.message}` };
  }

  return { member: data as WorkforceMember };
}

// System-only write path for AxisCare sync — see
// lib/workforce/canonicalProfileSync.ts. Returns whether a write actually
// happened (false for "values already matched, nothing to do").
export async function syncSeedOrCorrectWorkforceCanonicalField(input: {
  workforceMemberId: string;
  fieldName: "legal_first_name" | "legal_last_name" | "preferred_name" | "primary_email" | "primary_phone";
  newValue: string;
  actor: string;
}): Promise<{ applied?: boolean; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("sync_seed_or_correct_workforce_canonical_field", {
    p_workforce_member_id: input.workforceMemberId,
    p_field_name: input.fieldName,
    p_new_value: input.newValue,
    p_actor: input.actor,
  });

  if (error) {
    return { error: `Could not sync-write ${input.fieldName}: ${error.message}` };
  }

  return { applied: Boolean(data) };
}

// Data layer for the platform-owned, polymorphic vendor identity linking
// table — generalizes lib/data/recruitingLeadEvidence.ts's vendor-identity
// functions (recruiting_lead_vendor_identities stays untouched). See
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql.
//
// Mutations that need real atomicity (the sync decision, confirm/reject/
// defer) call the SQL RPCs defined in that migration. Everything else here
// is a plain read.
import { createServerClient } from "../supabase/server.ts";
import type {
  LinkRole,
  PersonSubjectType,
  PersonVendorIdentityLink,
  PersonVendorIdentityLinkDecision,
  PersonVendorIdentityLinkStatus,
  VendorIdentityMatchConfidence,
  VendorIdentityMatchMethod,
} from "../supabase/types.ts";

export async function getPersonVendorIdentityLinksForSubject(
  subjectType: PersonSubjectType,
  subjectId: string
): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId);

  if (error) {
    console.error("[getPersonVendorIdentityLinksForSubject]", { subjectType, subjectId, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

export async function getPersonVendorIdentityLinkById(id: string): Promise<PersonVendorIdentityLink | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getPersonVendorIdentityLinkById]", { id, message: error.message });
    return null;
  }

  return (data as PersonVendorIdentityLink | null) ?? null;
}

export async function getIdentityReviewQueue(
  subjectType: PersonSubjectType,
  status: PersonVendorIdentityLinkStatus = "proposed"
): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getIdentityReviewQueue]", { subjectType, status, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

// Atomic per-caregiver sync decision — see sync_axiscare_vendor_identity()
// in the migration. Never auto-confirms; only ever writes a 'proposed' row
// or refreshes an already-'confirmed' one.
export async function syncAxisCareVendorIdentity(input: {
  vendorRecordId: string;
  vendorDisplayName: string | null;
  matchMethod: VendorIdentityMatchMethod;
  matchConfidence: VendorIdentityMatchConfidence;
  candidateSubjectId: string | null;
  approvedSourceData: Record<string, unknown>;
}): Promise<{
  action?: "unchanged" | "refreshed" | "skipped_existing_decision" | "proposed";
  linkId?: string;
  workforceMemberId?: string | null;
  error?: string;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("sync_axiscare_vendor_identity", {
      p_vendor_record_id: input.vendorRecordId,
      p_vendor_display_name: input.vendorDisplayName,
      p_match_method: input.matchMethod,
      p_match_confidence: input.matchConfidence,
      p_candidate_subject_id: input.candidateSubjectId,
      p_approved_source_data: input.approvedSourceData,
    })
    .single();

  if (error || !data) {
    return { error: `Could not sync AxisCare vendor identity for ${input.vendorRecordId}: ${error?.message}` };
  }

  const row = data as { action: string; link_id: string; workforce_member_id: string | null };
  return {
    action: row.action as "unchanged" | "refreshed" | "skipped_existing_decision" | "proposed",
    linkId: row.link_id,
    workforceMemberId: row.workforce_member_id,
  };
}

// The only way a link's status ever becomes 'confirmed' — the caller
// (lib/actions/workforce.ts) resolves or creates the workforce_members row
// first; this only ever writes to person_vendor_identity_links.
//
// linkRole defaults to 'primary' (the original, still-most-common path: a
// brand-new AxisCare identity being linked for the first time). Passing
// 'duplicate'/'retired' is the "link a second AxisCare record to the same
// workforce member" reviewer action — see
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql, which
// requires a rationale for any non-primary role.
export async function confirmPersonVendorIdentityLink(input: {
  linkId: string;
  subjectId: string;
  actor: string;
  linkRole?: LinkRole;
  rationale?: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("confirm_person_vendor_identity_link", {
    p_link_id: input.linkId,
    p_subject_id: input.subjectId,
    p_actor: input.actor,
    p_link_role: input.linkRole ?? "primary",
    p_rationale: input.rationale ?? null,
  });

  if (error) {
    return { error: `Could not confirm identity link: ${error.message}` };
  }
  return {};
}

export async function rejectPersonVendorIdentityLink(input: {
  linkId: string;
  actor: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("reject_person_vendor_identity_link", {
    p_link_id: input.linkId,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    return { error: `Could not reject identity link: ${error.message}` };
  }
  return {};
}

export async function deferPersonVendorIdentityLink(input: {
  linkId: string;
  actor: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("defer_person_vendor_identity_link", {
    p_link_id: input.linkId,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    return { error: `Could not defer identity link: ${error.message}` };
  }
  return {};
}

// ─── Identity-decision correction actions ─────────────────────────────────
// See supabase/migrations/20260811000000_add_vendor_identity_lineage.sql.
// Every action here requires a rationale and is preserved in
// person_vendor_identity_link_decisions — none deletes or merges an
// AxisCare record.

// Returns a rejected/deferred link to 'proposed' so it can be re-reviewed —
// e.g. the Locardia case, where a wrongly-rejected AxisCare record needs to
// be reconsidered once its duplicate sibling is understood.
export async function reopenPersonVendorIdentityLink(input: {
  linkId: string;
  actor: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("reopen_person_vendor_identity_link", {
    p_link_id: input.linkId,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    return { error: `Could not reopen identity link: ${error.message}` };
  }
  return {};
}

// Demotes/retires a confirmed link — never 'primary' (use
// promotePersonVendorIdentityLinkToPrimary for that, since promotion has an
// atomic sibling-demotion side effect this does not).
export async function setPersonVendorIdentityLinkRole(input: {
  linkId: string;
  newRole: Exclude<LinkRole, "primary">;
  actor: string;
  rationale: string;
  duplicateOfLinkId?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("set_person_vendor_identity_link_role", {
    p_link_id: input.linkId,
    p_new_role: input.newRole,
    p_actor: input.actor,
    p_rationale: input.rationale,
    p_duplicate_of_link_id: input.duplicateOfLinkId ?? null,
  });

  if (error) {
    return { error: `Could not change identity link role: ${error.message}` };
  }
  return {};
}

// Promotes a confirmed duplicate/retired link to primary, atomically
// demoting whatever was previously primary for the same subject+source (if
// anything) to 'duplicate' in the same transaction.
export async function promotePersonVendorIdentityLinkToPrimary(input: {
  linkId: string;
  actor: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("promote_person_vendor_identity_link_to_primary", {
    p_link_id: input.linkId,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    return { error: `Could not promote identity link to primary: ${error.message}` };
  }
  return {};
}

// Corrects a confirmed link that was assigned to the wrong workforce
// member — moves it to the correct subject while preserving the old
// subject_id in the decision history. Defaults the new role to 'primary'
// (the common case: the correct subject has no prior AxisCare link at
// all); the RPC rejects this if the target subject already has a primary
// link for this source, in which case pass 'duplicate'/'retired' instead.
export async function reassignConfirmedVendorIdentityLinkSubject(input: {
  linkId: string;
  newSubjectId: string;
  actor: string;
  rationale: string;
  newLinkRole?: LinkRole;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("reassign_confirmed_vendor_identity_link_subject", {
    p_link_id: input.linkId,
    p_new_subject_id: input.newSubjectId,
    p_actor: input.actor,
    p_rationale: input.rationale,
    p_new_link_role: input.newLinkRole ?? "primary",
  });

  if (error) {
    return { error: `Could not reassign identity link subject: ${error.message}` };
  }
  return {};
}

// Rejected/deferred links, for the "resolved" review view that surfaces the
// reopen action.
export async function getResolvedIdentityLinks(subjectType: PersonSubjectType): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", subjectType)
    .in("status", ["rejected", "deferred"])
    .order("resolved_at", { ascending: false });

  if (error) {
    console.error("[getResolvedIdentityLinks]", { subjectType, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

// All confirmed links (any role) for a subject — the "Source Identities"
// section on the Workforce detail page shows every one of these, not just
// the primary.
export async function getConfirmedVendorIdentityLinksForSubject(
  subjectType: PersonSubjectType,
  subjectId: string,
  sourceSystem?: string
): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  let query = supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("status", "confirmed");

  if (sourceSystem) {
    query = query.eq("source_system", sourceSystem);
  }

  const { data, error } = await query.order("link_role", { ascending: true });

  if (error) {
    console.error("[getConfirmedVendorIdentityLinksForSubject]", { subjectType, subjectId, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

// Full decision history for one link, newest first — "preserve the
// previous decision in audit history," made visible.
export async function getPersonVendorIdentityLinkDecisions(linkId: string): Promise<PersonVendorIdentityLinkDecision[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_link_decisions")
    .select("*")
    .eq("link_id", linkId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getPersonVendorIdentityLinkDecisions]", { linkId, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLinkDecision[] | null) ?? [];
}

// Other AxisCare identity links with a matching normalized name, email, or
// phone — the duplicate-candidate surface the identity review queue shows
// alongside each proposed link (requirement 4). Pure client-side filtering
// over already-fetched candidates; see
// lib/workforce/identityDuplicateDetection.ts for the matching logic
// itself.
export async function getAllPersonVendorIdentityLinksForSource(
  subjectType: PersonSubjectType,
  sourceSystem: string
): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("source_system", sourceSystem);

  if (error) {
    console.error("[getAllPersonVendorIdentityLinksForSource]", { subjectType, sourceSystem, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

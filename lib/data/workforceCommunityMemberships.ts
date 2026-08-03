// Data layer for workforce_community_memberships — "Jessicah currently
// works at Watermere," kept separate from workforce_members itself
// ("Jessicah exists as a Serve workforce member"). See
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
import { createServerClient } from "../supabase/server.ts";
import type { WorkforceCommunityMembership, WorkforceCommunityMembershipStatus } from "../supabase/types.ts";

export async function getCommunityMembershipsForMember(workforceMemberId: string): Promise<WorkforceCommunityMembership[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_community_memberships")
    .select("*")
    .eq("workforce_member_id", workforceMemberId)
    .order("is_primary_community", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getCommunityMembershipsForMember]", { workforceMemberId, message: error.message });
    return [];
  }

  return (data as WorkforceCommunityMembership[] | null) ?? [];
}

// Upserts a single (workforce_member_id, community_id) membership row —
// creates it on first assignment, updates it in place thereafter.
// Promoting is_primary_community=true atomically demotes any other
// primary community for this member in the same transaction. Every call
// requires an actor; rationale is optional (community fields are
// operational, not identity-defining — see the ownership model).
export async function upsertWorkforceCommunityMembership(input: {
  workforceMemberId: string;
  communityId: string;
  membershipStatus: WorkforceCommunityMembershipStatus;
  roleType?: string | null;
  employmentRelationship?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isPrimaryCommunity?: boolean;
  communityDisplayNameOverride?: string | null;
  communityEmail?: string | null;
  communityPhone?: string | null;
  schedulerNotes?: string | null;
  availabilityNotes?: string | null;
  transportationNotes?: string | null;
  accessNotes?: string | null;
  actor: string;
  rationale?: string | null;
}): Promise<{ membership?: WorkforceCommunityMembership; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("upsert_workforce_community_membership", {
      p_workforce_member_id: input.workforceMemberId,
      p_community_id: input.communityId,
      p_membership_status: input.membershipStatus,
      p_role_type: input.roleType ?? null,
      p_employment_relationship: input.employmentRelationship ?? null,
      p_start_date: input.startDate ?? null,
      p_end_date: input.endDate ?? null,
      p_is_primary_community: input.isPrimaryCommunity ?? false,
      p_community_display_name_override: input.communityDisplayNameOverride ?? null,
      p_community_email: input.communityEmail ?? null,
      p_community_phone: input.communityPhone ?? null,
      p_scheduler_notes: input.schedulerNotes ?? null,
      p_availability_notes: input.availabilityNotes ?? null,
      p_transportation_notes: input.transportationNotes ?? null,
      p_access_notes: input.accessNotes ?? null,
      p_actor: input.actor,
      p_rationale: input.rationale ?? null,
    })
    .single();

  if (error || !data) {
    return { error: `Could not update community membership: ${error?.message}` };
  }

  return { membership: data as WorkforceCommunityMembership };
}

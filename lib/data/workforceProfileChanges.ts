// Data layer for workforce_profile_changes — the append-only field-level
// change history behind the "Profile Change History" panel. See
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
// Never written to directly from application code — every row is written
// by a canonical-profile/community-membership/discrepancy RPC as part of
// the same transaction that changes the value.
import { createServerClient } from "../supabase/server.ts";
import type { WorkforceProfileChange } from "../supabase/types.ts";

export async function getWorkforceProfileChangeHistory(workforceMemberId: string): Promise<WorkforceProfileChange[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_profile_changes")
    .select("*")
    .eq("workforce_member_id", workforceMemberId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getWorkforceProfileChangeHistory]", { workforceMemberId, message: error.message });
    return [];
  }

  return (data as WorkforceProfileChange[] | null) ?? [];
}

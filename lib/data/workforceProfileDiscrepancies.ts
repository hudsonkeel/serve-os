// Data layer for workforce_profile_discrepancies — "Source differs from
// reviewed canonical value -> create discrepancy." See
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
import { createServerClient } from "../supabase/server.ts";
import type { WorkforceProfileDiscrepancy } from "../supabase/types.ts";

export async function getOpenWorkforceProfileDiscrepancies(workforceMemberId: string): Promise<WorkforceProfileDiscrepancy[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_profile_discrepancies")
    .select("*")
    .eq("workforce_member_id", workforceMemberId)
    .eq("status", "open")
    .order("detected_at", { ascending: false });

  if (error) {
    console.error("[getOpenWorkforceProfileDiscrepancies]", { workforceMemberId, message: error.message });
    return [];
  }

  return (data as WorkforceProfileDiscrepancy[] | null) ?? [];
}

// Called by AxisCare sync (system actor) when a source value materially
// differs from a reviewed/unreviewed canonical value and can't be safely
// auto-applied — see lib/workforce/canonicalProfileSync.ts. Idempotent:
// re-flagging the same field just refreshes the existing open row rather
// than creating a duplicate (DB-enforced one-open-per-field index).
export async function flagWorkforceProfileDiscrepancy(input: {
  workforceMemberId: string;
  fieldName: string;
  canonicalValue: string | null;
  sourceValue: string | null;
  sourceSystem: string;
  actor: string;
}): Promise<{ discrepancy?: WorkforceProfileDiscrepancy; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("flag_workforce_profile_discrepancy", {
      p_workforce_member_id: input.workforceMemberId,
      p_field_name: input.fieldName,
      p_canonical_value: input.canonicalValue,
      p_source_value: input.sourceValue,
      p_source_system: input.sourceSystem,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not flag profile discrepancy: ${error?.message}` };
  }

  return { discrepancy: data as WorkforceProfileDiscrepancy };
}

// A reviewer's decision on an open discrepancy — accept the source value
// (writes it onto the canonical field), retain the canonical value
// (no field change, just closes the discrepancy), or dismiss it. Always
// logged, per the acceptance criterion "decision is logged."
export async function resolveWorkforceProfileDiscrepancy(input: {
  discrepancyId: string;
  resolution: "accepted_source" | "retained_canonical" | "dismissed";
  actor: string;
  rationale: string;
}): Promise<{ discrepancy?: WorkforceProfileDiscrepancy; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("resolve_workforce_profile_discrepancy", {
      p_discrepancy_id: input.discrepancyId,
      p_resolution: input.resolution,
      p_actor: input.actor,
      p_rationale: input.rationale,
    })
    .single();

  if (error || !data) {
    return { error: `Could not resolve profile discrepancy: ${error?.message}` };
  }

  return { discrepancy: data as WorkforceProfileDiscrepancy };
}

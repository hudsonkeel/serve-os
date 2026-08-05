// Resident-side wrapper around the platform-owned, polymorphic vendor
// identity linking table (person_vendor_identity_links) — mirrors
// lib/data/personVendorIdentityLinks.ts's syncAxisCareVendorIdentity()
// pattern exactly, calling the new sync_axiscare_client_identity() RPC
// (see supabase/migrations/20260819000000_add_resident_axiscare_client_sync.sql)
// instead of changing the existing, already-in-production caregiver
// sync function. Never auto-confirms — every call writes at most one
// 'proposed' row or refreshes an already-confirmed one; a human decision
// (confirm/reject/defer, via the existing
// person_vendor_identity_links governance RPCs) is always required
// before a link is treated as authoritative.
import { createServerClient } from "../supabase/server.ts";
import type {
  PersonVendorIdentityLink,
  VendorIdentityMatchConfidence,
  VendorIdentityMatchMethod,
} from "../supabase/types.ts";

export async function getResidentAxisCareLinks(residentId: string): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", "resident")
    .eq("subject_id", residentId);

  if (error) {
    console.error("[getResidentAxisCareLinks]", { residentId, message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

export async function getResidentAxisCareReviewQueue(): Promise<PersonVendorIdentityLink[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_vendor_identity_links")
    .select("*")
    .eq("subject_type", "resident")
    .eq("status", "proposed")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getResidentAxisCareReviewQueue]", { message: error.message });
    return [];
  }

  return (data as PersonVendorIdentityLink[] | null) ?? [];
}

export async function syncAxisCareClientIdentity(input: {
  vendorRecordId: string;
  vendorDisplayName: string | null;
  matchMethod: VendorIdentityMatchMethod;
  matchConfidence: VendorIdentityMatchConfidence;
  candidateSubjectId: string | null;
  approvedSourceData: Record<string, unknown>;
}): Promise<{
  action?: "unchanged" | "refreshed" | "skipped_existing_decision" | "proposed";
  linkId?: string;
  residentId?: string | null;
  error?: string;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("sync_axiscare_client_identity", {
      p_vendor_record_id: input.vendorRecordId,
      p_vendor_display_name: input.vendorDisplayName,
      p_match_method: input.matchMethod,
      p_match_confidence: input.matchConfidence,
      p_candidate_subject_id: input.candidateSubjectId,
      p_approved_source_data: input.approvedSourceData,
    })
    .single();

  if (error || !data) {
    return { error: `Could not sync AxisCare client identity for ${input.vendorRecordId}: ${error?.message}` };
  }

  const row = data as { action: string; link_id: string; resident_id: string | null };
  return {
    action: row.action as "unchanged" | "refreshed" | "skipped_existing_decision" | "proposed",
    linkId: row.link_id,
    residentId: row.resident_id,
  };
}

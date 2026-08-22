// AxisCare Reconciliation + Multi-Source Identity Ingestion phase.
//
// The atomic "Create New Resident from an external source" write path —
// deliberately source-generic (create_resident_from_external_source RPC
// takes p_source_system as a parameter), so a future community-roster or
// CRM importer reuses this exact function rather than building a second
// creation path. See supabase/migrations/20260902260000_create_resident_from_external_source_rpc.sql
// for the atomic RPC itself (resident insert + confirmed identity link, one
// transaction).
import "server-only";
import { createServerClient } from "../supabase/server.ts";

export interface CreateResidentFromExternalSourceInput {
  readonly sourceSystem: string;
  readonly sourceRecordId: string;
  readonly vendorDisplayName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly communityId: string | null;
  readonly communityName: string | null;
  readonly actor: string;
  readonly rationale: string | null;
}

// A concurrent double-create against the same source record hits the
// unique constraint on (source_system, subject_type, vendor_record_id) —
// Postgres unique_violation, SQLSTATE 23505. Translated here into an
// honest "already resolved" message rather than a raw DB error, and never
// surfaced as if the resident creation partially happened (it did not —
// the RPC's insert never committed).
export async function createResidentFromExternalSource(
  input: CreateResidentFromExternalSourceInput
): Promise<{ residentId?: string; error?: string; alreadyResolved?: boolean }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_from_external_source", {
    p_source_system: input.sourceSystem,
    p_source_record_id: input.sourceRecordId,
    p_vendor_display_name: input.vendorDisplayName,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_community_id: input.communityId,
    p_community_name: input.communityName,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "This record was already resolved to a Serve person by someone else. Refresh to see the current state.",
        alreadyResolved: true,
      };
    }
    console.error("[residentCreationFromSource:createResidentFromExternalSource:error]", {
      sourceSystem: input.sourceSystem,
      sourceRecordId: input.sourceRecordId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not create a resident from this record." };
  }

  return { residentId: data as string };
}

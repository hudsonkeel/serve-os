// Add New Client phase — the atomic manual creation write path. See
// supabase/migrations/20260902340000_create_resident_manual_rpc.sql for
// why this is one RPC (resident insert + Serve relationship correction,
// one transaction) rather than two separate writes.
import "server-only";
import { createServerClient } from "../supabase/server.ts";

export interface CreateResidentManualInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly communityId: string;
  readonly communityName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly dateOfBirth: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zipCode: string | null;
  readonly unitNumber: string | null;
  readonly building: string | null;
  readonly serveRelationshipStatus: "active_client" | "prospect";
  readonly actor: string;
  readonly rationale: string | null;
}

export async function createResidentManual(input: CreateResidentManualInput): Promise<{ residentId?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_manual", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_community_id: input.communityId,
    p_community_name: input.communityName,
    p_phone: input.phone,
    p_email: input.email,
    p_date_of_birth: input.dateOfBirth,
    p_address: input.address,
    p_city: input.city,
    p_state: input.state,
    p_zip_code: input.zipCode,
    p_unit_number: input.unitNumber,
    p_building: input.building,
    p_serve_relationship_status: input.serveRelationshipStatus,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    console.error("[residentManualCreation:createResidentManual:error]", { message: error.message, code: error.code });
    return { error: "Could not create the new client." };
  }
  return { residentId: data as string };
}

// Best-effort audit trail follow-up (section 23) — never blocks or fails
// the creation itself, matching the non-blocking-follow-up discipline
// already established throughout this codebase (e.g.
// updateAxisCareOperationalStateIdentityMatch).
export async function logResidentManuallyCreated(
  residentId: string,
  actor: string,
  communityName: string,
  relationshipStatus: "active_client" | "prospect",
  duplicateReviewNote: string | null
): Promise<void> {
  const supabase = createServerClient();
  const description = duplicateReviewNote
    ? `Created manually in ${communityName} by ${actor} as ${relationshipStatus === "active_client" ? "Active Client" : "Prospect"}. ${duplicateReviewNote}`
    : `Created manually in ${communityName} by ${actor} as ${relationshipStatus === "active_client" ? "Active Client" : "Prospect"}.`;

  const { error } = await supabase.from("resident_timeline").insert({
    resident_id: residentId,
    event_type: "resident_created",
    event_title: "Client created",
    event_description: description,
    source: "serve_os_manual",
    created_by: actor,
    system_generated: false,
  });
  if (error) {
    console.error("[residentManualCreation:logResidentManuallyCreated:error]", { residentId, message: error.message });
  }
}

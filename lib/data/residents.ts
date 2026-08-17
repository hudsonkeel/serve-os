import { createServerClient } from "../supabase/server.ts";
import type { Resident } from "../supabase/types.ts";

// Client Readiness's/Audit Readiness's "who is an active client" population
// is NOT here. It never queries serve_relationship_status directly — that
// raw column is only ever a last-resort fallback input into the real,
// canonical relationship truth (lib/residents/serveRelationshipProjection.ts),
// the same one /residents' own "Active Clients" tab already uses. See
// getAuditEligibleActiveClientResidents() in
// lib/data/residentServeRelationships.ts.

// The plain, unjoined resident row — for callers (Client Readiness's
// composition module) that only need the canonical fields themselves, not
// the relationship/wellness/community joins getCommunityResidentById()
// assembles.
export async function getResidentById(residentId: string): Promise<Resident | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("residents").select("*").eq("id", residentId).maybeSingle();

  if (error) {
    console.error("[residents:getResidentById:error]", { residentId, message: error.message });
    return null;
  }

  return (data as Resident | null) ?? null;
}

// Canonical resident-profile fields that are safe for staff to edit directly
// on public.residents. Deliberately excludes identity fields (first_name,
// last_name, display_name, full_name), status/classification fields, and
// anything sourced from imports — those remain read-only in the UI.
export interface ResidentProfileFieldsUpdate {
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  date_of_admission: string | null;
  preferred_language: string | null;
  mobility: string | null;
}

export async function updateResidentProfileFields(
  residentId: string,
  fields: ResidentProfileFieldsUpdate
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("residents")
    .update(fields)
    .eq("id", residentId);

  if (error) {
    console.error("[residents:updateResidentProfileFields:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save resident profile." };
  }

  return {};
}

// Family contact fields already exist as canonical columns on public.residents
// (family_contact_name/_relationship/_phone/_email) — this is the staff-editable
// "best resolved value" record. resident_contact_imports remains separate,
// untouched source evidence (see "Imported Contacts" section of the resident page).
export interface FamilyContactFieldsUpdate {
  family_contact_name: string | null;
  family_contact_relationship: string | null;
  family_contact_phone: string | null;
  family_contact_email: string | null;
}

export async function updateFamilyContactFields(
  residentId: string,
  fields: FamilyContactFieldsUpdate
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("residents")
    .update(fields)
    .eq("id", residentId);

  if (error) {
    console.error("[residents:updateFamilyContactFields:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save family contact." };
  }

  return {};
}

// Client Readiness's smallest approved canonical extension — see
// supabase/migrations/20260902100000_add_client_readiness_profile_fields.sql.
// Deliberately minimal (physician + guardian contact only); "no legal
// guardian" is never represented here — that distinction is a recorded
// person_evidence attestation, not a resident field. See
// lib/clientReadiness/.
export interface CareContactFieldsUpdate {
  physician_name: string | null;
  physician_phone: string | null;
  legal_guardian_name: string | null;
  legal_guardian_phone: string | null;
}

export async function updateCareContactFields(
  residentId: string,
  fields: CareContactFieldsUpdate
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("residents")
    .update(fields)
    .eq("id", residentId);

  if (error) {
    console.error("[residents:updateCareContactFields:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save physician/guardian information." };
  }

  return {};
}

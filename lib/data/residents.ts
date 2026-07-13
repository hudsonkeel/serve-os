import { createServerClient } from "@/lib/supabase/server";

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

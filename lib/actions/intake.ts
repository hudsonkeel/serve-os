"use server";

import { createServerClient } from "@/lib/supabase/server";
import { IntakeFormData } from "@/components/intake/types";
import { ProspectInsert } from "@/lib/supabase/types";

export async function insertProspect(
  data: IntakeFormData
): Promise<{ error?: string }> {
  const supabase = createServerClient();

  let row: ProspectInsert;

  if (data.path === "care") {
    const isSelf = data.careFor === "myself";
    row = {
      status: "new",
      source: "website_intake",
      inquiry_type: "care",
      zip_code: data.zipCode || null,
      resident_first_name: isSelf ? data.firstName : (data.careRecipientFirst || null),
      resident_last_name: isSelf ? data.lastName : (data.careRecipientLast || null),
      resident_relationship: data.careFor || null,
      contact_first_name: data.firstName || null,
      contact_last_name: data.lastName || null,
      contact_phone: data.phone || null,
      contact_email: data.email || null,
      support_type: data.supportType || null,
      start_timing: data.startTiming || null,
      care_needs: data.careNeeds || null,
      referral_source: data.referralSource || null,
      consent_given: data.consentGiven,
      // referral_other stored in raw_submission since it has no dedicated column
      raw_submission: data as unknown as Record<string, unknown>,
    };
  } else if (data.path === "existing_client") {
    row = {
      status: "new",
      source: "website_intake",
      inquiry_type: "existing_client",
      zip_code: null,
      resident_first_name: data.firstName || null,
      resident_last_name: data.lastName || null,
      resident_relationship: "self",
      contact_first_name: data.firstName || null,
      contact_last_name: data.lastName || null,
      contact_phone: data.phone || null,
      contact_email: data.email || null,
      support_type: null,
      start_timing: null,
      care_needs: data.clientMessage || null,
      referral_source: null,
      consent_given: null,
      raw_submission: data as unknown as Record<string, unknown>,
    };
  } else {
    return { error: "Invalid submission path." };
  }

  const { error } = await supabase.from("prospects").insert(row);

  if (error) {
    console.error("[insertProspect]", error.message);
    return {
      error: "Something went wrong. Please try again or call Serve Caregiving.",
    };
  }

  return {};
}

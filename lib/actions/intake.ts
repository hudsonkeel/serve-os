"use server";

import { createServerClient } from "@/lib/supabase/server";
import {
  IntakeFormData,
  IntakeSaveMilestone,
} from "@/components/intake/types";
import { IntakeCurrentStep, ProspectInsert } from "@/lib/supabase/types";

interface FunnelFields {
  id: string;
  raw_submission: Record<string, unknown> | null;
}

interface FunnelState {
  current_step?: IntakeCurrentStep;
  intake_started_at?: string | null;
  contact_information_completed_at?: string | null;
  assessment_started_at?: string | null;
  assessment_completed_at?: string | null;
  intake_completed_at?: string | null;
}

function buildRawSubmission(
  data: IntakeFormData,
  milestone: IntakeSaveMilestone,
  existing?: FunnelFields | null
): Record<string, unknown> {
  return {
    ...data,
    funnel: buildFunnelState(milestone, existing?.raw_submission),
  };
}

function buildProspectRow(
  data: IntakeFormData,
  milestone: IntakeSaveMilestone,
  existing?: FunnelFields | null
): ProspectInsert {
  if (data.path === "care") {
    const isSelf = data.careFor === "myself";
    return {
      status: "new",
      source: "website_intake",
      inquiry_type: "care",
      zip_code: data.zipCode || null,
      care_recipient_first_name: isSelf
        ? data.firstName
        : data.careRecipientFirstName || null,
      care_recipient_last_name: isSelf
        ? data.lastName
        : data.careRecipientLastName || null,
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
      // Funnel fields are stored here until top-level funnel columns exist.
      raw_submission: buildRawSubmission(data, milestone, existing),
    };
  }

  if (data.path === "existing_client") {
    return {
      status: "new",
      source: "website_intake",
      inquiry_type: "existing_client",
      zip_code: null,
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
      raw_submission: buildRawSubmission(data, milestone, existing),
    };
  }

  throw new Error("Invalid submission path.");
}

function getIdentifier(data: IntakeFormData) {
  const email = data.email.trim().toLowerCase();
  const phoneDigits = data.phone.replace(/\D/g, "");

  if (email && /\S+@\S+\.\S+/.test(email)) {
    return { column: "contact_email", value: email };
  }

  if (phoneDigits.length >= 10) {
    return { column: "contact_phone", value: data.phone.trim() };
  }

  return null;
}

function hasMinimumContactIdentity(data: IntakeFormData) {
  const hasContactMethod =
    data.phone.replace(/\D/g, "").length >= 10 ||
    /\S+@\S+\.\S+/.test(data.email.trim());

  return Boolean(
    data.firstName.trim() &&
      data.lastName.trim() &&
      hasContactMethod &&
      /^\d{5}$/.test(data.zipCode.trim())
  );
}

function milestoneToCurrentStep(
  milestone: IntakeSaveMilestone
): IntakeCurrentStep {
  if (milestone === "intake_completed") return "completed";
  return milestone;
}

function isFunnelState(value: unknown): value is FunnelState {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getExistingFunnelState(
  rawSubmission: Record<string, unknown> | null | undefined
): FunnelState {
  const funnel = rawSubmission?.funnel;
  return isFunnelState(funnel) ? funnel : {};
}

function buildFunnelState(
  milestone: IntakeSaveMilestone,
  existingRawSubmission?: Record<string, unknown> | null
): FunnelState {
  const now = new Date().toISOString();
  const existing = getExistingFunnelState(existingRawSubmission);
  const patch: FunnelState = {
    ...existing,
    current_step: milestoneToCurrentStep(milestone),
  };

  if (!existing.intake_started_at) {
    patch.intake_started_at = now;
  }

  if (
    milestone === "contact_completed" &&
    !existing.contact_information_completed_at
  ) {
    patch.contact_information_completed_at = now;
  }

  if (
    milestone === "relationship_completed" &&
    !existing.assessment_started_at
  ) {
    patch.assessment_started_at = now;
  }

  if (
    milestone === "timing_completed" &&
    !existing.assessment_completed_at
  ) {
    patch.assessment_completed_at = now;
  }

  if (milestone === "intake_completed" && !existing.intake_completed_at) {
    patch.intake_completed_at = now;
  }

  return patch;
}

const funnelSelect = "id,raw_submission";

export async function saveProspectDraft(
  data: IntakeFormData,
  milestone: IntakeSaveMilestone,
  prospectId?: string | null
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();

  if (!data.path) {
    return { error: "Invalid submission path." };
  }

  if (!hasMinimumContactIdentity(data)) {
    return {
      error:
        "Please provide your name, ZIP code, and either a phone number or email.",
    };
  }

  const normalizedData = {
    ...data,
    email: data.email.trim().toLowerCase(),
  };

  if (prospectId) {
    const { data: existing, error: existingError } = await supabase
      .from("prospects")
      .select(funnelSelect)
      .eq("id", prospectId)
      .maybeSingle<FunnelFields>();

    if (existingError) {
      console.error("[saveProspectDraft:lookupById]", existingError);
    }

    const { data: updated, error } = await supabase
      .from("prospects")
      .update(buildProspectRow(normalizedData, milestone, existing))
      .eq("id", prospectId)
      .select("id")
      .single();

    if (!error && updated?.id) {
      return { id: updated.id };
    }
  }

  const identifier = getIdentifier(data);

  if (identifier) {
    const { data: existing, error: existingError } = await supabase
      .from("prospects")
      .select(funnelSelect)
      .eq(identifier.column, identifier.value)
      .eq("source", "website_intake")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<FunnelFields>();

    if (existingError) {
      console.error("[saveProspectDraft:lookupByIdentifier]", existingError);
    }

    if (existing?.id) {
      const { data: updated, error } = await supabase
        .from("prospects")
        .update(buildProspectRow(normalizedData, milestone, existing))
        .eq("id", existing.id)
        .select("id")
        .single();

      if (error) {
        console.error("[saveProspectDraft:update]", error);
        return {
          error:
            process.env.NODE_ENV === "development"
              ? `Supabase update failed: ${error.message}`
              : "Something went wrong. Please try again or call Serve Caregiving.",
        };
      }

      return { id: updated.id };
    }
  }

  const { data: inserted, error } = await supabase
    .from("prospects")
    .insert(buildProspectRow(normalizedData, milestone))
    .select("id")
    .single();

  if (error) {
    console.error("[saveProspectDraft:insert]", error);
    return {
      error:
        process.env.NODE_ENV === "development"
          ? `Supabase insert failed: ${error.message}`
          : "Something went wrong. Please try again or call Serve Caregiving.",
    };
  }

  return { id: inserted.id };
}

export async function insertProspect(
  data: IntakeFormData
): Promise<{ error?: string }> {
  const result = await saveProspectDraft(data, "intake_completed");

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

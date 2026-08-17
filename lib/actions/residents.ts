"use server";

import {
  updateCareContactFields,
  updateFamilyContactFields,
  updateResidentProfileFields,
} from "@/lib/data/residents";
import { updateRelationshipDetails } from "@/lib/actions/connections";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { logResidentProfileUpdated } from "@/lib/data/residentTimeline";
import { correctResidentServeRelationship as correctResidentServeRelationshipRecord } from "@/lib/data/residentServeRelationshipCorrections";
import type { ServeRelationship } from "@/lib/residents/serveRelationshipProjection";
import { revalidatePath } from "next/cache";

// Server-side enforcement is the actual security boundary — the UI hiding
// the Edit button (components/residents/ResidentProfileCard.tsx,
// FamilyContactsCard.tsx) is a convenience, never the guarantee. Every
// mutating action here re-checks role independently of what the client
// claims. Returns the actor label (for the audit entry) alongside the
// permission result so callers never query the session twice.
async function assertCanEditResidentProfile(): Promise<{ error?: string; actor?: string }> {
  const profile = await getCurrentAuthorizedUser();
  if (!canEditResidentProfile(profile?.role)) {
    return { error: "You do not have permission to edit resident profiles." };
  }
  return { actor: profile?.full_name || profile?.email || "Unknown" };
}

export interface ResidentProfileFormData {
  residentId: string;
  preferredName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  dateOfAdmission: string;
  preferredLanguage: string;
  mobility: string;
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function isValidDateString(value: string): boolean {
  if (!value) return true;
  return !Number.isNaN(new Date(value).getTime());
}

export async function saveResidentProfile(
  data: ResidentProfileFormData
): Promise<{ error?: string }> {
  const permissionCheck = await assertCanEditResidentProfile();
  if (permissionCheck.error) return permissionCheck;

  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  const email = data.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (!isValidDateString(data.dateOfBirth)) {
    return { error: "Enter a valid date of birth." };
  }

  if (!isValidDateString(data.dateOfAdmission)) {
    return { error: "Enter a valid date of admission." };
  }

  const profileResult = await updateResidentProfileFields(data.residentId, {
    email: email || null,
    phone: data.phone.trim() || null,
    date_of_birth: data.dateOfBirth || null,
    date_of_admission: data.dateOfAdmission || null,
    preferred_language: data.preferredLanguage.trim() || null,
    mobility: data.mobility.trim() || null,
  });

  if (profileResult.error) {
    return { error: profileResult.error };
  }

  const nicknameResult = await updateRelationshipDetails({
    residentId: data.residentId,
    preferredName: data.preferredName,
  });

  if (nicknameResult.error) {
    return { error: nicknameResult.error };
  }

  await logResidentProfileUpdated(data.residentId, permissionCheck.actor!, "Resident profile");

  return {};
}

export interface FamilyContactFormData {
  residentId: string;
  contactName: string;
  relationship: string;
  phone: string;
  email: string;
}

function isValidPhone(value: string): boolean {
  if (!value) return true;
  return value.replace(/\D/g, "").length >= 10;
}

export async function saveFamilyContact(
  data: FamilyContactFormData
): Promise<{ error?: string }> {
  const permissionCheck = await assertCanEditResidentProfile();
  if (permissionCheck.error) return permissionCheck;

  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  const email = data.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const phone = data.phone.trim();
  if (phone && !isValidPhone(phone)) {
    return { error: "Enter a valid phone number." };
  }

  const result = await updateFamilyContactFields(data.residentId, {
    family_contact_name: data.contactName.trim() || null,
    family_contact_relationship: data.relationship.trim() || null,
    family_contact_phone: phone || null,
    family_contact_email: email || null,
  });

  if (result.error) {
    return { error: result.error };
  }

  await logResidentProfileUpdated(data.residentId, permissionCheck.actor!, "Family contact");

  return {};
}

export interface CareContactFormData {
  residentId: string;
  physicianName: string;
  physicianPhone: string;
  guardianName: string;
  guardianPhone: string;
}

export async function saveCareContacts(
  data: CareContactFormData
): Promise<{ error?: string }> {
  const permissionCheck = await assertCanEditResidentProfile();
  if (permissionCheck.error) return permissionCheck;

  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  const physicianPhone = data.physicianPhone.trim();
  if (physicianPhone && !isValidPhone(physicianPhone)) {
    return { error: "Enter a valid physician phone number." };
  }

  const guardianPhone = data.guardianPhone.trim();
  if (guardianPhone && !isValidPhone(guardianPhone)) {
    return { error: "Enter a valid guardian phone number." };
  }

  const result = await updateCareContactFields(data.residentId, {
    physician_name: data.physicianName.trim() || null,
    physician_phone: physicianPhone || null,
    legal_guardian_name: data.guardianName.trim() || null,
    legal_guardian_phone: guardianPhone || null,
  });

  if (result.error) {
    return { error: result.error };
  }

  await logResidentProfileUpdated(data.residentId, permissionCheck.actor!, "Physician / guardian contact");

  return {};
}

// Governed "fix incorrect stuff" capability for a resident's Serve
// relationship — see
// supabase/migrations/20260826000000_add_resident_serve_relationship_corrections.sql
// and lib/residents/serveRelationshipProjection.ts's
// applyServeRelationshipCorrection() for how this takes precedence
// over (without erasing) the naturally-computed projection. Same
// governance boundary as every other resident profile correction in
// this file — not a general-purpose data-editing tool.
export async function correctServeRelationship(input: {
  residentId: string;
  previousValue: ServeRelationship | null;
  newValue: ServeRelationship;
  rationale: string;
}): Promise<{ error?: string }> {
  const permissionCheck = await assertCanEditResidentProfile();
  if (permissionCheck.error) {
    return { error: permissionCheck.error };
  }
  if (!input.rationale.trim()) {
    return { error: "A rationale is required to correct a Serve relationship." };
  }

  const result = await correctResidentServeRelationshipRecord({
    residentId: input.residentId,
    previousValue: input.previousValue,
    newValue: input.newValue,
    actor: permissionCheck.actor!,
    rationale: input.rationale.trim(),
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/residents");
  revalidatePath(`/residents/${input.residentId}`);
  revalidatePath("/reconciliation");
  return {};
}

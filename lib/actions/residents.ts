"use server";

import {
  updateFamilyContactFields,
  updateResidentProfileFields,
} from "@/lib/data/residents";
import { updateRelationshipDetails } from "@/lib/actions/connections";

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

  return {};
}

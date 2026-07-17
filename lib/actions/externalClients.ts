"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  convertExternalProspectToActiveClient as convertExternalProspectToActiveClientRecord,
  convertExternalProspectToExistingResident as convertExternalProspectToExistingResidentRecord,
  convertExternalProspectToNewResident as convertExternalProspectToNewResidentRecord,
  markExternalClientFormer as markExternalClientFormerRecord,
  placeExternalClientOnHold as placeExternalClientOnHoldRecord,
  reactivateExternalClient as reactivateExternalClientRecord,
} from "@/lib/data/externalClients";
import { findActiveResidentProspect } from "@/lib/relationships/duplicateDetection";
import { getRelationshipsByResident } from "@/lib/data/relationships";
import { isValidActionType } from "@/lib/relationships/constants";
import { isValidOpenActionDisposition } from "@/lib/externalClients/constants";
import { normalizeOptionalText, parseOptionalDate } from "@/lib/relationships/validation";
import {
  normalizeRequiredName,
  validateServiceAddress,
} from "@/lib/externalClients/validation";
import { RelationshipActionType } from "@/lib/supabase/types";

async function currentActorLabel(): Promise<string | null> {
  const profile = await getCurrentAuthorizedUser();
  return profile?.full_name || profile?.email || null;
}

function normalizedDisposition(raw: string | undefined): string {
  return raw && isValidOpenActionDisposition(raw) ? raw : "keep_open";
}

function normalizedActionType(raw: string | undefined): RelationshipActionType | null {
  return raw && isValidActionType(raw) ? (raw as RelationshipActionType) : null;
}

// ─── Part 14: External Prospect → Active External Client ───────────────

export async function convertExternalProspectToActiveClient(data: {
  relationshipId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  phone?: string;
  email?: string;
  serviceAddressLine1: string;
  serviceAddressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  primaryContactName?: string;
  primaryContactRelationship?: string;
  primaryContactPhone?: string;
  primaryContactEmail?: string;
  serviceStartDate?: string;
  conversionNote?: string;
  openActionDisposition?: string;
  onboardingActionTitle?: string;
  onboardingActionType?: string;
  onboardingActionDueAt?: string;
}): Promise<{ externalClientId?: string; error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }

  const firstName = normalizeRequiredName(data.firstName, "first name");
  if (firstName.error || !firstName.value) return { error: firstName.error };

  const lastName = normalizeRequiredName(data.lastName, "last name");
  if (lastName.error || !lastName.value) return { error: lastName.error };

  const address = validateServiceAddress({
    addressLine1: data.serviceAddressLine1,
    addressLine2: data.serviceAddressLine2,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
  });
  if (address.error || !address.value) return { error: address.error };

  const serviceStartDate = parseOptionalDate(data.serviceStartDate);
  if (serviceStartDate.error) return { error: serviceStartDate.error };

  const onboardingDueAt = parseOptionalDate(data.onboardingActionDueAt);
  if (onboardingDueAt.error) return { error: onboardingDueAt.error };

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to convert this relationship." };
  }

  return convertExternalProspectToActiveClientRecord({
    relationshipId: data.relationshipId,
    firstName: firstName.value,
    lastName: lastName.value,
    preferredName: normalizeOptionalText(data.preferredName),
    phone: normalizeOptionalText(data.phone),
    email: normalizeOptionalText(data.email),
    serviceAddressLine1: address.value.addressLine1,
    serviceAddressLine2: address.value.addressLine2,
    city: address.value.city,
    state: address.value.state,
    postalCode: address.value.postalCode,
    primaryContactName: normalizeOptionalText(data.primaryContactName),
    primaryContactRelationship: normalizeOptionalText(data.primaryContactRelationship),
    primaryContactPhone: normalizeOptionalText(data.primaryContactPhone),
    primaryContactEmail: normalizeOptionalText(data.primaryContactEmail),
    serviceStartDate: (serviceStartDate.iso ?? null)?.slice(0, 10) ?? null,
    conversionNote: normalizeOptionalText(data.conversionNote),
    openActionDisposition: normalizedDisposition(data.openActionDisposition),
    onboardingActionTitle: normalizeOptionalText(data.onboardingActionTitle),
    onboardingActionType: normalizedActionType(data.onboardingActionType),
    onboardingActionDueAt: onboardingDueAt.iso ?? null,
    actor,
  });
}

// ─── Part 15: External Prospect → New Resident Prospect ────────────────

export async function convertExternalProspectToNewResident(data: {
  relationshipId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  communityName?: string;
  unitNumber?: string;
  phone?: string;
  email?: string;
  familyContactName?: string;
  familyContactRelationship?: string;
  familyContactPhone?: string;
  familyContactEmail?: string;
  conversionNote?: string;
}): Promise<{ residentId?: string; error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }

  const firstName = normalizeRequiredName(data.firstName, "first name");
  if (firstName.error || !firstName.value) return { error: firstName.error };

  const lastName = normalizeRequiredName(data.lastName, "last name");
  if (lastName.error || !lastName.value) return { error: lastName.error };

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to convert this relationship." };
  }

  return convertExternalProspectToNewResidentRecord({
    relationshipId: data.relationshipId,
    firstName: firstName.value,
    lastName: lastName.value,
    preferredName: normalizeOptionalText(data.preferredName),
    communityName: normalizeOptionalText(data.communityName),
    unitNumber: normalizeOptionalText(data.unitNumber),
    phone: normalizeOptionalText(data.phone),
    email: normalizeOptionalText(data.email),
    familyContactName: normalizeOptionalText(data.familyContactName),
    familyContactRelationship: normalizeOptionalText(data.familyContactRelationship),
    familyContactPhone: normalizeOptionalText(data.familyContactPhone),
    familyContactEmail: normalizeOptionalText(data.familyContactEmail),
    conversionNote: normalizeOptionalText(data.conversionNote),
    actor,
  });
}

// ─── Part 16: External Prospect → Existing Resident Prospect ───────────

// Read-only duplicate check, same shape as
// lib/actions/relationships.ts#checkForActiveResidentProspect — kept here
// too so the External Clients "Link to Existing Resident" flow doesn't
// need to import from the Relationships action module for one function.
export async function checkResidentForActiveProspect(residentId: string) {
  if (!residentId) return { existing: null };

  const relationships = await getRelationshipsByResident(residentId);
  const existing = findActiveResidentProspect(
    relationships.map((r) => ({
      id: r.id,
      relationshipType: r.relationship_type,
      residentId: r.resident_id,
      status: r.status,
      updatedAt: r.updated_at,
    })),
    residentId
  );

  if (!existing) return { existing: null };
  return { existing: relationships.find((r) => r.id === existing.id) ?? null };
}

export async function convertExternalProspectToExistingResident(data: {
  relationshipId: string;
  residentId: string;
  conversionNote?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId || !data.residentId) {
    return { error: "Missing relationship or resident." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to convert this relationship." };
  }

  return convertExternalProspectToExistingResidentRecord(
    data.relationshipId,
    data.residentId,
    normalizeOptionalText(data.conversionNote),
    actor
  );
}

// ─── External Client lifecycle ──────────────────────────────────────────

export async function placeExternalClientOnHold(data: {
  relationshipId: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) return { error: "Missing relationship." };

  const actor = await currentActorLabel();
  if (!actor) return { error: "You must be signed in to update this client." };

  return placeExternalClientOnHoldRecord(data.relationshipId, actor);
}

export async function reactivateExternalClient(data: {
  relationshipId: string;
  nextActionTitle?: string;
  nextActionType?: string;
  nextActionDueAt?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) return { error: "Missing relationship." };

  const nextActionDueAt = parseOptionalDate(data.nextActionDueAt);
  if (nextActionDueAt.error) return { error: nextActionDueAt.error };

  const actor = await currentActorLabel();
  if (!actor) return { error: "You must be signed in to update this client." };

  return reactivateExternalClientRecord(
    data.relationshipId,
    normalizeOptionalText(data.nextActionTitle),
    normalizedActionType(data.nextActionType),
    nextActionDueAt.iso ?? null,
    actor
  );
}

export async function markExternalClientFormer(data: {
  relationshipId: string;
  effectiveEndDate?: string;
  reason?: string;
  openActionDisposition?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) return { error: "Missing relationship." };

  const effectiveEndDate = parseOptionalDate(data.effectiveEndDate);
  if (effectiveEndDate.error) return { error: effectiveEndDate.error };

  const actor = await currentActorLabel();
  if (!actor) return { error: "You must be signed in to update this client." };

  return markExternalClientFormerRecord(
    data.relationshipId,
    (effectiveEndDate.iso ?? null)?.slice(0, 10) ?? null,
    normalizeOptionalText(data.reason),
    normalizedDisposition(data.openActionDisposition),
    actor
  );
}

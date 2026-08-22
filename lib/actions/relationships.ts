"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  approveInteractionSuggestion as approveInteractionSuggestionRecord,
  changeRelationshipStage as changeRelationshipStageRecord,
  completeRelationshipAction as completeRelationshipActionRecord,
  createInteractionSuggestions as createInteractionSuggestionsRecord,
  createRelationship as createRelationshipRecord,
  createRelationshipAction as createRelationshipActionRecord,
  createRelationshipWorkingNote as createRelationshipWorkingNoteRecord,
  archiveRelationshipWorkingNote as archiveRelationshipWorkingNoteRecord,
  dismissInteractionSuggestion as dismissInteractionSuggestionRecord,
  dismissRelationshipAction as dismissRelationshipActionRecord,
  getRelationshipById as getRelationshipByIdRecord,
  getRelationshipsByResident as getRelationshipsByResidentRecord,
  linkRelationshipToResident as linkRelationshipToResidentRecord,
  logRelationshipInteraction as logRelationshipInteractionRecord,
  logRelationshipTouch as logRelationshipTouchRecord,
  resolveRelationshipCommitment as resolveRelationshipCommitmentRecord,
  resolveRelationshipInsight as resolveRelationshipInsightRecord,
  resolveRelationshipOpenLoop as resolveRelationshipOpenLoopRecord,
  resolveRelationshipWorkingNote as resolveRelationshipWorkingNoteRecord,
  searchResidentsForLinking as searchResidentsForLinkingRecord,
  updateRelationshipAction as updateRelationshipActionRecord,
  updateRelationshipOwnerAndPriority as updateRelationshipOwnerAndPriorityRecord,
  upsertRelationshipServiceLocation as upsertRelationshipServiceLocationRecord,
  upsertRelationshipServiceOpportunity as upsertRelationshipServiceOpportunityRecord,
  LogInteractionCommitmentInput,
  LogInteractionInsightInput,
  LogInteractionNextActionInput,
  LogInteractionOpenLoopInput,
  ResidentSearchResult,
} from "@/lib/data/relationships";
import { convertResidentProspectToActiveClient as convertResidentProspectToActiveClientRecord } from "@/lib/data/externalClients";
import { setRelationshipCommunityId as setRelationshipCommunityIdRecord } from "@/lib/data/relationships";
import { getResidentCurrentNeeds } from "@/lib/data/residentCurrentNeeds";
import { findActiveResidentProspect } from "@/lib/relationships/duplicateDetection";
import {
  resolveRelationshipCommunityIdForCreation,
  reconcileRelationshipCommunityIdForLinking,
} from "@/lib/relationships/communityIntegrity";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { generateInteractionSuggestions } from "@/lib/relationships/suggestionEngine";
import {
  isValidActionType,
  isValidCommitmentResponsiblePartyType,
  isValidInsightCategory,
  isValidInteractionResult,
  isValidRelationshipPriority,
  isValidRelationshipStage,
  isValidRelationshipType,
  isValidResidenceType,
  isValidTouchType,
  RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES,
  RELATIONSHIP_WORKING_NOTE_CATEGORIES,
} from "@/lib/relationships/constants";
import { isValidOpenActionDisposition } from "@/lib/externalClients/constants";
import { normalizeRequiredName, validateServiceAddress } from "@/lib/externalClients/validation";
import {
  normalizeActionTitle,
  normalizeCommitmentDescription,
  normalizeDisplayName,
  normalizeInsightContent,
  normalizeInteractionSummary,
  normalizeOpenLoopQuestion,
  normalizeOptionalText,
  normalizeTouchSummary,
  parseOptionalBoundedInteger,
  parseOptionalDate,
  parseOptionalDateOnly,
  RawParticipant,
  validateDueDateNotPast,
  validateParticipants,
} from "@/lib/relationships/validation";
import {
  PipelineStage,
  Relationship,
  RelationshipActionType,
  RelationshipInteractionParticipantRole,
  RelationshipInteractionResult,
  RelationshipInteractionSuggestion,
  RelationshipPriority,
  RelationshipTouchType,
  RelationshipType,
  RelationshipWorkingNoteCategory,
} from "@/lib/supabase/types";

async function currentActorLabel(): Promise<string | null> {
  const profile = await getCurrentAuthorizedUser();
  return profile?.full_name || profile?.email || null;
}

// ─── Create relationship ────────────────────────────────────────────────

export interface CreateRelationshipFormData {
  relationshipType: string;
  stage: string;
  displayName: string;
  residentId?: string;
  communityName?: string;
  organizationName?: string;
  primaryContactName?: string;
  primaryContactRelationship?: string;
  primaryContactPhone?: string;
  primaryContactEmail?: string;
  prospectiveResidentName?: string;
  summary?: string;
  ownerLabel?: string;
  priority: string;
  sourceType?: string;
  sourceLabel?: string;
  // Optional first Next Action, created atomically-adjacent (a second RPC
  // call right after creation) if title is supplied.
  firstActionTitle?: string;
  firstActionType?: string;
  firstActionDueAt?: string;
  // Optional Working Note and Service Opportunity, each created as a
  // further sequential follow-up call if supplied — same pattern as
  // firstActionTitle above, not a single database transaction (matches
  // this app's existing convention of composing several atomic RPCs at
  // the app layer rather than one all-in-one creation RPC).
  workingNoteContent?: string;
  serviceOpportunitySummary?: string;
  // Structured External Prospect identity + expected service location
  // (see docs/design/RELATIONSHIPS.md, "External Prospect domain model")
  // — required only when relationshipType is 'external_prospect'.
  prospectiveClientFirstName?: string;
  prospectiveClientLastName?: string;
  prospectiveClientPreferredName?: string;
  prospectiveClientPhone?: string;
  prospectiveClientEmail?: string;
  primaryContactIsProspectiveClient?: boolean;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string;
  serviceCity?: string;
  serviceState?: string;
  servicePostalCode?: string;
  residenceType?: string;
  facilityName?: string;
  locationNotes?: string;
}

export async function createRelationship(
  data: CreateRelationshipFormData
): Promise<{ id?: string; error?: string }> {
  if (!isValidRelationshipType(data.relationshipType)) {
    return { error: "Select a relationship type." };
  }
  if (!isValidRelationshipStage(data.stage)) {
    return { error: "Select a starting stage." };
  }
  if (!isValidRelationshipPriority(data.priority)) {
    return { error: "Select a valid priority." };
  }

  const displayName = normalizeDisplayName(data.displayName);
  if (displayName.error || !displayName.value) {
    return { error: displayName.error };
  }

  const isExternalProspect = data.relationshipType === "external_prospect";

  // An External Prospect is defined by an expected service location, not
  // by the absence of a linked resident — a structured client identity
  // and a complete service address are both required at creation (see
  // docs/design/RELATIONSHIPS.md, "External Prospect domain model").
  let prospectiveClientFirstName: string | undefined;
  let prospectiveClientLastName: string | undefined;
  let serviceAddress: NonNullable<ReturnType<typeof validateServiceAddress>["value"]> | undefined;

  if (isExternalProspect) {
    const firstName = normalizeRequiredName(data.prospectiveClientFirstName ?? "", "prospective client first name");
    if (firstName.error || !firstName.value) return { error: firstName.error };
    prospectiveClientFirstName = firstName.value;

    const lastName = normalizeRequiredName(data.prospectiveClientLastName ?? "", "prospective client last name");
    if (lastName.error || !lastName.value) return { error: lastName.error };
    prospectiveClientLastName = lastName.value;

    const address = validateServiceAddress({
      addressLine1: data.serviceAddressLine1 ?? "",
      addressLine2: data.serviceAddressLine2,
      city: data.serviceCity ?? "",
      state: data.serviceState ?? "",
      postalCode: data.servicePostalCode ?? "",
    });
    if (address.error || !address.value) return { error: address.error };
    serviceAddress = address.value;

    if (data.residenceType && !isValidResidenceType(data.residenceType)) {
      return { error: "Select a valid residence type." };
    }
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to create a relationship." };
  }

  // Community identity (Phase E/F, section 8): the linked resident's own
  // community wins if one is specified; otherwise the creator's current
  // single-community context applies automatically. Resolved before the
  // relationship exists — see communityIntegrity.ts's own contract.
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const resolvedCommunity = await resolveRelationshipCommunityIdForCreation({
    residentId: data.residentId || null,
    currentSingleCommunityId: communityFilter.mode === "single" ? communityFilter.communityId : null,
  });
  if (resolvedCommunity.error) {
    return { error: resolvedCommunity.error };
  }

  // "Primary contact is the prospective client" — one authoritative value
  // (the prospective client's own contact details), copied into the
  // primary-contact fields at write time rather than kept as two
  // independently editable, potentially-conflicting sets of values.
  const primaryContactIsProspectiveClient = isExternalProspect && !!data.primaryContactIsProspectiveClient;
  const derivedPrimaryContactName = primaryContactIsProspectiveClient
    ? [prospectiveClientFirstName, prospectiveClientLastName].filter(Boolean).join(" ")
    : normalizeOptionalText(data.primaryContactName);
  const derivedPrimaryContactPhone = primaryContactIsProspectiveClient
    ? normalizeOptionalText(data.prospectiveClientPhone)
    : normalizeOptionalText(data.primaryContactPhone);
  const derivedPrimaryContactEmail = primaryContactIsProspectiveClient
    ? normalizeOptionalText(data.prospectiveClientEmail)
    : normalizeOptionalText(data.primaryContactEmail);

  const result = await createRelationshipRecord({
    relationshipType: data.relationshipType as RelationshipType,
    stage: data.stage as PipelineStage,
    displayName: displayName.value,
    residentId: data.residentId || null,
    prospectId: null,
    communityName: normalizeOptionalText(data.communityName),
    organizationName: normalizeOptionalText(data.organizationName),
    primaryContactName: derivedPrimaryContactName,
    primaryContactRelationship: primaryContactIsProspectiveClient
      ? "Self"
      : normalizeOptionalText(data.primaryContactRelationship),
    primaryContactPhone: derivedPrimaryContactPhone,
    primaryContactEmail: derivedPrimaryContactEmail,
    prospectiveResidentName: normalizeOptionalText(data.prospectiveResidentName),
    summary: normalizeOptionalText(data.summary),
    ownerLabel: normalizeOptionalText(data.ownerLabel),
    priority: data.priority as RelationshipPriority,
    sourceType: normalizeOptionalText(data.sourceType),
    sourceLabel: normalizeOptionalText(data.sourceLabel),
    actor,
    prospectiveClientFirstName,
    prospectiveClientLastName,
    prospectiveClientPreferredName: normalizeOptionalText(data.prospectiveClientPreferredName),
    prospectiveClientPhone: normalizeOptionalText(data.prospectiveClientPhone),
    prospectiveClientEmail: normalizeOptionalText(data.prospectiveClientEmail),
    primaryContactIsProspectiveClient,
  });

  if (result.error || !result.id) {
    return { error: result.error };
  }

  // Follow-up scoped write, not part of the create_relationship RPC's own
  // signature — see setRelationshipCommunityId's own comment for why.
  // Never fails the whole creation: a resident record now exists either
  // way, and the community field can be corrected without redoing the
  // create.
  if (resolvedCommunity.communityId) {
    await setRelationshipCommunityIdRecord(result.id, resolvedCommunity.communityId);
  }

  if (serviceAddress) {
    await upsertRelationshipServiceLocationRecord({
      relationshipId: result.id,
      addressLine1: serviceAddress.addressLine1,
      addressLine2: serviceAddress.addressLine2,
      city: serviceAddress.city,
      state: serviceAddress.state,
      postalCode: serviceAddress.postalCode,
      residenceType: data.residenceType && isValidResidenceType(data.residenceType) ? data.residenceType : null,
      facilityName: normalizeOptionalText(data.facilityName),
      locationNotes: normalizeOptionalText(data.locationNotes),
      actor,
    });
  }

  if (data.firstActionTitle?.trim()) {
    const actionType = isValidActionType(data.firstActionType ?? "")
      ? (data.firstActionType as RelationshipActionType)
      : "follow_up";
    const dueDate = parseOptionalDate(data.firstActionDueAt);
    await createRelationshipActionRecord({
      relationshipId: result.id,
      actionType,
      title: data.firstActionTitle.trim(),
      description: null,
      dueAt: dueDate.iso ?? null,
      assignedTo: normalizeOptionalText(data.ownerLabel),
      priority: "normal",
      actor,
    });
  }

  if (data.workingNoteContent?.trim()) {
    await createRelationshipWorkingNoteRecord(
      result.id,
      data.workingNoteContent.trim(),
      null,
      actor
    );
  }

  if (data.serviceOpportunitySummary?.trim()) {
    await upsertRelationshipServiceOpportunityRecord({
      relationshipId: result.id,
      serviceSummary: data.serviceOpportunitySummary.trim(),
      visitsPerWeek: null,
      preferredDays: null,
      preferredTimeWindows: null,
      estimatedVisitMinutes: null,
      anticipatedStartDate: null,
      serviceLocationSummary: null,
      status: null,
      actor,
    });
  }

  return { id: result.id };
}

// ─── Expected service location (External Prospect) ──────────────────────

export async function updateRelationshipServiceLocation(data: {
  relationshipId: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  residenceType?: string;
  facilityName?: string;
  locationNotes?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }

  const address = validateServiceAddress({
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
  });
  if (address.error || !address.value) return { error: address.error };

  if (data.residenceType && !isValidResidenceType(data.residenceType)) {
    return { error: "Select a valid residence type." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update the service location." };
  }

  const result = await upsertRelationshipServiceLocationRecord({
    relationshipId: data.relationshipId,
    addressLine1: address.value.addressLine1,
    addressLine2: address.value.addressLine2,
    city: address.value.city,
    state: address.value.state,
    postalCode: address.value.postalCode,
    residenceType: data.residenceType && isValidResidenceType(data.residenceType) ? data.residenceType : null,
    facilityName: normalizeOptionalText(data.facilityName),
    locationNotes: normalizeOptionalText(data.locationNotes),
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

// ─── Stage change ────────────────────────────────────────────────────────

export async function changeRelationshipStage(data: {
  relationshipId: string;
  toStage: string;
  changeReason?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }
  if (!isValidRelationshipStage(data.toStage)) {
    return { error: "Select a valid stage." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to change a relationship's stage." };
  }

  return changeRelationshipStageRecord(
    data.relationshipId,
    data.toStage,
    normalizeOptionalText(data.changeReason),
    actor
  );
}

// ─── Owner / Priority (Whiteboard inline edit) ──────────────────────────

export async function updateRelationshipOwnerAndPriority(data: {
  relationshipId: string;
  ownerLabel?: string;
  priority: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }
  if (!isValidRelationshipPriority(data.priority)) {
    return { error: "Select a valid priority." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update a relationship." };
  }

  return updateRelationshipOwnerAndPriorityRecord(
    data.relationshipId,
    normalizeOptionalText(data.ownerLabel),
    data.priority as RelationshipPriority,
    actor
  );
}

// ─── Link to resident ──────────────────────────────────────────────────

export async function linkRelationshipToResident(data: {
  relationshipId: string;
  residentId: string;
  force?: boolean;
}): Promise<{ error?: string; alreadyLinked?: boolean }> {
  if (!data.relationshipId || !data.residentId) {
    return { error: "Missing relationship or resident." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to link a relationship." };
  }

  // Community integrity (Phase E/F, section 9): a real mismatch between
  // the relationship's own community and the resident's is rejected
  // before the link RPC ever runs — never silently rewritten on either
  // side. A relationship with no community yet correctly inherits the
  // resident's here, since linking is exactly when that ambiguity
  // resolves.
  const existingRelationship = await getRelationshipByIdRecord(data.relationshipId);
  if (!existingRelationship) {
    return { error: "Relationship not found." };
  }
  const communityReconciliation = await reconcileRelationshipCommunityIdForLinking({
    relationshipCommunityId: existingRelationship.community_id,
    residentId: data.residentId,
  });
  if (!communityReconciliation.ok) {
    return { error: communityReconciliation.error };
  }

  const result = await linkRelationshipToResidentRecord(
    data.relationshipId,
    data.residentId,
    actor,
    data.force ?? false
  );

  if (result.error === "ALREADY_LINKED") {
    return { alreadyLinked: true };
  }

  if (result.error) {
    return { error: result.error };
  }

  // Only a real write when the relationship's community was actually
  // filled in (was null, now inherits the resident's) — when it already
  // matched, resolvedCommunityId equals the existing value and this is a
  // no-op update, harmless but skipped for clarity.
  if (communityReconciliation.resolvedCommunityId !== existingRelationship.community_id) {
    await setRelationshipCommunityIdRecord(data.relationshipId, communityReconciliation.resolvedCommunityId);
  }

  return {};
}

// ─── Touches ─────────────────────────────────────────────────────────────

export async function logRelationshipTouch(data: {
  relationshipId: string;
  touchType: string;
  occurredAt?: string;
  summary: string;
  outcome?: string;
  contactName?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }
  if (!isValidTouchType(data.touchType)) {
    return { error: "Select a touch type." };
  }

  const summary = normalizeTouchSummary(data.summary);
  if (summary.error || !summary.value) {
    return { error: summary.error };
  }

  const occurredAt = parseOptionalDate(data.occurredAt);
  if (occurredAt.error) {
    return { error: occurredAt.error };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to log a touch." };
  }

  const result = await logRelationshipTouchRecord({
    relationshipId: data.relationshipId,
    touchType: data.touchType as RelationshipTouchType,
    occurredAt: occurredAt.iso ?? null,
    summary: summary.value,
    outcome: normalizeOptionalText(data.outcome),
    contactName: normalizeOptionalText(data.contactName),
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

// ─── Next Actions ────────────────────────────────────────────────────────

export async function createNextAction(data: {
  relationshipId: string;
  actionType: string;
  title: string;
  description?: string;
  dueAt?: string;
  assignedTo?: string;
  priority: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }
  if (!isValidActionType(data.actionType)) {
    return { error: "Select an action type." };
  }
  if (!isValidRelationshipPriority(data.priority)) {
    return { error: "Select a valid priority." };
  }

  const title = normalizeActionTitle(data.title);
  if (title.error || !title.value) {
    return { error: title.error };
  }

  const dueDate = parseOptionalDate(data.dueAt);
  if (dueDate.error) {
    return { error: dueDate.error };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to create an action." };
  }

  const result = await createRelationshipActionRecord({
    relationshipId: data.relationshipId,
    actionType: data.actionType as RelationshipActionType,
    title: title.value,
    description: normalizeOptionalText(data.description),
    dueAt: dueDate.iso ?? null,
    assignedTo: normalizeOptionalText(data.assignedTo),
    priority: data.priority as RelationshipPriority,
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export async function editNextAction(data: {
  actionId: string;
  relationshipId: string;
  title: string;
  description?: string;
  actionType: string;
  dueAt?: string;
  previousDueAt?: string | null;
  assignedTo?: string;
  priority: string;
}): Promise<{ error?: string }> {
  if (!data.actionId || !data.relationshipId) {
    return { error: "Missing action." };
  }
  if (!isValidActionType(data.actionType)) {
    return { error: "Select an action type." };
  }
  if (!isValidRelationshipPriority(data.priority)) {
    return { error: "Select a valid priority." };
  }

  const title = normalizeActionTitle(data.title);
  if (title.error || !title.value) {
    return { error: title.error };
  }

  const dueDate = parseOptionalDate(data.dueAt);
  if (dueDate.error || dueDate.iso === undefined) {
    return { error: dueDate.error };
  }

  const pastDateCheck = validateDueDateNotPast(dueDate.iso, data.previousDueAt ?? null);
  if (pastDateCheck.error) {
    return { error: pastDateCheck.error };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to edit an action." };
  }

  const result = await updateRelationshipActionRecord({
    actionId: data.actionId,
    relationshipId: data.relationshipId,
    title: title.value,
    description: normalizeOptionalText(data.description),
    actionType: data.actionType as RelationshipActionType,
    dueAt: dueDate.iso,
    assignedTo: normalizeOptionalText(data.assignedTo),
    priority: data.priority as RelationshipPriority,
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export async function completeNextAction(data: {
  actionId: string;
  relationshipId: string;
  completionOutcome?: string;
}): Promise<{ error?: string }> {
  if (!data.actionId || !data.relationshipId) {
    return { error: "Missing action." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to complete an action." };
  }

  return completeRelationshipActionRecord(
    data.actionId,
    data.relationshipId,
    normalizeOptionalText(data.completionOutcome),
    actor
  );
}

export async function dismissNextAction(data: {
  actionId: string;
  relationshipId: string;
}): Promise<{ error?: string }> {
  if (!data.actionId || !data.relationshipId) {
    return { error: "Missing action." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to dismiss an action." };
  }

  return dismissRelationshipActionRecord(data.actionId, data.relationshipId, actor);
}

// ─── Resident linking search ─────────────────────────────────────────────

export async function searchResidentsForLinking(
  query: string,
  options?: { readonly crossCommunity?: boolean; readonly communityId?: string }
): Promise<ResidentSearchResult[]> {
  // Phase E/F completion, section 4: single-community context searches
  // only that community; an authorized all_communities context searches
  // across all of them (with community identity attached to disambiguate
  // — see ResidentSearchResult.communityName); an unassigned scope
  // searches nothing, never silently everything.
  //
  // crossCommunity is one explicit override: a deliberate, explicit
  // "search other communities" opt-in (never the default) for move/
  // transfer reconciliation cases.
  //
  // communityId is the other: AxisCare Reconciliation + Multi-Source
  // Identity Ingestion phase, section 10 — "Match to Existing Person"
  // must default to the SOURCE RECORD's own resolved community (e.g.
  // Firewheel for a Firewheel AxisCare prospect), which is independent of
  // whatever community the operator currently has selected in the cookie
  // (Reconciliation itself is a deliberately unscoped, cross-community
  // page) — resolveCurrentCommunityQueryFilter() below would answer the
  // wrong question here.
  if (options?.crossCommunity) {
    return searchResidentsForLinkingRecord(query, { mode: "all" });
  }
  if (options?.communityId) {
    return searchResidentsForLinkingRecord(query, { mode: "single", communityId: options.communityId });
  }
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  return searchResidentsForLinkingRecord(query, communityFilter);
}

// ─── Resident Prospect duplicate check (Part 13) ────────────────────────
//
// Called before showing the "create" step of the Resident Prospect flow
// (both from the resident detail page's "Start Relationship" and from
// Relationships' "Add Resident Prospect") so a duplicate active
// Relationship is never created silently — the caller shows "Open
// Relationship" / "Create Another" instead. Read-only; never creates
// anything itself.
export interface ResidentProspectDuplicateCheck {
  existing: Relationship | null;
}

export async function checkForActiveResidentProspect(
  residentId: string
): Promise<ResidentProspectDuplicateCheck> {
  if (!residentId) return { existing: null };

  const relationships = await getRelationshipsByResidentRecord(residentId);
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

// ─── Service Opportunity ─────────────────────────────────────────────────

const SERVICE_OPPORTUNITY_STATUSES = ["draft", "ready_for_proposal", "superseded"];

export async function upsertServiceOpportunity(data: {
  relationshipId: string;
  serviceSummary?: string;
  visitsPerWeek?: string;
  preferredDays?: string;
  preferredTimeWindows?: string;
  estimatedVisitMinutes?: string;
  anticipatedStartDate?: string;
  serviceLocationSummary?: string;
  status?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }

  const visitsPerWeek = parseOptionalBoundedInteger(data.visitsPerWeek, 0, 21, "Visits per week");
  if (visitsPerWeek.error) {
    return { error: visitsPerWeek.error };
  }

  const estimatedVisitMinutes = parseOptionalBoundedInteger(
    data.estimatedVisitMinutes,
    1,
    1440,
    "Estimated visit duration"
  );
  if (estimatedVisitMinutes.error) {
    return { error: estimatedVisitMinutes.error };
  }

  const anticipatedStartDate = parseOptionalDateOnly(data.anticipatedStartDate);
  if (anticipatedStartDate.error) {
    return { error: anticipatedStartDate.error };
  }

  const status =
    data.status && SERVICE_OPPORTUNITY_STATUSES.includes(data.status) ? data.status : null;

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to save a service opportunity." };
  }

  const result = await upsertRelationshipServiceOpportunityRecord({
    relationshipId: data.relationshipId,
    serviceSummary: normalizeOptionalText(data.serviceSummary),
    visitsPerWeek: visitsPerWeek.value ?? null,
    preferredDays: normalizeOptionalText(data.preferredDays),
    preferredTimeWindows: normalizeOptionalText(data.preferredTimeWindows),
    estimatedVisitMinutes: estimatedVisitMinutes.value ?? null,
    anticipatedStartDate: anticipatedStartDate.iso ?? null,
    serviceLocationSummary: normalizeOptionalText(data.serviceLocationSummary),
    status,
    actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

// ─── Working Notes ───────────────────────────────────────────────────────

function normalizeWorkingNoteCategory(raw: string): RelationshipWorkingNoteCategory | null {
  if (!raw) return null;
  return (RELATIONSHIP_WORKING_NOTE_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as RelationshipWorkingNoteCategory)
    : null;
}

export async function createRelationshipWorkingNote(data: {
  relationshipId: string;
  content: string;
  category: string;
  // Relationship Intelligence Phase 1 additions — see
  // docs/architecture/relationship-intelligence-phase-1-implementation.md.
  // All optional; no existing caller needs to change.
  relevantUntil?: string;
  residentId?: string;
  contactName?: string;
  sourceDescription?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }

  const content = data.content.trim();
  if (!content) {
    return { error: "Working note cannot be blank." };
  }
  if (content.length > 1000) {
    return { error: "Keep working notes under 1000 characters." };
  }

  const relevantUntil = parseOptionalDateOnly(data.relevantUntil);
  if (relevantUntil.error) {
    return { error: relevantUntil.error };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to add a working note." };
  }

  const result = await createRelationshipWorkingNoteRecord(
    data.relationshipId,
    content,
    normalizeWorkingNoteCategory(data.category),
    actor,
    {
      relevantUntil: relevantUntil.iso ?? null,
      residentId: normalizeOptionalText(data.residentId),
      contactName: normalizeOptionalText(data.contactName),
      sourceDescription: normalizeOptionalText(data.sourceDescription),
    },
  );

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export async function resolveRelationshipWorkingNote(data: {
  workingNoteId: string;
}): Promise<{ error?: string }> {
  if (!data.workingNoteId) {
    return { error: "Missing working note." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to resolve a working note." };
  }

  return resolveRelationshipWorkingNoteRecord(data.workingNoteId, actor);
}

export async function archiveRelationshipWorkingNote(data: {
  workingNoteId: string;
}): Promise<{ error?: string }> {
  if (!data.workingNoteId) {
    return { error: "Missing working note." };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to archive a working note." };
  }

  return archiveRelationshipWorkingNoteRecord(data.workingNoteId, actor);
}

// ─── Part 12: Resident Prospect → Active Serve Client ───────────────────

export async function convertResidentProspectToActiveClient(data: {
  relationshipId: string;
  effectiveStartDate?: string;
  conversionNote?: string;
  openActionDisposition?: string;
  onboardingActionTitle?: string;
  onboardingActionType?: string;
  onboardingActionDueAt?: string;
}): Promise<{ error?: string }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }

  const effectiveStartDate = parseOptionalDateOnly(data.effectiveStartDate);
  if (effectiveStartDate.error) return { error: effectiveStartDate.error };

  const onboardingDueAt = parseOptionalDate(data.onboardingActionDueAt);
  if (onboardingDueAt.error) return { error: onboardingDueAt.error };

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to convert this relationship." };
  }

  return convertResidentProspectToActiveClientRecord({
    relationshipId: data.relationshipId,
    effectiveStartDate: effectiveStartDate.iso ?? null,
    conversionNote: normalizeOptionalText(data.conversionNote),
    openActionDisposition:
      data.openActionDisposition && isValidOpenActionDisposition(data.openActionDisposition)
        ? data.openActionDisposition
        : "keep_open",
    onboardingActionTitle: normalizeOptionalText(data.onboardingActionTitle),
    onboardingActionType:
      data.onboardingActionType && isValidActionType(data.onboardingActionType)
        ? (data.onboardingActionType as RelationshipActionType)
        : null,
    onboardingActionDueAt: onboardingDueAt.iso ?? null,
    actor,
  });
}

// ─── Relationship Intelligence Phase 1 — Log Interaction ────────────────
// See docs/architecture/relationship-intelligence-phase-1-implementation.md.
// This action validates and delegates to the single atomic RPC wrapper
// (logRelationshipInteractionRecord) — it contains no logic the data layer
// doesn't already have.

export async function logRelationshipInteraction(data: {
  relationshipId: string;
  touchType: string;
  occurredAt?: string;
  summary: string;
  interactionResult?: string;
  outcome?: string;
  contactName?: string;
  participants?: RawParticipant[];
  insights?: Array<{
    content: string;
    category: string;
    whyItMatters?: string;
    relevantUntil?: string;
    residentId?: string;
  }>;
  commitments?: Array<{
    description: string;
    responsiblePartyType: string;
    responsiblePartyReference?: string;
    expectedDate?: string;
  }>;
  openLoops?: Array<{
    question: string;
    owner?: string;
    targetResolutionDate?: string;
  }>;
  nextAction?: {
    title: string;
    actionType: string;
    dueAt?: string;
    assignedTo?: string;
    priority: string;
    description?: string;
  } | null;
  // Client-generated, one per Log Interaction form session — see
  // lib/data/relationships.ts#LogInteractionInput.
  idempotencyKey?: string;
}): Promise<{ error?: string; interactionId?: string; suggestions?: RelationshipInteractionSuggestion[] }> {
  if (!data.relationshipId) {
    return { error: "Missing relationship." };
  }
  if (!isValidTouchType(data.touchType)) {
    return { error: "Select an interaction type." };
  }
  if (data.interactionResult && !isValidInteractionResult(data.interactionResult)) {
    return { error: "Select a valid result." };
  }

  const summary = normalizeInteractionSummary(data.summary);
  if (summary.error || !summary.value) {
    return { error: summary.error };
  }

  const occurredAt = parseOptionalDate(data.occurredAt);
  if (occurredAt.error) {
    return { error: occurredAt.error };
  }

  const participants = validateParticipants(data.participants, (role) =>
    (RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES as readonly string[]).includes(role),
  );
  if (participants.error) {
    return { error: participants.error };
  }

  const insights: LogInteractionInsightInput[] = [];
  for (const raw of data.insights ?? []) {
    const content = normalizeInsightContent(raw.content ?? "");
    if (content.error || !content.value) continue; // blank repeatable row — skip, don't reject the submission
    if (!isValidInsightCategory(raw.category)) {
      return { error: "Select a valid insight category." };
    }
    insights.push({
      content: content.value,
      category: raw.category,
      whyItMatters: normalizeOptionalText(raw.whyItMatters),
      relevantUntil: parseOptionalDateOnly(raw.relevantUntil).iso ?? null,
      residentId: normalizeOptionalText(raw.residentId),
    });
  }

  const commitments: LogInteractionCommitmentInput[] = [];
  for (const raw of data.commitments ?? []) {
    const description = normalizeCommitmentDescription(raw.description ?? "");
    if (description.error || !description.value) continue;
    if (!isValidCommitmentResponsiblePartyType(raw.responsiblePartyType)) {
      return { error: "Select who the commitment belongs to." };
    }
    commitments.push({
      description: description.value,
      responsiblePartyType: raw.responsiblePartyType,
      responsiblePartyReference: normalizeOptionalText(raw.responsiblePartyReference),
      expectedDate: parseOptionalDateOnly(raw.expectedDate).iso ?? null,
    });
  }

  const openLoops: LogInteractionOpenLoopInput[] = [];
  for (const raw of data.openLoops ?? []) {
    const question = normalizeOpenLoopQuestion(raw.question ?? "");
    if (question.error || !question.value) continue;
    openLoops.push({
      question: question.value,
      owner: normalizeOptionalText(raw.owner),
      targetResolutionDate: parseOptionalDateOnly(raw.targetResolutionDate).iso ?? null,
    });
  }

  let nextAction: LogInteractionNextActionInput | null = null;
  if (data.nextAction) {
    if (!isValidActionType(data.nextAction.actionType)) {
      return { error: "Select a type for the next action." };
    }
    if (!isValidRelationshipPriority(data.nextAction.priority)) {
      return { error: "Select a valid priority for the next action." };
    }
    const title = normalizeActionTitle(data.nextAction.title);
    if (title.error || !title.value) {
      return { error: title.error };
    }
    const dueAt = parseOptionalDate(data.nextAction.dueAt);
    if (dueAt.error) {
      return { error: dueAt.error };
    }
    nextAction = {
      title: title.value,
      actionType: data.nextAction.actionType,
      dueAt: dueAt.iso ?? null,
      assignedTo: normalizeOptionalText(data.nextAction.assignedTo),
      priority: data.nextAction.priority,
      description: normalizeOptionalText(data.nextAction.description),
    };
  }

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to log an interaction." };
  }

  const result = await logRelationshipInteractionRecord({
    relationshipId: data.relationshipId,
    touchType: data.touchType as RelationshipTouchType,
    occurredAt: occurredAt.iso ?? null,
    summary: summary.value,
    interactionResult: (data.interactionResult as RelationshipInteractionResult | undefined) ?? null,
    outcome: normalizeOptionalText(data.outcome),
    contactName: normalizeOptionalText(data.contactName),
    // role is already validated against RELATIONSHIP_INTERACTION_PARTICIPANT_ROLES
    // by validateParticipants() above.
    participants: (participants.value ?? []).map((p) => ({
      role: p.role as RelationshipInteractionParticipantRole,
      name: p.name,
      personId: p.personId,
    })),
    insights,
    commitments,
    openLoops,
    nextAction,
    actor,
    idempotencyKey: normalizeOptionalText(data.idempotencyKey),
  });

  if (result.error || !result.interaction) {
    return { error: result.error ?? "Could not log this interaction." };
  }

  // Generate review suggestions in the same request — no extra round trip
  // the user has to wait on separately. Deterministic, no AI call (see
  // lib/relationships/suggestionEngine.ts). Failure here never invalidates
  // the Interaction that was already saved above; it's reported but the
  // interaction itself is still a success.
  const suggestions = await generateSuggestionsForInteraction(result.interaction, actor, nextAction !== null);

  return { interactionId: result.interaction.id, suggestions };
}

async function generateSuggestionsForInteraction(
  interaction: { id: string; relationship_id: string; summary: string; touch_type: RelationshipTouchType; interaction_result: RelationshipInteractionResult | null },
  actor: string,
  hasExplicitNextAction: boolean,
): Promise<RelationshipInteractionSuggestion[]> {
  const relationship = await getRelationshipByIdRecord(interaction.relationship_id);
  if (!relationship) return [];

  const isResidentLinked = Boolean(relationship.resident_id);
  const existingNeeds = isResidentLinked ? await getResidentCurrentNeeds(relationship.resident_id as string) : null;

  const drafts = generateInteractionSuggestions({
    narrative: interaction.summary,
    touchType: interaction.touch_type,
    interactionResult: interaction.interaction_result,
    hasExplicitNextAction,
    isResidentLinked,
    currentStage: relationship.stage,
    existingResidentNeedsContent: existingNeeds?.content ?? "",
  });

  if (drafts.length === 0) return [];

  const created = await createInteractionSuggestionsRecord(interaction.id, interaction.relationship_id, drafts, actor);
  return created.suggestions ?? [];
}

// ─── Insights / Commitments / Open Loops lifecycle ──────────────────────

export async function resolveInsight(data: {
  insightId: string;
  status: "resolved" | "outdated";
}): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update an insight." };
  }
  const result = await resolveRelationshipInsightRecord(data.insightId, data.status, actor);
  return result.error ? { error: result.error } : {};
}

export async function resolveCommitment(data: {
  commitmentId: string;
  status: "completed" | "cancelled";
  closureNote?: string;
}): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update a commitment." };
  }
  const result = await resolveRelationshipCommitmentRecord(
    data.commitmentId,
    data.status,
    normalizeOptionalText(data.closureNote),
    actor,
  );
  return result.error ? { error: result.error } : {};
}

export async function resolveOpenLoop(data: {
  openLoopId: string;
  status: "resolved" | "no_longer_relevant";
  resolution?: string;
}): Promise<{ error?: string }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to update an open loop." };
  }
  const result = await resolveRelationshipOpenLoopRecord(
    data.openLoopId,
    data.status,
    normalizeOptionalText(data.resolution),
    actor,
  );
  return result.error ? { error: result.error } : {};
}

// ─── Interaction Suggestion Review ─────────────────────────────────────
// Approve/edit/dismiss a deterministically-generated suggestion (see
// lib/relationships/suggestionEngine.ts). Approving composes the same
// existing write RPCs every other part of this file already calls
// directly — never a duplicate write path. Both are idempotent: retrying
// or double-clicking either action is safe (see
// approve_interaction_suggestion/dismiss_interaction_suggestion's
// no-op-if-already-resolved guard).

export async function approveInteractionSuggestion(data: {
  suggestionId: string;
  editedPayload?: Record<string, unknown>;
}): Promise<{ error?: string; suggestion?: RelationshipInteractionSuggestion }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to approve a suggestion." };
  }
  const result = await approveInteractionSuggestionRecord(data.suggestionId, data.editedPayload ?? null, actor);
  return result.error ? { error: result.error } : { suggestion: result.suggestion };
}

export async function dismissInteractionSuggestion(data: {
  suggestionId: string;
}): Promise<{ error?: string; suggestion?: RelationshipInteractionSuggestion }> {
  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to dismiss a suggestion." };
  }
  const result = await dismissInteractionSuggestionRecord(data.suggestionId, actor);
  return result.error ? { error: result.error } : { suggestion: result.suggestion };
}

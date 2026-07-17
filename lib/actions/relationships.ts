"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  changeRelationshipStage as changeRelationshipStageRecord,
  completeRelationshipAction as completeRelationshipActionRecord,
  createRelationship as createRelationshipRecord,
  createRelationshipAction as createRelationshipActionRecord,
  createRelationshipWorkingNote as createRelationshipWorkingNoteRecord,
  archiveRelationshipWorkingNote as archiveRelationshipWorkingNoteRecord,
  dismissRelationshipAction as dismissRelationshipActionRecord,
  linkRelationshipToResident as linkRelationshipToResidentRecord,
  logRelationshipTouch as logRelationshipTouchRecord,
  resolveRelationshipWorkingNote as resolveRelationshipWorkingNoteRecord,
  searchResidentsForLinking as searchResidentsForLinkingRecord,
  updateRelationshipAction as updateRelationshipActionRecord,
  updateRelationshipOwnerAndPriority as updateRelationshipOwnerAndPriorityRecord,
  upsertRelationshipServiceOpportunity as upsertRelationshipServiceOpportunityRecord,
  ResidentSearchResult,
} from "@/lib/data/relationships";
import {
  isValidActionType,
  isValidRelationshipPriority,
  isValidRelationshipStage,
  isValidRelationshipType,
  isValidTouchType,
  RELATIONSHIP_WORKING_NOTE_CATEGORIES,
} from "@/lib/relationships/constants";
import {
  normalizeActionTitle,
  normalizeDisplayName,
  normalizeOptionalText,
  normalizeTouchSummary,
  parseOptionalBoundedInteger,
  parseOptionalDate,
  parseOptionalDateOnly,
  validateDueDateNotPast,
} from "@/lib/relationships/validation";
import {
  PipelineStage,
  RelationshipActionType,
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

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to create a relationship." };
  }

  const result = await createRelationshipRecord({
    relationshipType: data.relationshipType as RelationshipType,
    stage: data.stage as PipelineStage,
    displayName: displayName.value,
    residentId: data.residentId || null,
    prospectId: null,
    communityName: normalizeOptionalText(data.communityName),
    organizationName: normalizeOptionalText(data.organizationName),
    primaryContactName: normalizeOptionalText(data.primaryContactName),
    primaryContactRelationship: normalizeOptionalText(data.primaryContactRelationship),
    primaryContactPhone: normalizeOptionalText(data.primaryContactPhone),
    primaryContactEmail: normalizeOptionalText(data.primaryContactEmail),
    prospectiveResidentName: normalizeOptionalText(data.prospectiveResidentName),
    summary: normalizeOptionalText(data.summary),
    ownerLabel: normalizeOptionalText(data.ownerLabel),
    priority: data.priority as RelationshipPriority,
    sourceType: normalizeOptionalText(data.sourceType),
    sourceLabel: normalizeOptionalText(data.sourceLabel),
    actor,
  });

  if (result.error || !result.id) {
    return { error: result.error };
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

  return { id: result.id };
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
  query: string
): Promise<ResidentSearchResult[]> {
  return searchResidentsForLinkingRecord(query);
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

  const actor = await currentActorLabel();
  if (!actor) {
    return { error: "You must be signed in to add a working note." };
  }

  const result = await createRelationshipWorkingNoteRecord(
    data.relationshipId,
    content,
    normalizeWorkingNoteCategory(data.category),
    actor
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

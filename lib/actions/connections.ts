"use server";

import {
  archiveInterest,
  createInterest,
  createMilestone,
  upsertRelationshipProfile,
} from "@/lib/data/connections";
import {
  ConnectionSourceType,
  InterestConfidence,
  InterestType,
  MilestoneType,
  RelationshipStage,
  ResidentRelationshipProfileInsert,
} from "@/lib/supabase/types";

export interface AddInterestFormData {
  residentId: string;
  interestType: InterestType;
  interestValue: string;
  details?: string;
  sourceType: ConnectionSourceType;
  sourceNote?: string;
  confidence: InterestConfidence;
  confirmedByResident: boolean;
  supportsFutureTouch: boolean;
}

export async function addConnectionNote(
  data: AddInterestFormData
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  if (!data.interestType) {
    return { error: "Select a category." };
  }

  if (!data.interestValue.trim()) {
    return { error: "Describe what was learned." };
  }

  const result = await createInterest({
    resident_id: data.residentId,
    interest_type: data.interestType,
    interest_value: data.interestValue.trim(),
    details: data.details?.trim() || null,
    source_type: data.sourceType,
    source_note: data.sourceNote?.trim() || null,
    confidence: data.confidence,
    confirmed_by_resident: data.confirmedByResident,
    supports_future_touch: data.supportsFutureTouch,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export async function archiveLearnedDetail(data: {
  interestId: string;
}): Promise<{ error?: string }> {
  if (!data.interestId) {
    return { error: "Missing entry." };
  }

  const result = await archiveInterest(data.interestId);

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export interface RelationshipDetailsFormData {
  residentId: string;
  // Only fields present are updated — omitting one leaves it untouched,
  // so this action can be called from either the Connections "Relationship
  // Details" card (both fields) or the Resident Profile card (name only).
  preferredName?: string;
  relationshipStage?: RelationshipStage;
}

export async function updateRelationshipDetails(
  data: RelationshipDetailsFormData
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  const row: ResidentRelationshipProfileInsert = {
    resident_id: data.residentId,
  };

  if (data.preferredName !== undefined) {
    row.preferred_name = data.preferredName.trim() || null;
  }

  if (data.relationshipStage !== undefined) {
    row.relationship_stage = data.relationshipStage;
  }

  const result = await upsertRelationshipProfile(row);

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

export interface AddMilestoneFormData {
  residentId: string;
  milestoneType: MilestoneType;
  title: string;
  month?: number;
  day?: number;
  eventDate?: string;
  yearKnown: boolean;
  sourceType: ConnectionSourceType;
  appropriateForOutreach: boolean;
  notes?: string;
}

export async function addMilestone(
  data: AddMilestoneFormData
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  if (!data.milestoneType) {
    return { error: "Select a milestone type." };
  }

  if (!data.title.trim()) {
    return { error: "Give this milestone a title." };
  }

  if (!data.month && !data.day && !data.eventDate) {
    return { error: "Provide at least a month/day or a full date." };
  }

  const result = await createMilestone({
    resident_id: data.residentId,
    milestone_type: data.milestoneType,
    title: data.title.trim(),
    month: data.month ?? null,
    day: data.day ?? null,
    event_date: data.eventDate || null,
    year_known: data.yearKnown,
    source_type: data.sourceType,
    appropriate_for_outreach: data.appropriateForOutreach,
    notes: data.notes?.trim() || null,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

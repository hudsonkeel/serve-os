"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  completeResidentWellnessFollowUp,
  createManualResidentWellnessFollowUp,
  dismissResidentWellnessFollowUp,
} from "@/lib/data/wellnessFollowUps";
import { WellnessFollowUpType, WellnessNotePriority } from "@/lib/supabase/types";

const VALID_FOLLOW_UP_TYPES: readonly WellnessFollowUpType[] = [
  "reassessment",
  "resident_check_in",
  "family_update",
  "safety_review",
  "medication_review",
  "mobility_review",
  "equipment_review",
  "care_coordination",
  "service_review",
  "documentation",
  "other",
];

const VALID_PRIORITIES: readonly WellnessNotePriority[] = [
  "routine",
  "monitor",
  "important",
  "urgent",
];

function isValidFollowUpType(value: string): value is WellnessFollowUpType {
  return (VALID_FOLLOW_UP_TYPES as readonly string[]).includes(value);
}

function isValidPriority(value: string): value is WellnessNotePriority {
  return (VALID_PRIORITIES as readonly string[]).includes(value);
}

// Actor identity is always derived server-side — never accepted from the
// client — so completed_by / dismissed_by / created_by can't be spoofed.
async function currentActorLabel(): Promise<string | null> {
  const profile = await getCurrentAuthorizedUser();
  return profile?.full_name || profile?.email || null;
}

export async function completeWellnessFollowUp(
  followUpId: string,
  residentId: string,
  completionNote?: string
): Promise<{ error?: string }> {
  if (!followUpId || !residentId) {
    return { error: "Missing follow-up." };
  }

  const actor = await currentActorLabel();

  return completeResidentWellnessFollowUp(
    followUpId,
    residentId,
    actor,
    completionNote?.trim() || null
  );
}

export async function dismissWellnessFollowUp(
  followUpId: string,
  residentId: string
): Promise<{ error?: string }> {
  if (!followUpId || !residentId) {
    return { error: "Missing follow-up." };
  }

  const actor = await currentActorLabel();

  return dismissResidentWellnessFollowUp(followUpId, residentId, actor);
}

export interface CreateManualFollowUpFormData {
  residentId: string;
  title: string;
  description?: string;
  followUpType: string;
  dueAt?: string;
  assignedTo?: string;
  priority: string;
}

export async function createManualWellnessFollowUp(
  data: CreateManualFollowUpFormData
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  if (!data.title.trim()) {
    return { error: "Enter a title for this follow-up." };
  }

  if (!isValidFollowUpType(data.followUpType)) {
    return { error: "Select a follow-up type." };
  }

  if (!isValidPriority(data.priority)) {
    return { error: "Select a valid priority." };
  }

  let dueAtIso: string | null = null;
  if (data.dueAt) {
    const parsed = new Date(data.dueAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Enter a valid due date." };
    }
    dueAtIso = parsed.toISOString();
  }

  const actor = await currentActorLabel();

  const result = await createManualResidentWellnessFollowUp({
    residentId: data.residentId,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    followUpType: data.followUpType,
    dueAt: dueAtIso,
    assignedTo: data.assignedTo?.trim() || null,
    priority: data.priority,
    createdBy: actor,
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

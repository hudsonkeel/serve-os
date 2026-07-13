"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { createWellnessNote } from "@/lib/data/wellnessNotes";
import {
  CreateWellnessNoteFollowUpInput,
  WellnessFollowUpSuggestedBy,
  WellnessFollowUpType,
  WellnessNotePriority,
  WellnessSignalType,
} from "@/lib/supabase/types";

const VALID_SIGNAL_TYPES: readonly WellnessSignalType[] = [
  "general_wellness",
  "mobility",
  "fall_risk",
  "injury",
  "pain",
  "medication",
  "nutrition_hydration",
  "cognition",
  "mood_behavior",
  "sleep",
  "personal_care",
  "continence",
  "sensory_change",
  "hospital_rehab",
  "surgery_procedure",
  "return_from_rehab",
  "change_in_service_need",
  "environment_safety",
  "bathroom_safety",
  "equipment",
  "home_modification",
  "accessibility",
  "social_engagement",
  "isolation",
  "family_update",
  "resident_preference",
  "care_resistance",
  "missed_task",
  "caregiver_concern",
  "follow_up_needed",
  "other",
];

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

function isWellnessSignalType(value: string): value is WellnessSignalType {
  return (VALID_SIGNAL_TYPES as readonly string[]).includes(value);
}

function isValidFollowUpType(value: string): value is WellnessFollowUpType {
  return (VALID_FOLLOW_UP_TYPES as readonly string[]).includes(value);
}

function isValidPriority(value: string): value is WellnessNotePriority {
  return (VALID_PRIORITIES as readonly string[]).includes(value);
}

export interface AcceptedFollowUpFormData {
  ruleId: string | null;
  title: string;
  description?: string;
  followUpType: string;
  dueDate?: string;
  assignedTo?: string;
  priority: string;
}

export interface AddWellnessNoteFormData {
  residentId: string;
  observedAt: string;
  signalTypes: string[];
  observation: string;
  context?: string;
  actionTaken?: string;
  priority: WellnessNotePriority;
  acceptedFollowUps?: AcceptedFollowUpFormData[];
}

export async function addWellnessNote(
  data: AddWellnessNoteFormData
): Promise<{ error?: string }> {
  if (!data.residentId) {
    return { error: "Missing resident." };
  }

  if (!data.observation.trim()) {
    return { error: "Describe what was observed." };
  }

  const uniqueSignals = Array.from(new Set(data.signalTypes));

  if (uniqueSignals.length === 0) {
    return { error: "Select at least one wellness signal." };
  }

  const hasInvalidSignal = uniqueSignals.some(
    (signal) => !isWellnessSignalType(signal)
  );
  if (hasInvalidSignal) {
    return { error: "One or more selected signals are not recognized." };
  }

  let observedAtIso: string | undefined;
  if (data.observedAt) {
    const parsed = new Date(data.observedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Enter a valid observed date and time." };
    }
    observedAtIso = parsed.toISOString();
  }

  const acceptedFollowUps = data.acceptedFollowUps ?? [];
  const followUpInputs: CreateWellnessNoteFollowUpInput[] = [];

  for (const followUp of acceptedFollowUps) {
    if (!followUp.title.trim()) {
      return { error: "Every accepted follow-up needs a title." };
    }

    if (!isValidFollowUpType(followUp.followUpType)) {
      return { error: "One or more follow-ups have an unrecognized type." };
    }

    if (!isValidPriority(followUp.priority)) {
      return { error: "One or more follow-ups have an invalid priority." };
    }

    let dueAtIso: string | null = null;
    if (followUp.dueDate) {
      const parsedDue = new Date(followUp.dueDate);
      if (Number.isNaN(parsedDue.getTime())) {
        return { error: `Enter a valid due date for "${followUp.title.trim()}".` };
      }
      dueAtIso = parsedDue.toISOString();
    }

    const suggestedBy: WellnessFollowUpSuggestedBy = followUp.ruleId
      ? "rule_engine"
      : "manual";

    followUpInputs.push({
      title: followUp.title.trim(),
      description: followUp.description?.trim() || null,
      follow_up_type: followUp.followUpType,
      due_at: dueAtIso,
      assigned_to: followUp.assignedTo?.trim() || null,
      priority: followUp.priority,
      suggested_by: suggestedBy,
      suggestion_rule_id: followUp.ruleId,
    });
  }

  // The observation's own follow_up_required/follow_up_date fields are a
  // rollup derived from the accepted follow-ups, not separate manual input —
  // the Follow-Up layer is now the source of truth for "what should happen
  // next". If none of the accepted follow-ups have a due date, the rollup
  // stays false/null rather than violating the "required implies dated"
  // constraint on resident_wellness_notes.
  const dueDates = followUpInputs
    .map((f) => f.due_at)
    .filter((due): due is string => Boolean(due))
    .sort();
  const earliestDueAt = dueDates[0] ?? null;
  const observationFollowUpRequired = followUpInputs.length > 0 && earliestDueAt !== null;

  // entered_by / created_by are derived from the signed-in staff session
  // rather than a free-text form field, so provenance can't be mistyped or
  // spoofed.
  const profile = await getCurrentAuthorizedUser();
  const actorLabel = profile?.full_name || profile?.email || null;

  const result = await createWellnessNote({
    resident_id: data.residentId,
    observed_at: observedAtIso,
    observation: data.observation.trim(),
    context: data.context?.trim() || null,
    action_taken: data.actionTaken?.trim() || null,
    priority: data.priority,
    follow_up_required: observationFollowUpRequired,
    follow_up_date: observationFollowUpRequired ? earliestDueAt!.slice(0, 10) : null,
    source_system: "serve_os",
    entered_by: actorLabel,
    signal_types: uniqueSignals as WellnessSignalType[],
    follow_ups: followUpInputs.map((f) => ({ ...f, created_by: actorLabel })),
  });

  if (result.error) {
    return { error: result.error };
  }

  return {};
}

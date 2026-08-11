// Cinch-ready operational projection — maps approved assessment facts into Cinch's known
// General / Client Status / Environment care-plan structure (not an invented schema). This is
// always a candidate projection pending human approval; there is no Cinch write integration
// anywhere in this codebase to claim success from, so this module never claims a push
// succeeded — it only produces content for an assessment_outputs row with
// output_type='cinch_projection', status='draft'. Cinch itself only ever receives Community
// Care clients through the existing AxisCare/Cinch operating relationship — never a direct
// write from here. See docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §8.

import type { AssertionState } from "./factTypes.ts";

export interface ApprovedFactForProjection {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
  evidence: string | null;
}

export interface CinchProjection {
  general: {
    goalsOfService: string | null;
    visitSchedule: string | null;
    precautions: string | null;
    functionalLimitations: string | null;
  };
  clientStatus: {
    adlsIadls: Record<string, unknown>;
    medicationReminders: unknown;
    allergies: unknown;
    sensory: Record<string, unknown>;
  };
  environment: {
    equipment: Record<string, unknown>;
    environmentalSafetyConcerns: string | null;
  };
  insightsForCareTeam: string[];
}

function factValue(facts: ApprovedFactForProjection[], fieldPath: string): unknown {
  const fact = facts.find((f) => f.fieldPath === fieldPath && f.assertionState !== "uncertain" && f.assertionState !== "conflicting");
  return fact ? fact.value : null;
}

function joinFreeText(facts: ApprovedFactForProjection[], fieldPaths: string[]): string | null {
  const parts = fieldPaths.map((fp) => factValue(facts, fp)).filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.length ? parts.join("; ") : null;
}

export function buildCinchProjection(facts: ApprovedFactForProjection[]): CinchProjection {
  const adlFields = [
    "daily_life.bathing",
    "daily_life.dressing",
    "daily_life.grooming",
    "daily_life.toileting",
    "daily_life.continence",
    "daily_life.transfers",
    "daily_life.meals_nutrition",
  ];
  const equipmentFields = ["mobility_safety.walker", "mobility_safety.cane", "mobility_safety.wheelchair", "mobility_safety.shower_equipment"];
  const sensoryFields = ["vision_hearing.glasses", "vision_hearing.hearing_aids", "vision_hearing.hearing_difficulty", "vision_hearing.visual_impairment"];

  const adlsIadls: Record<string, unknown> = {};
  for (const fp of adlFields) {
    const v = factValue(facts, fp);
    if (v !== null) adlsIadls[fp] = v;
  }

  const equipment: Record<string, unknown> = {};
  for (const fp of equipmentFields) {
    const v = factValue(facts, fp);
    if (v !== null) equipment[fp] = v;
  }

  const sensory: Record<string, unknown> = {};
  for (const fp of sensoryFields) {
    const v = factValue(facts, fp);
    if (v !== null) sensory[fp] = v;
  }

  const insightsForCareTeam = facts
    .filter(
      (f) =>
        (f.fieldPath.startsWith("serve_relationship_intelligence.") || f.fieldPath === "what_why.acceptance_of_care") &&
        f.evidence
    )
    .map((f) => f.evidence as string);

  return {
    general: {
      goalsOfService: joinFreeText(facts, ["what_why.primary_goals"]),
      visitSchedule: joinFreeText(facts, ["when.frequency", "when.duration"]),
      precautions: joinFreeText(facts, ["mobility_safety.recent_falls", "mobility_safety.environmental_concerns"]),
      functionalLimitations: joinFreeText(facts, ["mobility_safety.gait_steadiness"]),
    },
    clientStatus: {
      adlsIadls,
      medicationReminders: factValue(facts, "daily_life.medication_reminders"),
      allergies: factValue(facts, "health.allergies"),
      sensory,
    },
    environment: {
      equipment,
      environmentalSafetyConcerns: joinFreeText(facts, ["mobility_safety.environmental_concerns"]),
    },
    insightsForCareTeam,
  };
}

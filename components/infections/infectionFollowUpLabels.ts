// Human-readable labels for the Infection Follow-Up timeline's structured
// vocabularies — kept in the component layer, matching
// incidentLabels.ts/correctiveActionLabels.ts's own convention. The
// vocabularies themselves are DB-enforced CHECK constraints (see
// 20260913000000_add_infection_follow_up_lifecycle.sql); this file only
// decides how each value reads.
import type {
  InfectionFollowUpInformationSource,
  InfectionFollowUpPurpose,
  InfectionFollowUpReportedStatus,
  InfectionFollowUpServiceImpact,
} from "@/lib/supabase/types";

export const REPORTED_STATUS_LABELS: Record<InfectionFollowUpReportedStatus, string> = {
  improving: "Improving",
  unchanged: "Unchanged",
  worsening: "Worsening",
  resolved_per_report: "Reported as resolved",
  new_symptoms_reported: "New symptoms reported",
  treatment_completed: "Treatment reported completed",
  treatment_ongoing: "Treatment ongoing",
  hospitalized: "Hospitalized",
  seen_by_provider: "Seen by healthcare provider",
  other: "Other",
};

export const SERVICE_IMPACT_LABELS: Record<InfectionFollowUpServiceImpact, string> = {
  no_impact: "No impact on services",
  reduced_participation: "Reduced participation",
  missed_services: "Missed services",
  schedule_adjusted: "Schedule adjusted",
  temporary_service_pause: "Temporary service pause",
  increased_monitoring_requested: "Increased monitoring requested",
  other: "Other",
};

export const INFORMATION_SOURCE_LABELS: Record<InfectionFollowUpInformationSource, string> = {
  client: "Client",
  family_responsible_party: "Family / responsible party",
  caregiver_observation: "Caregiver observation",
  hospital_facility: "Hospital / facility",
  healthcare_provider: "Healthcare provider",
  other: "Other",
};

// Final Migration Tightening — PAS-operational phrasing, not
// clinical/diagnostic language.
export const NEXT_FOLLOW_UP_PURPOSE_LABELS: Record<InfectionFollowUpPurpose, string> = {
  check_client_service_status: "Check client/service status",
  hospital_er_follow_up: "Hospital / ER follow-up",
  confirm_updated_instructions: "Confirm updated instructions",
  assess_service_impact: "Assess service impact",
  infection_control_follow_up: "Infection-control follow-up",
  other: "Other",
};

// Seeded, editable-in-spirit chips for the open serve_response label array
// — the same "suggested, not enforced" convention as
// incidents.parties_notified's own free-text UI. Never DB-constrained (see
// the migration header), so this list can grow without a migration.
export const SERVE_RESPONSE_SUGGESTIONS: readonly string[] = [
  "PPE provided/confirmed",
  "Caregiver precautions communicated",
  "Caregiver instruction/training",
  "Scheduling/assignment reviewed",
  "Subsequent-client transition considered",
  "Family/client communication",
  "Provider/appropriate-party communication",
  "Service plan/instructions reviewed",
  "Escalation for guidance",
  "Other",
];

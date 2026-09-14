// Human-readable labels/tones for the infection register's derived
// operational state — mirrors components/incidents/operationalStateLabels.ts's
// own convention exactly. The states themselves are computed by
// lib/compliance/infectionOperationalState.ts; this file only decides how
// each one reads and looks.
import type { InfectionOperationalState } from "@/lib/compliance/infectionOperationalState";
import type { BadgeTone } from "@/components/ui/Badge";

export const OPERATIONAL_STATE_LABELS: Record<InfectionOperationalState, string> = {
  needs_review: "Needs Review",
  follow_up_needed: "Follow-Up Needed",
  follow_up_due: "Follow-Up Due",
  follow_up_scheduled: "Follow-Up Scheduled",
  corrective_action_incomplete: "Corrective Action Incomplete",
  ready_to_resolve: "Ready to Resolve",
  resolved: "Resolved",
};

export const OPERATIONAL_STATE_TONES: Record<InfectionOperationalState, BadgeTone> = {
  needs_review: "warning",
  follow_up_needed: "danger",
  follow_up_due: "warning",
  follow_up_scheduled: "blue",
  corrective_action_incomplete: "warning",
  ready_to_resolve: "gold",
  resolved: "success",
};

export const OPERATIONAL_STATE_ORDER: readonly InfectionOperationalState[] = [
  "needs_review",
  "follow_up_needed",
  "follow_up_due",
  "follow_up_scheduled",
  "corrective_action_incomplete",
  "ready_to_resolve",
  "resolved",
];

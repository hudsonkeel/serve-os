// Human-readable labels/tones for the incident register's derived
// operational state — deliberately kept in the component layer, matching
// incidentLabels.ts / correctiveActionLabels.ts's own convention. The
// states themselves are computed by lib/compliance/incidentOperationalState.ts;
// this file only decides how each one reads and looks.
import type { IncidentOperationalState } from "@/lib/compliance/incidentOperationalState";
import type { BadgeTone } from "@/components/ui/Badge";

export const OPERATIONAL_STATE_LABELS: Record<IncidentOperationalState, string> = {
  needs_review: "Needs Review",
  action_required: "Action Required",
  follow_up_pending: "Follow-Up Pending",
  effectiveness_due: "Effectiveness Due",
  ready_to_resolve: "Ready to Resolve",
  resolved: "Resolved",
};

export const OPERATIONAL_STATE_TONES: Record<IncidentOperationalState, BadgeTone> = {
  needs_review: "warning",
  action_required: "danger",
  follow_up_pending: "blue",
  effectiveness_due: "warning",
  ready_to_resolve: "gold",
  resolved: "success",
};

export const OPERATIONAL_STATE_ORDER: readonly IncidentOperationalState[] = [
  "needs_review",
  "action_required",
  "follow_up_pending",
  "effectiveness_due",
  "ready_to_resolve",
  "resolved",
];

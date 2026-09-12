// Human-readable labels/tones for corrective-action lifecycle UI —
// deliberately kept in the component layer, matching incidentLabels.ts's
// own convention. Domain-agnostic: compliance_corrective_actions.lifecycle_stage
// isn't incident-specific, so this lives in components/compliance/ rather
// than components/incidents/ — any QAPI domain sourcing rows into that
// table (Infection Lifecycle v0.1 and beyond) reuses this unchanged.
import type { ComplianceCorrectiveActionLifecycleStage } from "@/lib/supabase/types";
import type { BadgeTone } from "@/components/ui/Badge";

export const LIFECYCLE_STAGE_LABELS: Record<ComplianceCorrectiveActionLifecycleStage, string> = {
  open: "Open",
  implemented: "Implemented",
  verified_effective: "Verified Effective",
  cancelled: "Cancelled",
};

export const LIFECYCLE_STAGE_TONES: Record<ComplianceCorrectiveActionLifecycleStage, BadgeTone> = {
  open: "warning",
  implemented: "blue",
  verified_effective: "success",
  cancelled: "neutral",
};

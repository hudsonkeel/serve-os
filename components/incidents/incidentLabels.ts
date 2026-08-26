// Human-readable labels for the Incident UI — deliberately kept in the
// component layer, not lib/data or lib/supabase/types.ts. These are display
// labels for an operational organization category list only; they carry no
// regulatory, clinical, or reportability meaning (see the migration header
// at supabase/migrations/20260907000000_create_incidents_and_infections.sql).
// Do not extend this list into a compliance taxonomy.
import type { IncidentType } from "@/lib/supabase/types";

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  fall: "Fall",
  injury: "Injury",
  wandering_elopement: "Wandering / Elopement",
  medication_event: "Medication Event",
  service_failure: "Service Failure",
  safety_event: "Safety Event",
  property_concern: "Property Concern",
  other: "Other",
};

export const INCIDENT_TYPE_OPTIONS: readonly IncidentType[] = [
  "fall",
  "injury",
  "wandering_elopement",
  "medication_event",
  "service_failure",
  "safety_event",
  "property_concern",
  "other",
];

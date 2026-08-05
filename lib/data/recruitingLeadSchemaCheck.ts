// Startup schema preflight for the persisting Apploi candidate-dialog
// collector — see the approved plan's "CORRECTION 1." Run once, before
// anything else in a collection run. On any failure, the caller must write
// nothing, create no collector run, report the exact missing table or
// column, and stop.
import { createServerClient } from "../supabase/server.ts";

export const REQUIRED_TABLES: readonly { table: string; columns: readonly string[] }[] = [
  {
    table: "recruiting_lead_observations",
    columns: [
      "id",
      "recruiting_lead_id",
      "observation_key",
      "raw_label",
      "normalized_value",
      "visibility",
      "observed_at",
      "source_system",
      "source_record_id",
      "collected_at",
      "source_location",
      "extractor_version",
      "extraction_confidence",
      "match_method",
      "failure_reason",
      "sensitivity",
      "collection_method",
    ],
  },
  {
    table: "recruiting_lead_collector_runs",
    columns: ["id", "recruiting_lead_id", "source_system", "status", "match_status", "flight_marker"],
  },
  { table: "recruiting_lead_rules", columns: ["id", "slug"] },
  { table: "recruiting_lead_rule_versions", columns: ["id", "rule_id", "version"] },
  { table: "recruiting_lead_inferences", columns: ["id", "recruiting_lead_id", "rule_version_id", "signal_key"] },
  { table: "recruiting_lead_inference_evidence", columns: ["inference_id", "observation_id"] },
  {
    table: "recruiting_lead_vendor_identities",
    columns: [
      "id",
      "recruiting_lead_id",
      "source_system",
      "vendor_record_id",
      "vendor_display_name",
      "match_method",
      "match_confidence",
      "is_human_confirmed",
      "linked_by",
    ],
  },
  {
    table: "recruiting_lead_desired_state_evaluations",
    columns: ["id", "recruiting_lead_id", "desired_state_key", "rule_version_id", "status", "gaps", "unknown_evidence", "explanation"],
  },
  {
    table: "recruiting_lead_desired_state_evaluation_evidence",
    columns: ["evaluation_id", "observation_id"],
  },
  {
    table: "workforce_members",
    columns: ["id", "source_recruiting_lead_id", "created_at", "created_by"],
  },
];

export interface SchemaCheckResult {
  readonly ok: boolean;
  readonly missing: string | null; // exact table/column that failed, when ok === false
}

export async function verifyRequiredSchema(): Promise<SchemaCheckResult> {
  const supabase = createServerClient();

  for (const { table, columns } of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select(columns.join(",")).limit(1);
    if (error) {
      return { ok: false, missing: `${table}: ${error.message}` };
    }
  }

  return { ok: true, missing: null };
}

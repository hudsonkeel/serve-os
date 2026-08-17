// Data access for axiscare_client_canonical_sync_runs
// (supabase/migrations/20260902140000_create_axiscare_client_canonical_sync_runs.sql
// — NOT YET APPLIED as of this writing). Every function here degrades
// gracefully (logs, never throws) if the table doesn't exist yet, so the
// actual sync work (the part that matters) never depends on this
// migration having been applied — matches the defensive
// to_regclass(...) is not null pattern already used for optional tables
// in perform_resident_consolidation().
import { createServerClient } from "../supabase/server.ts";

export type SyncRunStatus = "in_progress" | "success" | "failed" | "partial";
export type SyncRunTrigger = "manual" | "scheduled" | "identity_confirmation";

export interface AxisCareClientSyncRun {
  id: string;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  started_at: string;
  completed_at: string | null;
  residents_attempted: number;
  residents_succeeded: number;
  residents_conflicted: number;
  residents_failed: number;
  residents_skipped: number;
  errors: unknown[];
  initiated_by: string;
}

export async function startAxisCareClientSyncRun(trigger: SyncRunTrigger, initiatedBy: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_canonical_sync_runs")
    .insert({ trigger, initiated_by: initiatedBy })
    .select("id")
    .single();

  if (error) {
    console.error("[axiscareClientSyncRuns:start]", { message: error.message });
    return null;
  }
  return data.id as string;
}

export async function completeAxisCareClientSyncRun(
  runId: string,
  result: {
    residentsAttempted: number;
    residentsSucceeded: number;
    residentsConflicted: number;
    residentsFailed: number;
    residentsSkipped: number;
    errors: { residentId: string; message: string }[];
  }
): Promise<void> {
  const supabase = createServerClient();
  const status: SyncRunStatus = result.residentsFailed > 0 ? (result.residentsSucceeded > 0 ? "partial" : "failed") : "success";

  const { error } = await supabase
    .from("axiscare_client_canonical_sync_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      residents_attempted: result.residentsAttempted,
      residents_succeeded: result.residentsSucceeded,
      residents_conflicted: result.residentsConflicted,
      residents_failed: result.residentsFailed,
      residents_skipped: result.residentsSkipped,
      errors: result.errors,
    })
    .eq("id", runId);

  if (error) console.error("[axiscareClientSyncRuns:complete]", { runId, message: error.message });
}

export async function getLatestAxisCareClientSyncRun(): Promise<AxisCareClientSyncRun | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_canonical_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[axiscareClientSyncRuns:getLatest]", { message: error.message });
    return null;
  }
  return (data as AxisCareClientSyncRun | null) ?? null;
}

export async function getLatestSuccessfulAxisCareClientSyncRun(): Promise<AxisCareClientSyncRun | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_canonical_sync_runs")
    .select("*")
    .in("status", ["success", "partial"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[axiscareClientSyncRuns:getLatestSuccessful]", { message: error.message });
    return null;
  }
  return (data as AxisCareClientSyncRun | null) ?? null;
}

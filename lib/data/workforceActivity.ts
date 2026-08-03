// Data layer for the workforce-domain-scoped activity timeline — mirrors
// lib/data/residentTimeline.ts / relationship timeline reads. Every row
// requires a real workforce_member_id; person-specific events only. See
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql
// and lib/workforce/axiscareCaregiverSync.ts for which events get written
// where (sync-run-level reporting stays in workforce_axiscare_sync_runs).
import { createServerClient } from "../supabase/server.ts";
import type { WorkforceActivityEvent, WorkforceActivityEventType } from "../supabase/types.ts";

export async function getWorkforceActivity(workforceMemberId: string): Promise<WorkforceActivityEvent[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_activity")
    .select("*")
    .eq("workforce_member_id", workforceMemberId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getWorkforceActivity]", { workforceMemberId, message: error.message });
    return [];
  }

  return (data as WorkforceActivityEvent[] | null) ?? [];
}

export async function recordWorkforceActivity(input: {
  workforceMemberId: string;
  eventType: WorkforceActivityEventType;
  eventTitle: string;
  eventDescription?: string | null;
  source: string;
  systemGenerated?: boolean;
  createdBy?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.from("workforce_activity").insert({
    workforce_member_id: input.workforceMemberId,
    event_type: input.eventType,
    event_title: input.eventTitle,
    event_description: input.eventDescription ?? null,
    source: input.source,
    system_generated: input.systemGenerated ?? true,
    created_by: input.createdBy ?? null,
  });

  if (error) {
    return { error: `Could not record workforce activity: ${error.message}` };
  }
  return {};
}

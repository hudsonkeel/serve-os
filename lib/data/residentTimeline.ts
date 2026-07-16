import { createServerClient } from "@/lib/supabase/server";
import {
  ResidentTimelineEvent,
  ResidentTimelineEventType,
} from "@/lib/supabase/types";

const SELECT_COLUMNS =
  "id, resident_id, event_type, event_title, event_description, source, created_at, created_by, system_generated";

interface ResidentTimelineEventRow {
  id: string;
  resident_id: string;
  event_type: ResidentTimelineEventType;
  event_title: string;
  event_description: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
  system_generated: boolean;
}

function toResidentTimelineEvent(
  row: ResidentTimelineEventRow
): ResidentTimelineEvent {
  return {
    id: row.id,
    residentId: row.resident_id,
    eventType: row.event_type,
    eventTitle: row.event_title,
    eventDescription: row.event_description,
    source: row.source,
    createdAt: row.created_at,
    createdBy: row.created_by,
    systemGenerated: row.system_generated,
  };
}

const DEFAULT_LIMIT = 25;

export async function getResidentTimeline(
  residentId: string,
  limit: number = DEFAULT_LIMIT
): Promise<ResidentTimelineEvent[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_timeline")
    .select(SELECT_COLUMNS)
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[residentTimeline:getResidentTimeline:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return ((data as ResidentTimelineEventRow[] | null) ?? []).map(
    toResidentTimelineEvent
  );
}

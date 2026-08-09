import { createServerClient } from "@/lib/supabase/server";
import { getCentralDayBoundaryUtc } from "@/lib/utils/date";
import {
  ResidentWellnessFollowUp,
  WellnessFollowUpType,
  WellnessNotePriority,
} from "@/lib/supabase/types";

export interface OpenWellnessFollowUp extends ResidentWellnessFollowUp {
  isOverdue: boolean;
}

const PRIORITY_URGENCY_RANK: Record<WellnessNotePriority, number> = {
  urgent: 0,
  important: 1,
  monitor: 2,
  routine: 3,
};

// Recommended ordering: overdue, then urgent > important > monitor > routine,
// then due date ascending, then undated last.
function sortOpenFollowUps(
  followUps: OpenWellnessFollowUp[]
): OpenWellnessFollowUp[] {
  return [...followUps].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;

    const priorityDelta =
      PRIORITY_URGENCY_RANK[a.priority] - PRIORITY_URGENCY_RANK[b.priority];
    if (priorityDelta !== 0) return priorityDelta;

    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1;
    if (b.due_at) return 1;
    return 0;
  });
}

export async function getResidentWellnessFollowUps(
  residentId: string
): Promise<ResidentWellnessFollowUp[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("*")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[wellnessFollowUps:getResidentWellnessFollowUps:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return data ?? [];
}

export async function getOpenResidentWellnessFollowUps(
  residentId: string
): Promise<OpenWellnessFollowUp[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("*")
    .eq("resident_id", residentId)
    .in("status", ["open", "in_progress"]);

  if (error) {
    console.error(
      "[wellnessFollowUps:getOpenResidentWellnessFollowUps:error]",
      {
        residentId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return [];
  }

  const now = Date.now();
  const withOverdue: OpenWellnessFollowUp[] = (data ?? []).map((row) => ({
    ...row,
    isOverdue: row.due_at !== null && new Date(row.due_at).getTime() < now,
  }));

  return sortOpenFollowUps(withOverdue);
}

// Keyed by wellness_notes.id — used to render a lightweight "N follow-ups
// created" indicator on the observation timeline without embedding full
// follow-up records inside every card. No FK exists from source_id back to
// resident_wellness_notes (by design — source_id is polymorphic), so this is
// a manual grouping rather than a PostgREST embed.
export async function getFollowUpCountsByObservation(
  residentId: string
): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("source_id")
    .eq("resident_id", residentId)
    .eq("source_type", "wellness_observation");

  if (error) {
    console.error(
      "[wellnessFollowUps:getFollowUpCountsByObservation:error]",
      {
        residentId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.source_id) continue;
    counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }

  return counts;
}

export interface WellnessWatchSummary {
  openCount: number;
  nearestDueAt: string | null;
  hasOverdue: boolean;
  highestPriority: WellnessNotePriority;
}

const PRIORITY_SEVERITY_RANK: Record<WellnessNotePriority, number> = {
  routine: 0,
  monitor: 1,
  important: 2,
  urgent: 3,
};

// Wellness Watch is deliberately NOT a stored resident flag — it is derived
// here, in one bulk query, from active (open/in_progress) follow-up rows
// across the whole roster. A resident enters Wellness Watch by having at
// least one such row and leaves automatically the moment none remain; there
// is no separate "enter/exit" bookkeeping to keep in sync.
interface WellnessWatchQueryRow {
  resident_id: string;
  due_at: string | null;
  priority: WellnessNotePriority;
}

export async function getWellnessWatchSummaryByResident(): Promise<
  Map<string, WellnessWatchSummary>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("resident_id, due_at, priority")
    .in("status", ["open", "in_progress"])
    .overrideTypes<WellnessWatchQueryRow[]>();

  if (error) {
    console.error("[wellnessFollowUps:getWellnessWatchSummaryByResident:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return new Map();
  }

  const now = Date.now();
  const summaries = new Map<string, WellnessWatchSummary>();

  for (const row of data ?? []) {
    const isOverdue = row.due_at !== null && new Date(row.due_at).getTime() < now;
    const existing = summaries.get(row.resident_id);

    if (!existing) {
      summaries.set(row.resident_id, {
        openCount: 1,
        nearestDueAt: row.due_at,
        hasOverdue: isOverdue,
        highestPriority: row.priority,
      });
      continue;
    }

    existing.openCount += 1;
    existing.hasOverdue = existing.hasOverdue || isOverdue;
    if (row.due_at && (!existing.nearestDueAt || row.due_at < existing.nearestDueAt)) {
      existing.nearestDueAt = row.due_at;
    }
    if (
      PRIORITY_SEVERITY_RANK[row.priority] >
      PRIORITY_SEVERITY_RANK[existing.highestPriority]
    ) {
      existing.highestPriority = row.priority;
    }
  }

  return summaries;
}

export interface WellnessFollowUpDashboardCounts {
  dueOrOverdue: number;
  dueThisWeek: number;
}

// Due/Overdue: status open/in_progress, has a due date, due_at <= end of
// today (Central). Due This Week: same statuses, due_at strictly after end
// of today (Central) through end of the 7th following day (Central). The
// two buckets are mutually exclusive by construction (if/else if), so a
// follow-up can never be counted in both.
export async function getWellnessFollowUpDashboardCounts(): Promise<WellnessFollowUpDashboardCounts> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("due_at")
    .in("status", ["open", "in_progress"])
    .not("due_at", "is", null);

  if (error) {
    console.error("[wellnessFollowUps:getWellnessFollowUpDashboardCounts:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { dueOrOverdue: 0, dueThisWeek: 0 };
  }

  const endOfTodayCentral = getCentralDayBoundaryUtc(0).getTime();
  const endOfWeekCentral = getCentralDayBoundaryUtc(7).getTime();

  let dueOrOverdue = 0;
  let dueThisWeek = 0;

  for (const row of data ?? []) {
    if (!row.due_at) continue;
    const dueAtMs = new Date(row.due_at).getTime();

    if (dueAtMs < endOfTodayCentral) {
      dueOrOverdue += 1;
    } else if (dueAtMs < endOfWeekCentral) {
      dueThisWeek += 1;
    }
  }

  return { dueOrOverdue, dueThisWeek };
}

function residentDisplayName(row: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  full_name: string | null;
}): string {
  const fromParts = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return fromParts || row.display_name || row.full_name || "Unnamed Resident";
}

// App-wide list of individual open/in_progress follow-ups (not a summary —
// see getWellnessWatchSummaryByResident() above for the per-resident
// summary Map). This is the one genuinely new bulk query Today's Work
// needed: every existing bulk function here returns counts or a summary,
// never the individual rows. Two bulk queries (follow-ups, residents)
// rather than N+1 — same shape as
// lib/data/relationships.ts#getRelationshipWorkspaceRows()'s resident-name
// join.
export interface OpenWellnessFollowUpWithResident extends ResidentWellnessFollowUp {
  residentDisplayName: string;
}

export async function getAllOpenWellnessFollowUps(): Promise<OpenWellnessFollowUpWithResident[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("*")
    .in("status", ["open", "in_progress"]);

  if (error) {
    console.error("[wellnessFollowUps:getAllOpenWellnessFollowUps:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  const rows = data ?? [];
  const residentIds = [...new Set(rows.map((r) => r.resident_id))];
  const residentNames = new Map<string, string>();

  if (residentIds.length > 0) {
    const { data: residentRows, error: residentError } = await supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name")
      .in("id", residentIds);

    if (residentError) {
      console.error("[wellnessFollowUps:getAllOpenWellnessFollowUps:residents:error]", {
        message: residentError.message,
        code: residentError.code,
      });
    } else {
      for (const row of residentRows ?? []) {
        residentNames.set(row.id, residentDisplayName(row));
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    residentDisplayName: residentNames.get(row.resident_id) ?? "Unnamed Resident",
  }));
}

export interface RecentlyCompletedWellnessFollowUp {
  id: string;
  residentId: string;
  residentDisplayName: string;
  title: string;
  completedAt: string;
  completedBy: string | null;
}

// Exact mirror of lib/data/relationships.ts#getRecentlyCompletedActions()'s
// shape/signature/day-window/limit convention, for Recently Completed
// parity across both task-bearing sources.
export async function getRecentlyCompletedWellnessFollowUps(
  days = 7,
  limit = 25
): Promise<RecentlyCompletedWellnessFollowUp[]> {
  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("id, resident_id, title, completed_at, completed_by")
    .eq("status", "completed")
    .gte("completed_at", cutoff)
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[wellnessFollowUps:getRecentlyCompletedWellnessFollowUps:error]", {
      message: error.message,
      code: error.code,
    });
    return [];
  }

  const rows = data ?? [];
  const residentIds = [...new Set(rows.map((r) => r.resident_id))];
  const residentNames = new Map<string, string>();

  if (residentIds.length > 0) {
    const { data: residentRows, error: residentError } = await supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name")
      .in("id", residentIds);

    if (residentError) {
      console.error("[wellnessFollowUps:getRecentlyCompletedWellnessFollowUps:residents:error]", {
        message: residentError.message,
        code: residentError.code,
      });
    } else {
      for (const row of residentRows ?? []) {
        residentNames.set(row.id, residentDisplayName(row));
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    residentId: row.resident_id,
    residentDisplayName: residentNames.get(row.resident_id) ?? "Unnamed Resident",
    title: row.title,
    completedAt: row.completed_at as string,
    completedBy: row.completed_by,
  }));
}

export async function completeResidentWellnessFollowUp(
  followUpId: string,
  residentId: string,
  completedBy: string | null,
  completionNote: string | null
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
      completion_note: completionNote,
    })
    .eq("id", followUpId)
    .eq("resident_id", residentId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      "[wellnessFollowUps:completeResidentWellnessFollowUp:error]",
      {
        followUpId,
        residentId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return { error: "Could not complete follow-up." };
  }

  if (!data) {
    return { error: "Follow-up not found for this resident." };
  }

  return {};
}

export async function dismissResidentWellnessFollowUp(
  followUpId: string,
  residentId: string,
  dismissedBy: string | null
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
      dismissed_by: dismissedBy,
    })
    .eq("id", followUpId)
    .eq("resident_id", residentId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      "[wellnessFollowUps:dismissResidentWellnessFollowUp:error]",
      {
        followUpId,
        residentId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return { error: "Could not dismiss follow-up." };
  }

  if (!data) {
    return { error: "Follow-up not found for this resident." };
  }

  return {};
}

export interface UpdateFollowUpInput {
  followUpId: string;
  residentId: string;
  title: string;
  description: string | null;
  followUpType: WellnessFollowUpType;
  dueAt: string | null;
  assignedTo: string | null;
  priority: WellnessNotePriority;
  actor: string;
}

// Diffs the six editable fields against the current row, writes one audit
// row per changed field, updates the follow-up, and logs a Timeline event
// — all in one transaction via update_resident_wellness_follow_up() (see
// 20260716050000_add_wellness_follow_up_editing.sql). A save with no
// actual changes writes nothing at all.
export async function updateResidentWellnessFollowUp(
  input: UpdateFollowUpInput
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("update_resident_wellness_follow_up", {
    p_follow_up_id: input.followUpId,
    p_resident_id: input.residentId,
    p_title: input.title,
    p_description: input.description,
    p_follow_up_type: input.followUpType,
    p_due_at: input.dueAt,
    p_assigned_to: input.assignedTo,
    p_priority: input.priority,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[wellnessFollowUps:updateResidentWellnessFollowUp:error]", {
      followUpId: input.followUpId,
      residentId: input.residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save changes to this follow-up." };
  }

  return {};
}

export interface CreateManualFollowUpInput {
  residentId: string;
  title: string;
  description: string | null;
  followUpType: WellnessFollowUpType;
  dueAt: string | null;
  assignedTo: string | null;
  priority: WellnessNotePriority;
  createdBy: string | null;
}

export async function createManualResidentWellnessFollowUp(
  input: CreateManualFollowUpInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .insert({
      resident_id: input.residentId,
      source_type: "manual",
      source_id: null,
      title: input.title,
      description: input.description,
      follow_up_type: input.followUpType,
      due_at: input.dueAt,
      assigned_to: input.assignedTo,
      priority: input.priority,
      status: "open",
      suggested_by: "manual",
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    console.error(
      "[wellnessFollowUps:createManualResidentWellnessFollowUp:error]",
      {
        residentId: input.residentId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return { error: "Could not create follow-up." };
  }

  return { id: data?.id };
}

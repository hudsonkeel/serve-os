import { createServerClient } from "@/lib/supabase/server";
import {
  PipelineStage,
  Relationship,
  RelationshipAction,
  RelationshipActionType,
  RelationshipPriority,
  RelationshipTimelineEvent,
  RelationshipTouch,
  RelationshipTouchType,
  RelationshipType,
  RelationshipWorkingNote,
  RelationshipWorkingNoteCategory,
} from "@/lib/supabase/types";
import { RelationshipWorkspaceRow } from "@/lib/relationships/search";

function residentDisplayName(row: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  full_name: string | null;
}): string {
  const fromParts = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return fromParts || row.display_name || row.full_name || "Unnamed Resident";
}

// ─── Reads ─────────────────────────────────────────────────────────────

export async function getResidentDisplayNameById(residentId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("first_name, last_name, display_name, full_name")
    .eq("id", residentId)
    .maybeSingle();

  if (error || !data) return null;
  return residentDisplayName(data);
}

export async function getRelationshipById(id: string): Promise<Relationship | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("*")
    .eq("id", id)
    .maybeSingle<Relationship>();

  if (error) {
    console.error("[relationships:getRelationshipById:error]", {
      id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  return data;
}

// One row per relationship for the workspace table, with the linked
// resident's display name and the nearest open action's due date merged
// in. Two extra bulk queries (residents, open actions) rather than N+1 —
// same shape as getPreferredNamesByResident()/getFollowUpCountsByObservation.
export async function getRelationshipWorkspaceRows(): Promise<RelationshipWorkspaceRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipWorkspaceRows:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  const relationships = (data as Relationship[] | null) ?? [];
  const residentIds = [...new Set(relationships.map((r) => r.resident_id).filter((id): id is string => !!id))];

  const residentNames = new Map<string, string>();
  if (residentIds.length > 0) {
    const { data: residentRows, error: residentError } = await supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name")
      .in("id", residentIds);

    if (residentError) {
      console.error("[relationships:getRelationshipWorkspaceRows:residents:error]", {
        message: residentError.message,
        code: residentError.code,
      });
    } else {
      for (const row of residentRows ?? []) {
        residentNames.set(row.id, residentDisplayName(row));
      }
    }
  }

  return relationships.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    relationshipType: r.relationship_type,
    stage: r.stage,
    status: r.status,
    residentId: r.resident_id,
    residentName: r.resident_id ? residentNames.get(r.resident_id) ?? null : null,
    ownerLabel: r.owner_label,
    primaryContactName: r.primary_contact_name,
    primaryContactPhone: r.primary_contact_phone,
    primaryContactEmail: r.primary_contact_email,
    organizationName: r.organization_name,
    communityName: r.community_name,
  }));
}

// Nearest (soonest-due) open action per relationship, for the workspace
// table's "Next Action"/"Due" columns and the daily attention derivation.
// A relationship with no open action is simply absent from the returned
// map — callers distinguish "no open action" from "open action, no due
// date" the same way lib/relationships/attention.ts expects
// (nearestOpenActionDueAt undefined vs. null).
export interface NearestOpenAction {
  id: string;
  title: string;
  dueAt: string | null;
}

export async function getNearestOpenActionByRelationship(): Promise<
  Map<string, NearestOpenAction>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_actions")
    .select("id, relationship_id, title, due_at")
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[relationships:getNearestOpenActionByRelationship:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const result = new Map<string, NearestOpenAction>();
  for (const row of data ?? []) {
    if (result.has(row.relationship_id)) continue;
    result.set(row.relationship_id, { id: row.id, title: row.title, dueAt: row.due_at });
  }
  return result;
}

export async function getRelationshipTimeline(
  relationshipId: string,
  limit = 50
): Promise<RelationshipTimelineEvent[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_timeline")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[relationships:getRelationshipTimeline:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipTimelineEvent[] | null) ?? [];
}

export async function getRelationshipTouches(
  relationshipId: string,
  limit = 20
): Promise<RelationshipTouch[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_touches")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[relationships:getRelationshipTouches:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipTouch[] | null) ?? [];
}

export async function getRelationshipActions(
  relationshipId: string
): Promise<RelationshipAction[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_actions")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipActions:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipAction[] | null) ?? [];
}

export async function getRelationshipWorkingNotes(
  relationshipId: string
): Promise<RelationshipWorkingNote[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_working_notes")
    .select("*")
    .eq("relationship_id", relationshipId)
    .in("status", ["open", "resolved"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipWorkingNotes:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipWorkingNote[] | null) ?? [];
}

// For the "Start Relationship" action on the resident detail page — shows
// what (if any) Relationship records already exist for this resident, so
// staff don't accidentally create a duplicate for the same engagement.
// Multiple relationships per resident are legitimate (see
// docs/design/RELATIONSHIPS.md) and never blocked by this — it's purely
// informational.
export async function getRelationshipsByResident(
  residentId: string
): Promise<Relationship[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("*")
    .eq("resident_id", residentId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipsByResident:error]", {
      residentId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as Relationship[] | null) ?? [];
}

// Thin resident-picker search for "Link Existing Resident" — deliberately
// not a reuse of lib/residents/search.ts's matchesSearch(), which expects
// the fully-hydrated CommunityResidentRecord shape from
// getCommunityMetrics() (heavier than a simple picker needs). Matches the
// same field set for consistency: first/last/preferred/display/full name,
// unit number.
export interface ResidentSearchResult {
  id: string;
  name: string;
  unitNumber: string | null;
}

export async function searchResidentsForLinking(
  query: string,
  limit = 10
): Promise<ResidentSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, display_name, full_name, unit_number")
    .or(
      `first_name.ilike.%${normalized}%,last_name.ilike.%${normalized}%,display_name.ilike.%${normalized}%,full_name.ilike.%${normalized}%,unit_number.ilike.%${normalized}%`
    )
    .limit(limit);

  if (error) {
    console.error("[relationships:searchResidentsForLinking:error]", {
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: residentDisplayName(row),
    unitNumber: row.unit_number,
  }));
}

// ─── Writes (all via atomic RPCs — see supabase/migrations/20260717*.sql) ──

export interface CreateRelationshipInput {
  relationshipType: RelationshipType;
  stage: PipelineStage;
  displayName: string;
  residentId: string | null;
  prospectId: string | null;
  communityName: string | null;
  organizationName: string | null;
  primaryContactName: string | null;
  primaryContactRelationship: string | null;
  primaryContactPhone: string | null;
  primaryContactEmail: string | null;
  prospectiveResidentName: string | null;
  summary: string | null;
  ownerLabel: string | null;
  priority: RelationshipPriority;
  sourceType: string | null;
  sourceLabel: string | null;
  actor: string;
}

export async function createRelationship(
  input: CreateRelationshipInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_relationship", {
    p_relationship_type: input.relationshipType,
    p_stage: input.stage,
    p_display_name: input.displayName,
    p_resident_id: input.residentId,
    p_prospect_id: input.prospectId,
    p_community_name: input.communityName,
    p_organization_name: input.organizationName,
    p_primary_contact_name: input.primaryContactName,
    p_primary_contact_relationship: input.primaryContactRelationship,
    p_primary_contact_phone: input.primaryContactPhone,
    p_primary_contact_email: input.primaryContactEmail,
    p_prospective_resident_name: input.prospectiveResidentName,
    p_summary: input.summary,
    p_owner_label: input.ownerLabel,
    p_priority: input.priority,
    p_source_type: input.sourceType,
    p_source_label: input.sourceLabel,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[relationships:createRelationship:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not create relationship." };
  }

  return { id: data as string };
}

export async function changeRelationshipStage(
  relationshipId: string,
  toStage: PipelineStage,
  changeReason: string | null,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("change_relationship_stage", {
    p_relationship_id: relationshipId,
    p_to_stage: toStage,
    p_change_reason: changeReason,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:changeRelationshipStage:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not change relationship stage." };
  }

  return {};
}

export async function linkRelationshipToResident(
  relationshipId: string,
  residentId: string,
  actor: string,
  force: boolean
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("link_relationship_to_resident", {
    p_relationship_id: relationshipId,
    p_resident_id: residentId,
    p_actor: actor,
    p_force: force,
  });

  if (error) {
    if (error.message?.includes("RELATIONSHIP_ALREADY_LINKED")) {
      return { error: "ALREADY_LINKED" };
    }
    console.error("[relationships:linkRelationshipToResident:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not link this relationship to a resident." };
  }

  return {};
}

export interface LogTouchInput {
  relationshipId: string;
  touchType: RelationshipTouchType;
  occurredAt: string | null;
  summary: string;
  outcome: string | null;
  contactName: string | null;
  actor: string;
}

export async function logRelationshipTouch(
  input: LogTouchInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("log_relationship_touch", {
    p_relationship_id: input.relationshipId,
    p_touch_type: input.touchType,
    p_occurred_at: input.occurredAt,
    p_summary: input.summary,
    p_outcome: input.outcome,
    p_contact_name: input.contactName,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[relationships:logRelationshipTouch:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not log this touch." };
  }

  return { id: data as string };
}

export interface CreateActionInput {
  relationshipId: string;
  actionType: RelationshipActionType;
  title: string;
  description: string | null;
  dueAt: string | null;
  assignedTo: string | null;
  priority: RelationshipPriority;
  actor: string;
}

export async function createRelationshipAction(
  input: CreateActionInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_relationship_action", {
    p_relationship_id: input.relationshipId,
    p_action_type: input.actionType,
    p_title: input.title,
    p_description: input.description,
    p_due_at: input.dueAt,
    p_assigned_to: input.assignedTo,
    p_priority: input.priority,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[relationships:createRelationshipAction:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not create action." };
  }

  return { id: data as string };
}

export interface UpdateActionInput {
  actionId: string;
  relationshipId: string;
  title: string;
  description: string | null;
  actionType: RelationshipActionType;
  dueAt: string | null;
  assignedTo: string | null;
  priority: RelationshipPriority;
  actor: string;
}

export async function updateRelationshipAction(
  input: UpdateActionInput
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("update_relationship_action", {
    p_action_id: input.actionId,
    p_relationship_id: input.relationshipId,
    p_title: input.title,
    p_description: input.description,
    p_action_type: input.actionType,
    p_due_at: input.dueAt,
    p_assigned_to: input.assignedTo,
    p_priority: input.priority,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[relationships:updateRelationshipAction:error]", {
      actionId: input.actionId,
      message: error.message,
      code: error.code,
    });
    return {
      error: "We couldn't save changes to this action. Your changes are still here — please try again.",
    };
  }

  return {};
}

export async function completeRelationshipAction(
  actionId: string,
  relationshipId: string,
  completionOutcome: string | null,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("complete_relationship_action", {
    p_action_id: actionId,
    p_relationship_id: relationshipId,
    p_completion_outcome: completionOutcome,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:completeRelationshipAction:error]", {
      actionId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not complete action." };
  }

  return {};
}

export async function dismissRelationshipAction(
  actionId: string,
  relationshipId: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("dismiss_relationship_action", {
    p_action_id: actionId,
    p_relationship_id: relationshipId,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:dismissRelationshipAction:error]", {
      actionId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not dismiss action." };
  }

  return {};
}

export async function createRelationshipWorkingNote(
  relationshipId: string,
  content: string,
  category: RelationshipWorkingNoteCategory | null,
  actor: string
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_relationship_working_note", {
    p_relationship_id: relationshipId,
    p_content: content,
    p_category: category,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:createRelationshipWorkingNote:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not save working note." };
  }

  return { id: data as string };
}

export async function resolveRelationshipWorkingNote(
  workingNoteId: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_relationship_working_note", {
    p_working_note_id: workingNoteId,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:resolveRelationshipWorkingNote:error]", {
      workingNoteId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not resolve working note." };
  }

  return {};
}

export async function archiveRelationshipWorkingNote(
  workingNoteId: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("archive_relationship_working_note", {
    p_working_note_id: workingNoteId,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:archiveRelationshipWorkingNote:error]", {
      workingNoteId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not archive working note." };
  }

  return {};
}

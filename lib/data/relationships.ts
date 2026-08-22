import { createServerClient } from "../supabase/server.ts";
import type {
  PipelineStage,
  Relationship,
  RelationshipAction,
  RelationshipActionType,
  RelationshipCommitment,
  RelationshipInsight,
  RelationshipInteractionParticipant,
  RelationshipInteractionResult,
  RelationshipInteractionSuggestion,
  RelationshipOpenLoop,
  RelationshipPriority,
  RelationshipServiceLocation,
  RelationshipServiceOpportunity,
  RelationshipStatus,
  RelationshipTimelineEvent,
  RelationshipTouch,
  RelationshipTouchType,
  RelationshipType,
  RelationshipWorkingNote,
  RelationshipWorkingNoteCategory,
  ResidenceType,
} from "../supabase/types.ts";
import type { RelationshipWorkspaceRow } from "../relationships/search.ts";
import { selectPrimaryOpenAction } from "../relationships/sorting.ts";
import type { CommunityQueryFilter } from "../auth/communityScope.ts";

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

// Dashboard-level count: every non-closed Resident Prospect or External
// Prospect Relationship. Prospect status belongs exclusively to
// Relationships (see docs/design/RELATIONSHIPS.md) — this is the one
// authoritative "active prospects" count in the app; nothing derives it
// from a resident-level classification anymore.
export async function getActiveProspectRelationshipCount(): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("relationships")
    .select("*", { count: "exact", head: true })
    .in("relationship_type", ["resident_prospect", "external_prospect"])
    .neq("status", "closed");

  if (error) {
    console.error("[relationships:getActiveProspectRelationshipCount:error]", {
      message: error.message,
      code: error.code,
    });
    return 0;
  }

  return count ?? 0;
}

export interface RelationshipPipelineCounts {
  // Newly arrived, not yet contacted — the Relationship-based replacement
  // for the legacy prospects.status in ('new', 'reviewing') Dashboard
  // metric (Scope J, Production Intake Unification).
  requiresFollowUp: number;
  pendingAssessments: number;
  familiesAwaitingProposal: number;
}

// Dashboard pipeline counts, sourced entirely from relationships.stage —
// the canonical replacement for the legacy prospects-table metrics in
// lib/data/communityMetrics.ts#buildMetrics(). See docs/integrations/
// WEBSITE_TO_SERVE_INTAKE_CONTRACT.md and docs/decisions for why prospects
// no longer backs the Dashboard.
export async function getRelationshipPipelineCounts(): Promise<RelationshipPipelineCounts> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("stage")
    .eq("status", "active");

  if (error) {
    console.error("[relationships:getRelationshipPipelineCounts:error]", {
      message: error.message,
      code: error.code,
    });
    return { requiresFollowUp: 0, pendingAssessments: 0, familiesAwaitingProposal: 0 };
  }

  const stages = (data ?? []).map((row) => row.stage as string);

  return {
    requiresFollowUp: stages.filter((stage) => ["new_inquiry", "contact_attempted"].includes(stage)).length,
    pendingAssessments: stages.filter((stage) => stage === "assessment_scheduled").length,
    familiesAwaitingProposal: stages.filter((stage) => ["proposal_in_progress", "proposal_sent"].includes(stage))
      .length,
  };
}

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
    priority: r.priority,
    prospectiveResidentName: r.prospective_resident_name,
    prospectiveClientName:
      [r.prospective_client_first_name, r.prospective_client_last_name].filter(Boolean).join(" ") || null,
    primaryContactName: r.primary_contact_name,
    primaryContactPhone: r.primary_contact_phone,
    primaryContactEmail: r.primary_contact_email,
    organizationName: r.organization_name,
    communityName: r.community_name,
    lastMeaningfulTouchAt: r.last_meaningful_touch_at,
    updatedAt: r.updated_at,
  }));
}

// Primary (see lib/relationships/sorting.ts#selectPrimaryOpenAction) open
// action per relationship, for the workspace/board/whiteboard "Next
// Action"/"Due" columns and the daily attention derivation. A relationship
// with no open action is simply absent from the returned map — callers
// distinguish "no open action" from "open action, no due date" the same
// way lib/relationships/attention.ts expects (nearestOpenActionDueAt
// undefined vs. null). Fetches every open action (not just one per
// relationship via SQL LIMIT) so the pure, unit-tested selector — not
// incidental Postgres row order — decides ties when a relationship has
// more than one open action.
// Carries every field the Action Board's inline edit form needs (the same
// fields RelationshipActionsList's detail-page ActionCard edits), not just
// title/dueAt — so the board can edit its primary action without a trip to
// the detail page.
export interface NearestOpenAction {
  id: string;
  title: string;
  description: string | null;
  actionType: RelationshipActionType;
  dueAt: string | null;
  assignedTo: string | null;
  priority: RelationshipPriority;
  createdAt: string;
}

export async function getNearestOpenActionByRelationship(): Promise<
  Map<string, NearestOpenAction>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_actions")
    .select("id, relationship_id, title, description, action_type, due_at, assigned_to, priority, created_at")
    .eq("status", "open");

  if (error) {
    console.error("[relationships:getNearestOpenActionByRelationship:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const byRelationship = new Map<string, NearestOpenAction[]>();
  for (const row of data ?? []) {
    const list = byRelationship.get(row.relationship_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      description: row.description,
      actionType: row.action_type,
      dueAt: row.due_at,
      assignedTo: row.assigned_to,
      priority: row.priority,
      createdAt: row.created_at,
    });
    byRelationship.set(row.relationship_id, list);
  }

  const result = new Map<string, NearestOpenAction>();
  for (const [relationshipId, actions] of byRelationship) {
    const primary = selectPrimaryOpenAction(actions);
    if (primary) result.set(relationshipId, primary);
  }
  return result;
}

// Active (open) Working Note preview per relationship, for the Whiteboard's
// "Active Note" column — the single most recent open note, or none. One
// bulk query (order by created_at desc, first-match-wins reduction) rather
// than one query per relationship, same batching principle as
// getRelationshipWorkspaceRows()'s resident-name lookup.
export interface ActiveNotePreview {
  id: string;
  content: string;
  category: RelationshipWorkingNoteCategory | null;
}

export async function getActiveNotePreviewByRelationship(): Promise<
  Map<string, ActiveNotePreview>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_working_notes")
    .select("id, relationship_id, content, category")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relationships:getActiveNotePreviewByRelationship:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const result = new Map<string, ActiveNotePreview>();
  for (const row of data ?? []) {
    if (result.has(row.relationship_id)) continue;
    result.set(row.relationship_id, { id: row.id, content: row.content, category: row.category });
  }
  return result;
}

// One Service Opportunity row per relationship (unique relationship_id —
// see 20260718010000_create_relationship_service_opportunities.sql), for
// the Whiteboard's "Service Opportunity" column.
export async function getServiceOpportunityByRelationship(): Promise<
  Map<string, RelationshipServiceOpportunity>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("relationship_service_opportunities").select("*");

  if (error) {
    console.error("[relationships:getServiceOpportunityByRelationship:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const result = new Map<string, RelationshipServiceOpportunity>();
  for (const row of (data as RelationshipServiceOpportunity[] | null) ?? []) {
    result.set(row.relationship_id, row);
  }
  return result;
}

export async function getServiceOpportunityByRelationshipId(
  relationshipId: string
): Promise<RelationshipServiceOpportunity | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_service_opportunities")
    .select("*")
    .eq("relationship_id", relationshipId)
    .maybeSingle<RelationshipServiceOpportunity>();

  if (error) {
    console.error("[relationships:getServiceOpportunityByRelationshipId:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data;
}

// The current (is_current = true) expected service location for a single
// Relationship — the editable, pre-conversion proposed address. See
// docs/design/RELATIONSHIPS.md, "External Prospect domain model."
export async function getCurrentServiceLocationByRelationshipId(
  relationshipId: string
): Promise<RelationshipServiceLocation | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_service_locations")
    .select("*")
    .eq("relationship_id", relationshipId)
    .eq("is_current", true)
    .maybeSingle<RelationshipServiceLocation>();

  if (error) {
    console.error("[relationships:getCurrentServiceLocationByRelationshipId:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data;
}

// Bulk map of every Relationship's current service location, for the
// External Clients → Prospects workspace display (Part 20 of the
// External Prospect domain-model scope) — one query, never one per row.
export async function getCurrentServiceLocationsByRelationship(): Promise<
  Map<string, RelationshipServiceLocation>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_service_locations")
    .select("*")
    .eq("is_current", true);

  if (error) {
    console.error("[relationships:getCurrentServiceLocationsByRelationship:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const result = new Map<string, RelationshipServiceLocation>();
  for (const row of (data as RelationshipServiceLocation[] | null) ?? []) {
    result.set(row.relationship_id, row);
  }
  return result;
}

// Relationship Actions completed within the last `days` days, most
// recently completed first — the Action Board's "Recently Completed"
// section (Part 7). Deliberately excludes dismissed actions (Part 7:
// "Do not mix dismissed actions into Recently Completed").
export interface RecentlyCompletedAction {
  id: string;
  relationshipId: string;
  title: string;
  completedAt: string;
  completedBy: string | null;
  completionOutcome: string | null;
}

export async function getRecentlyCompletedActions(
  days = 7,
  limit = 25
): Promise<RecentlyCompletedAction[]> {
  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("relationship_actions")
    .select("id, relationship_id, title, completed_at, completed_by, completion_outcome")
    .eq("status", "completed")
    .gte("completed_at", cutoff)
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[relationships:getRecentlyCompletedActions:error]", {
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    relationshipId: row.relationship_id,
    title: row.title,
    completedAt: row.completed_at as string,
    completedBy: row.completed_by,
    completionOutcome: row.completion_outcome,
  }));
}

// Assembled once, shared by the Action Board and Whiteboard (Part 17: "Avoid
// one query per Relationship" and "avoid... duplicate queries between the
// two pages") — four bulk queries total, run in parallel, merged in memory.
// Neither page fetches relationships/actions/notes/service-opportunities
// separately; each just picks the fields it displays from this one row set.
export interface RelationshipBoardRow extends RelationshipWorkspaceRow {
  nearestAction: NearestOpenAction | null;
  activeNote: ActiveNotePreview | null;
  serviceOpportunity: RelationshipServiceOpportunity | null;
}

export async function getRelationshipBoardRows(): Promise<RelationshipBoardRow[]> {
  const [rows, nearestActions, activeNotes, serviceOpportunities] = await Promise.all([
    getRelationshipWorkspaceRows(),
    getNearestOpenActionByRelationship(),
    getActiveNotePreviewByRelationship(),
    getServiceOpportunityByRelationship(),
  ]);

  return rows.map((row) => ({
    ...row,
    nearestAction: nearestActions.get(row.id) ?? null,
    activeNote: activeNotes.get(row.id) ?? null,
    serviceOpportunity: serviceOpportunities.get(row.id) ?? null,
  }));
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

// Bulk equivalent of getRelationshipsByResident(), for the Residents
// directory (Part 14 of the prospect-consolidation scope): every
// non-closed, resident-linked Relationship, grouped by resident_id, plus
// each one's nearest open action — two bulk queries total, never one per
// resident. Rows arrive from Postgres already ordered by updated_at desc,
// so each resident's array is already "most recently updated first" —
// callers that want just the single most operationally relevant
// Relationship for a resident can take index 0 without an extra sort.
export interface ResidentRelationshipSummary {
  id: string;
  displayName: string;
  relationshipType: RelationshipType;
  stage: PipelineStage;
  status: RelationshipStatus;
  updatedAt: string;
  nearestActionTitle: string | null;
  nearestActionDueAt: string | null;
}

export async function getActiveRelationshipSummariesByResident(): Promise<
  Map<string, ResidentRelationshipSummary[]>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("id, resident_id, display_name, relationship_type, stage, status, updated_at")
    .not("resident_id", "is", null)
    .neq("status", "closed")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[relationships:getActiveRelationshipSummariesByResident:error]", {
      message: error.message,
      code: error.code,
    });
    return new Map();
  }

  const nearestActions = await getNearestOpenActionByRelationship();

  const result = new Map<string, ResidentRelationshipSummary[]>();
  for (const row of data ?? []) {
    if (!row.resident_id) continue;
    const nearest = nearestActions.get(row.id);
    const list = result.get(row.resident_id) ?? [];
    list.push({
      id: row.id,
      displayName: row.display_name,
      relationshipType: row.relationship_type,
      stage: row.stage,
      status: row.status,
      updatedAt: row.updated_at,
      nearestActionTitle: nearest?.title ?? null,
      nearestActionDueAt: nearest?.dueAt ?? null,
    });
    result.set(row.resident_id, list);
  }
  return result;
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
  // Populated only when the search itself spans multiple communities
  // (an all_communities-scoped search) — where two matches could
  // otherwise be indistinguishable. Null for a single-community search,
  // where every result is already unambiguous.
  communityName: string | null;
}

// Phase E/F completion, section 4: SQL-scoped by the caller's authorized
// community filter, never a fetch-then-filter. "none" (unassigned scope)
// short-circuits before any query runs — an unassigned user must not
// silently search every community.
export async function searchResidentsForLinking(
  query: string,
  filter: CommunityQueryFilter,
  limit = 10
): Promise<ResidentSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  if (filter.mode === "none") return [];

  const supabase = createServerClient();
  let dbQuery = supabase
    .from("residents")
    .select("id, first_name, last_name, display_name, full_name, unit_number, community_name")
    .or(
      `first_name.ilike.%${normalized}%,last_name.ilike.%${normalized}%,display_name.ilike.%${normalized}%,full_name.ilike.%${normalized}%,unit_number.ilike.%${normalized}%`
    );
  if (filter.mode === "single") {
    dbQuery = dbQuery.eq("community_id", filter.communityId);
  }
  const { data, error } = await dbQuery.limit(limit);

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
    communityName: filter.mode === "all" ? row.community_name : null,
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
  // Structured External Prospect identity (see docs/design/RELATIONSHIPS.md,
  // "External Prospect domain model") — optional for every other
  // relationship type.
  prospectiveClientFirstName?: string | null;
  prospectiveClientLastName?: string | null;
  prospectiveClientPreferredName?: string | null;
  prospectiveClientPhone?: string | null;
  prospectiveClientEmail?: string | null;
  primaryContactIsProspectiveClient?: boolean;
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
    p_prospective_client_first_name: input.prospectiveClientFirstName ?? null,
    p_prospective_client_last_name: input.prospectiveClientLastName ?? null,
    p_prospective_client_preferred_name: input.prospectiveClientPreferredName ?? null,
    p_prospective_client_phone: input.prospectiveClientPhone ?? null,
    p_prospective_client_email: input.prospectiveClientEmail ?? null,
    p_primary_contact_is_prospective_client: input.primaryContactIsProspectiveClient ?? false,
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

export async function updateRelationshipOwnerAndPriority(
  relationshipId: string,
  ownerLabel: string | null,
  priority: RelationshipPriority,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("update_relationship_owner_and_priority", {
    p_relationship_id: relationshipId,
    p_owner_label: ownerLabel,
    p_priority: priority,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:updateRelationshipOwnerAndPriority:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not update this relationship." };
  }

  return {};
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

// Plain scoped update, not a new RPC — community_id is additive (Phase B)
// and this is the one place a relationship's canonical community gets set
// after creation/linking. Deliberately outside create_relationship's RPC
// signature (unchanged, avoiding another DDL migration for this phase)
// and never called to silently overwrite an existing, differing value —
// see lib/relationships/communityIntegrity.ts, the only caller.
export async function setRelationshipCommunityId(
  relationshipId: string,
  communityId: string | null
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from("relationships").update({ community_id: communityId }).eq("id", relationshipId);

  if (error) {
    console.error("[relationships:setRelationshipCommunityId:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not set this relationship's community." };
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

export interface UpsertServiceOpportunityInput {
  relationshipId: string;
  serviceSummary: string | null;
  visitsPerWeek: number | null;
  preferredDays: string | null;
  preferredTimeWindows: string | null;
  estimatedVisitMinutes: number | null;
  anticipatedStartDate: string | null;
  serviceLocationSummary: string | null;
  status: string | null;
  actor: string;
}

export async function upsertRelationshipServiceOpportunity(
  input: UpsertServiceOpportunityInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("upsert_relationship_service_opportunity", {
    p_relationship_id: input.relationshipId,
    p_service_summary: input.serviceSummary,
    p_visits_per_week: input.visitsPerWeek,
    p_preferred_days: input.preferredDays,
    p_preferred_time_windows: input.preferredTimeWindows,
    p_estimated_visit_minutes: input.estimatedVisitMinutes,
    p_anticipated_start_date: input.anticipatedStartDate,
    p_service_location_summary: input.serviceLocationSummary,
    p_status: input.status,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[relationships:upsertRelationshipServiceOpportunity:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not save this service opportunity." };
  }

  return { id: data as string };
}

export interface UpsertServiceLocationInput {
  relationshipId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  residenceType: ResidenceType | null;
  facilityName: string | null;
  locationNotes: string | null;
  actor: string;
}

export async function upsertRelationshipServiceLocation(
  input: UpsertServiceLocationInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("upsert_relationship_service_location", {
    p_relationship_id: input.relationshipId,
    p_address_line_1: input.addressLine1,
    p_address_line_2: input.addressLine2,
    p_city: input.city,
    p_state: input.state,
    p_postal_code: input.postalCode,
    p_residence_type: input.residenceType,
    p_facility_name: input.facilityName,
    p_location_notes: input.locationNotes,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[relationships:upsertRelationshipServiceLocation:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not save this service location." };
  }

  return { id: data as string };
}

export interface CreateWorkingNoteExtras {
  relevantUntil?: string | null;
  residentId?: string | null;
  contactName?: string | null;
  sourceDescription?: string | null;
}

export async function createRelationshipWorkingNote(
  relationshipId: string,
  content: string,
  category: RelationshipWorkingNoteCategory | null,
  actor: string,
  extras: CreateWorkingNoteExtras = {},
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_relationship_working_note", {
    p_relationship_id: relationshipId,
    p_content: content,
    p_category: category,
    p_actor: actor,
    p_relevant_until: extras.relevantUntil ?? null,
    p_resident_id: extras.residentId ?? null,
    p_contact_name: extras.contactName ?? null,
    p_source_description: extras.sourceDescription ?? null,
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

// ─── Relationship Intelligence Phase 1 ──────────────────────────────────
// See docs/architecture/relationship-intelligence-phase-1-implementation.md
// and docs/architecture/decisions/0003-interaction-extends-touch.md. All
// writes go through log_relationship_interaction() (atomic) or the
// single-purpose resolve_* RPCs — this file never writes to
// relationship_insights/relationship_commitments/relationship_open_loops
// directly.

export async function getRelationshipInsights(relationshipId: string): Promise<RelationshipInsight[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_insights")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipInsights:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipInsight[] | null) ?? [];
}

export async function getRelationshipCommitments(relationshipId: string): Promise<RelationshipCommitment[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_commitments")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipCommitments:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipCommitment[] | null) ?? [];
}

export async function getRelationshipOpenLoops(relationshipId: string): Promise<RelationshipOpenLoop[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_open_loops")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[relationships:getRelationshipOpenLoops:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipOpenLoop[] | null) ?? [];
}

export interface LogInteractionInsightInput {
  content: string;
  category: string;
  whyItMatters: string | null;
  relevantUntil: string | null;
  residentId: string | null;
}

export interface LogInteractionCommitmentInput {
  description: string;
  responsiblePartyType: string;
  responsiblePartyReference: string | null;
  expectedDate: string | null;
}

export interface LogInteractionOpenLoopInput {
  question: string;
  owner: string | null;
  targetResolutionDate: string | null;
}

export interface LogInteractionNextActionInput {
  title: string;
  actionType: string;
  dueAt: string | null;
  assignedTo: string | null;
  priority: string;
  description: string | null;
}

export interface LogInteractionInput {
  relationshipId: string;
  touchType: RelationshipTouchType;
  occurredAt: string | null;
  summary: string;
  interactionResult: RelationshipInteractionResult | null;
  outcome: string | null;
  contactName: string | null;
  participants: RelationshipInteractionParticipant[];
  insights: LogInteractionInsightInput[];
  commitments: LogInteractionCommitmentInput[];
  openLoops: LogInteractionOpenLoopInput[];
  nextAction: LogInteractionNextActionInput | null;
  actor: string;
  testMarker?: string | null;
  // Client-generated, one per Log Interaction form session — lets a
  // retried/double-clicked submission return the original Interaction
  // instead of duplicating it and its child records.
  idempotencyKey?: string | null;
}

// Atomic — a partial submission never leaves an Interaction recorded
// without its explicitly-submitted accountability records. See
// log_relationship_interaction() in
// supabase/migrations/20260725000000_create_relationship_interaction_intelligence.sql.
export async function logRelationshipInteraction(
  input: LogInteractionInput,
): Promise<{ interaction?: RelationshipTouch; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("log_relationship_interaction", {
    p_relationship_id: input.relationshipId,
    p_touch_type: input.touchType,
    p_occurred_at: input.occurredAt,
    p_summary: input.summary,
    p_interaction_result: input.interactionResult,
    p_outcome: input.outcome,
    p_contact_name: input.contactName,
    p_participants: input.participants,
    p_insights: input.insights.map((i) => ({
      content: i.content,
      category: i.category,
      whyItMatters: i.whyItMatters,
      relevantUntil: i.relevantUntil,
      residentId: i.residentId,
    })),
    p_commitments: input.commitments.map((c) => ({
      description: c.description,
      responsiblePartyType: c.responsiblePartyType,
      responsiblePartyReference: c.responsiblePartyReference,
      expectedDate: c.expectedDate,
    })),
    p_open_loops: input.openLoops.map((o) => ({
      question: o.question,
      owner: o.owner,
      targetResolutionDate: o.targetResolutionDate,
    })),
    p_next_action: input.nextAction
      ? {
          title: input.nextAction.title,
          actionType: input.nextAction.actionType,
          dueAt: input.nextAction.dueAt,
          assignedTo: input.nextAction.assignedTo,
          priority: input.nextAction.priority,
          description: input.nextAction.description,
        }
      : null,
    p_actor: input.actor,
    p_test_marker: input.testMarker ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  if (error) {
    console.error("[relationships:logRelationshipInteraction:error]", {
      relationshipId: input.relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not log this interaction." };
  }

  return { interaction: data as RelationshipTouch };
}

export async function resolveRelationshipInsight(
  insightId: string,
  status: "resolved" | "outdated",
  actor: string,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_relationship_insight", {
    p_insight_id: insightId,
    p_status: status,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:resolveRelationshipInsight:error]", {
      insightId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not update this insight." };
  }

  return {};
}

export async function resolveRelationshipCommitment(
  commitmentId: string,
  status: "completed" | "cancelled",
  closureNote: string | null,
  actor: string,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_relationship_commitment", {
    p_commitment_id: commitmentId,
    p_status: status,
    p_closure_note: closureNote,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:resolveRelationshipCommitment:error]", {
      commitmentId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not update this commitment." };
  }

  return {};
}

export async function resolveRelationshipOpenLoop(
  openLoopId: string,
  status: "resolved" | "no_longer_relevant",
  resolution: string | null,
  actor: string,
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_relationship_open_loop", {
    p_open_loop_id: openLoopId,
    p_status: status,
    p_resolution: resolution,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:resolveRelationshipOpenLoop:error]", {
      openLoopId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not update this open loop." };
  }

  return {};
}

// ─── Interaction Suggestion Review ─────────────────────────────────────
// Deterministically-generated (never AI-fabricated — see
// lib/relationships/suggestionEngine.ts) candidate downstream updates from
// a logged Interaction, reviewed and approved/edited/dismissed one at a
// time before anything is written to a canonical table.

export interface InteractionSuggestionInput {
  suggestionType: string;
  payload: Record<string, unknown>;
  rationale: string;
}

export async function createInteractionSuggestions(
  sourceInteractionId: string,
  relationshipId: string,
  suggestions: readonly InteractionSuggestionInput[],
  actor: string,
): Promise<{ suggestions?: RelationshipInteractionSuggestion[]; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("generate_interaction_suggestions", {
    p_source_interaction_id: sourceInteractionId,
    p_relationship_id: relationshipId,
    p_suggestions: suggestions.map((s) => ({
      suggestionType: s.suggestionType,
      payload: s.payload,
      rationale: s.rationale,
    })),
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:createInteractionSuggestions:error]", {
      sourceInteractionId,
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not generate suggestions for this interaction." };
  }

  return { suggestions: (data as RelationshipInteractionSuggestion[] | null) ?? [] };
}

export async function getInteractionSuggestionsByRelationship(
  relationshipId: string,
): Promise<RelationshipInteractionSuggestion[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("relationship_interaction_suggestions")
    .select("*")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[relationships:getInteractionSuggestionsByRelationship:error]", {
      relationshipId,
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as RelationshipInteractionSuggestion[] | null) ?? [];
}

export async function approveInteractionSuggestion(
  suggestionId: string,
  editedPayload: Record<string, unknown> | null,
  actor: string,
): Promise<{ suggestion?: RelationshipInteractionSuggestion; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("approve_interaction_suggestion", {
    p_suggestion_id: suggestionId,
    p_edited_payload: editedPayload,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:approveInteractionSuggestion:error]", {
      suggestionId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not approve this suggestion." };
  }

  return { suggestion: data as RelationshipInteractionSuggestion };
}

export async function dismissInteractionSuggestion(
  suggestionId: string,
  actor: string,
): Promise<{ suggestion?: RelationshipInteractionSuggestion; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("dismiss_interaction_suggestion", {
    p_suggestion_id: suggestionId,
    p_actor: actor,
  });

  if (error) {
    console.error("[relationships:dismissInteractionSuggestion:error]", {
      suggestionId,
      message: error.message,
      code: error.code,
    });
    return { error: "Could not dismiss this suggestion." };
  }

  return { suggestion: data as RelationshipInteractionSuggestion };
}

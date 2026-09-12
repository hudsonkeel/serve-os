// Data layer for compliance_corrective_actions — corrective actions for
// the domains Audit Readiness is standing up natively (Emergency
// Preparedness, Client File Readiness, cross-domain audit findings). See
// supabase/migrations/20260902030000_create_audit_readiness_platform.sql.
//
// Deliberately excludes workforce_member subjects — workforce findings
// live in workforce_compliance_actions (lib/data/workforceComplianceActions.ts),
// completely untouched by this file. See
// lib/compliance/correctiveActionComposition.ts for how the two are
// presented together without either duplicating the other's logic.
//
// KNOWN GAP (Phase 1A finding, tracked as required pre-August-26
// hardening, not a Phase 2 blocker): unlike person_evidence/
// person_documents' assert_valid_person_subject() trigger, nothing here
// validates that subject_id actually refers to a real row when
// subject_type is 'agency' or 'community' — those two subject types have
// no backing table at all today (they're conceptual singletons, not rows
// anywhere), so there is no sentinel-id convention yet to validate
// against. A typo'd or fabricated subject_id currently creates a silently
// orphaned corrective action. Needs a decision (define an 'agency'/
// 'community' sentinel row or id convention) before this table is relied
// upon for the real Aug 26 drill.
import { createServerClient } from "../supabase/server.ts";
import type {
  ComplianceCorrectiveAction,
  ComplianceCorrectiveActionPriority,
  ComplianceCorrectiveActionSubjectType,
  ComplianceCorrectiveActionType,
  CorrectiveActionEffectivenessReview,
  CorrectiveActionUpdate,
  EffectivenessReviewOutcome,
} from "../supabase/types.ts";

export async function getComplianceCorrectiveActionById(id: string): Promise<ComplianceCorrectiveAction | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("compliance_corrective_actions").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getComplianceCorrectiveActionById]", { id, message: error.message });
    return null;
  }

  return (data as ComplianceCorrectiveAction | null) ?? null;
}

export async function getComplianceCorrectiveActionsByIds(ids: string[]): Promise<ComplianceCorrectiveAction[]> {
  if (ids.length === 0) return [];
  const supabase = createServerClient();

  const { data, error } = await supabase.from("compliance_corrective_actions").select("*").in("id", ids);

  if (error) {
    console.error("[getComplianceCorrectiveActionsByIds]", { message: error.message });
    return [];
  }

  return (data as ComplianceCorrectiveAction[] | null) ?? [];
}

// Incident Corrective Action Lifecycle v0.1 — the incident register list's
// "operational state" view, and Today's Work's bulk source for corrective
// actions grouped by incident. One query for every incident on the page,
// never N+1.
export async function getCorrectiveActionsForIncidents(incidentIds: string[]): Promise<ComplianceCorrectiveAction[]> {
  if (incidentIds.length === 0) return [];
  const supabase = createServerClient();

  const { data, error } = await supabase.from("compliance_corrective_actions").select("*").in("source_incident_id", incidentIds);

  if (error) {
    console.error("[getCorrectiveActionsForIncidents]", { message: error.message });
    return [];
  }

  return (data as ComplianceCorrectiveAction[] | null) ?? [];
}

export async function getEffectivenessReviewsForActions(
  correctiveActionIds: string[]
): Promise<CorrectiveActionEffectivenessReview[]> {
  if (correctiveActionIds.length === 0) return [];
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("corrective_action_effectiveness_reviews")
    .select("*")
    .in("corrective_action_id", correctiveActionIds);

  if (error) {
    console.error("[getEffectivenessReviewsForActions]", { message: error.message });
    return [];
  }

  return (data as CorrectiveActionEffectivenessReview[] | null) ?? [];
}

// Today's Work Actionability slice (Incident Corrective Action Lifecycle
// v0.1) — every effectiveness review still awaiting an outcome. Filtering
// to "the parent action has actually been implemented" (the point at
// which an effectiveness check becomes real, actionable work rather than
// a scheduled-but-premature reminder) happens one layer up in
// lib/data/todaysWork.ts, once the parent actions are joined in bulk —
// this function stays a plain, single-table read.
export async function getPendingEffectivenessReviews(): Promise<CorrectiveActionEffectivenessReview[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("corrective_action_effectiveness_reviews")
    .select("*")
    .is("outcome", null)
    .order("due_at", { ascending: true });

  if (error) {
    console.error("[getPendingEffectivenessReviews]", { message: error.message });
    return [];
  }

  return (data as CorrectiveActionEffectivenessReview[] | null) ?? [];
}

export async function getOpenCorrectiveActionsForSubject(
  subjectType: ComplianceCorrectiveActionSubjectType,
  subjectId: string
): Promise<ComplianceCorrectiveAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_corrective_actions")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("status", "open")
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getOpenCorrectiveActionsForSubject]", { subjectType, subjectId, message: error.message });
    return [];
  }

  return (data as ComplianceCorrectiveAction[] | null) ?? [];
}

// All open actions across every audit-native subject — the Audit Readiness
// dashboard's half of the composed "Open Corrective Actions" view (see
// lib/compliance/correctiveActionComposition.ts for the merge with
// workforce's equivalent).
export async function getAllOpenCorrectiveActions(): Promise<ComplianceCorrectiveAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_corrective_actions")
    .select("*")
    .eq("status", "open")
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getAllOpenCorrectiveActions]", { message: error.message });
    return [];
  }

  return (data as ComplianceCorrectiveAction[] | null) ?? [];
}

// Idempotent upsert-by-issue — mirrors sync_workforce_compliance_action()
// exactly (same never-duplicate-an-open-issue discipline), scoped to the
// polymorphic subject this table serves.
//
// Governance Connective Slice v0.1 — when sourceIncidentId, sourceInfectionId,
// or sourceReviewItemId is supplied, the RPC keys its idempotent lookup off
// that specific source record instead of subject+requirement+action_type
// (which is the correct key only for the non-source-linked case — see
// 20260908000000_add_governance_connective_slice.sql's header for why two
// different source records can otherwise share a resident and action_type).
// Pass at most one; the DB enforces that structurally.
export async function syncCorrectiveAction(input: {
  subjectType: ComplianceCorrectiveActionSubjectType;
  subjectId: string;
  requirementId: string | null;
  domain: string | null;
  actionType: ComplianceCorrectiveActionType;
  title: string;
  reason: string;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
  actor: string;
  sourceIncidentId?: string;
  sourceInfectionId?: string;
  sourceReviewItemId?: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("sync_compliance_corrective_action", {
      p_subject_type: input.subjectType,
      p_subject_id: input.subjectId,
      p_requirement_id: input.requirementId,
      p_domain: input.domain,
      p_action_type: input.actionType,
      p_title: input.title,
      p_reason: input.reason,
      p_priority: input.priority,
      p_due_at: input.dueAt,
      p_actor: input.actor,
      p_source_incident_id: input.sourceIncidentId ?? null,
      p_source_infection_id: input.sourceInfectionId ?? null,
      p_source_review_item_id: input.sourceReviewItemId ?? null,
    })
    .single();

  if (error || !data) {
    return { error: `Could not sync corrective action: ${error?.message}` };
  }

  return { action: data as ComplianceCorrectiveAction };
}

export async function autoResolveCorrectiveActionsForRequirement(
  subjectType: ComplianceCorrectiveActionSubjectType,
  subjectId: string,
  requirementId: string
): Promise<number> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("auto_resolve_compliance_corrective_actions", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_requirement_id: requirementId,
  });

  if (error) {
    console.error("[autoResolveCorrectiveActionsForRequirement]", { subjectType, subjectId, requirementId, message: error.message });
    return 0;
  }

  return (data as number | null) ?? 0;
}

// Incident Corrective Action Lifecycle v0.1 — the incident detail page's
// "how many actions, in what state" view — every action ever linked to the
// incident, open or closed, since one incident can now carry several (the
// old single-open-action-per-incident model, and its .maybeSingle() read,
// no longer apply — see 20260910000000's design decision 5).
export async function getCorrectiveActionsForIncident(incidentId: string): Promise<ComplianceCorrectiveAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_corrective_actions")
    .select("*")
    .eq("source_incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getCorrectiveActionsForIncident]", { incidentId, message: error.message });
    return [];
  }

  return (data as ComplianceCorrectiveAction[] | null) ?? [];
}

// Plain insert (never dedupes by source) — the create path for incident
// corrective actions going forward, replacing syncCorrectiveAction's
// one-open-per-incident upsert for this specific caller. See
// 20260910000000_add_incident_corrective_action_lifecycle.sql.
export async function createIncidentCorrectiveAction(input: {
  incidentId: string;
  subjectType: ComplianceCorrectiveActionSubjectType;
  subjectId: string;
  title: string;
  finding: string;
  actionPlan: string;
  owner: string | null;
  priority: ComplianceCorrectiveActionPriority;
  dueAt: string | null;
  effectivenessReviewRequired: boolean;
  effectivenessReviewDueAt: string | null;
  effectivenessReviewOwner: string | null;
  effectivenessSuccessCriteria: string | null;
  actor: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("create_incident_corrective_action", {
      p_incident_id: input.incidentId,
      p_subject_type: input.subjectType,
      p_subject_id: input.subjectId,
      p_title: input.title,
      p_finding: input.finding,
      p_action_plan: input.actionPlan,
      p_owner: input.owner,
      p_priority: input.priority,
      p_due_at: input.dueAt,
      p_effectiveness_review_required: input.effectivenessReviewRequired,
      p_effectiveness_review_due_at: input.effectivenessReviewDueAt,
      p_effectiveness_review_owner: input.effectivenessReviewOwner,
      p_effectiveness_success_criteria: input.effectivenessSuccessCriteria,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not create corrective action: ${error?.message}` };
  }

  return { action: data as ComplianceCorrectiveAction };
}

export async function markCorrectiveActionImplemented(input: {
  actionId: string;
  actor: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("mark_corrective_action_implemented", { p_action_id: input.actionId, p_actor: input.actor })
    .single();

  if (error || !data) {
    return { error: `Could not mark corrective action implemented: ${error?.message}` };
  }

  return { action: data as ComplianceCorrectiveAction };
}

export async function cancelCorrectiveActionImplementation(input: {
  actionId: string;
  actor: string;
  cancellationNote: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("cancel_corrective_action_implementation", {
      p_action_id: input.actionId,
      p_actor: input.actor,
      p_cancellation_note: input.cancellationNote,
    })
    .single();

  if (error || !data) {
    return { error: `Could not cancel corrective action: ${error?.message}` };
  }

  return { action: data as ComplianceCorrectiveAction };
}

export async function getEffectivenessReviewForAction(
  correctiveActionId: string
): Promise<CorrectiveActionEffectivenessReview | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("corrective_action_effectiveness_reviews")
    .select("*")
    .eq("corrective_action_id", correctiveActionId)
    .maybeSingle();

  if (error) {
    console.error("[getEffectivenessReviewForAction]", { correctiveActionId, message: error.message });
    return null;
  }

  return (data as CorrectiveActionEffectivenessReview | null) ?? null;
}

export async function recordEffectivenessReviewOutcome(input: {
  reviewId: string;
  outcome: EffectivenessReviewOutcome;
  evidence: string;
  actor: string;
}): Promise<{ review?: CorrectiveActionEffectivenessReview; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("record_effectiveness_review_outcome", {
      p_review_id: input.reviewId,
      p_outcome: input.outcome,
      p_evidence: input.evidence,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not record effectiveness review outcome: ${error?.message}` };
  }

  return { review: data as CorrectiveActionEffectivenessReview };
}

// Incident Corrective Action Lifecycle v0.1 — the void-and-reopen
// correction mechanism. Snapshots the erroneous outcome into the voided_*
// columns (immutable history), reopens the review for a genuine future
// determination, reverts the parent action to implemented/open, and
// appends one corrective_action_updates row documenting the correction —
// all in the one RPC transaction. See
// 20260912010000_add_effectiveness_review_void_mechanism.sql.
export async function voidEffectivenessReviewOutcome(input: {
  reviewId: string;
  actor: string;
  voidReason: string;
}): Promise<{ review?: CorrectiveActionEffectivenessReview; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("void_effectiveness_review_outcome", {
      p_review_id: input.reviewId,
      p_actor: input.actor,
      p_void_reason: input.voidReason,
    })
    .single();

  if (error || !data) {
    return { error: `Could not void effectiveness review outcome: ${error?.message}` };
  }

  return { review: data as CorrectiveActionEffectivenessReview };
}

export async function getUpdatesForCorrectiveAction(correctiveActionId: string): Promise<CorrectiveActionUpdate[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("corrective_action_updates")
    .select("*")
    .eq("corrective_action_id", correctiveActionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getUpdatesForCorrectiveAction]", { correctiveActionId, message: error.message });
    return [];
  }

  return (data as CorrectiveActionUpdate[] | null) ?? [];
}

export async function addCorrectiveActionUpdate(input: {
  correctiveActionId: string;
  body: string;
  actor: string;
}): Promise<{ update?: CorrectiveActionUpdate; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("add_corrective_action_update", {
      p_corrective_action_id: input.correctiveActionId,
      p_body: input.body,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not add follow-up update: ${error?.message}` };
  }

  return { update: data as CorrectiveActionUpdate };
}

export async function getOpenCorrectiveActionForInfection(infectionId: string): Promise<ComplianceCorrectiveAction | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_corrective_actions")
    .select("*")
    .eq("source_infection_id", infectionId)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    console.error("[getOpenCorrectiveActionForInfection]", { infectionId, message: error.message });
    return null;
  }

  return (data as ComplianceCorrectiveAction | null) ?? null;
}

export async function resolveCorrectiveAction(input: {
  actionId: string;
  status: "resolved" | "dismissed";
  actor: string;
  resolutionNote: string;
}): Promise<{ action?: ComplianceCorrectiveAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("resolve_compliance_corrective_action", {
      p_action_id: input.actionId,
      p_status: input.status,
      p_actor: input.actor,
      p_resolution_note: input.resolutionNote,
    })
    .single();

  if (error || !data) {
    return { error: `Could not resolve corrective action: ${error?.message}` };
  }

  return { action: data as ComplianceCorrectiveAction };
}

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

// Governance Connective Slice v0.1 — "does this specific Incident/Infection
// already have an open, tracked corrective action?" Used to hide the
// create-corrective-action affordance once one exists (structurally
// backed by compliance_corrective_actions_one_open_per_incident_idx /
// …_per_infection_idx, so this is a UX convenience, not the only guard).
export async function getOpenCorrectiveActionForIncident(incidentId: string): Promise<ComplianceCorrectiveAction | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("compliance_corrective_actions")
    .select("*")
    .eq("source_incident_id", incidentId)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    console.error("[getOpenCorrectiveActionForIncident]", { incidentId, message: error.message });
    return null;
  }

  return (data as ComplianceCorrectiveAction | null) ?? null;
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

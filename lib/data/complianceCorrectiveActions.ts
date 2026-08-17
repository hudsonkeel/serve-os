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

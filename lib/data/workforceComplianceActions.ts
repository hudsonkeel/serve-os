// Data layer for workforce_compliance_actions — the Employee Record
// Audit's operational-work layer. See
// supabase/migrations/20260814000000_add_employee_record_audit.sql.
// Deliberately Workforce-domain-scoped; not a platform-wide action table.
import { createServerClient } from "../supabase/server.ts";
import type {
  WorkforceComplianceAction,
  WorkforceComplianceActionPriority,
  WorkforceComplianceActionType,
} from "../supabase/types.ts";

export async function getOpenComplianceActionsForMember(workforceMemberId: string): Promise<WorkforceComplianceAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_compliance_actions")
    .select("*")
    .eq("workforce_member_id", workforceMemberId)
    .eq("status", "open")
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getOpenComplianceActionsForMember]", { workforceMemberId, message: error.message });
    return [];
  }

  return (data as WorkforceComplianceAction[] | null) ?? [];
}

export async function getResolvedComplianceActionsForMember(workforceMemberId: string): Promise<WorkforceComplianceAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_compliance_actions")
    .select("*")
    .eq("workforce_member_id", workforceMemberId)
    .neq("status", "open")
    .order("resolved_at", { ascending: false });

  if (error) {
    console.error("[getResolvedComplianceActionsForMember]", { workforceMemberId, message: error.message });
    return [];
  }

  return (data as WorkforceComplianceAction[] | null) ?? [];
}

// All open actions, roster-wide — powers the Dashboard's "Open Actions"
// card and the roster's "Next Action"/"Highest Risk" columns without a
// second query per employee.
export async function getAllOpenComplianceActions(): Promise<WorkforceComplianceAction[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("workforce_compliance_actions")
    .select("*")
    .eq("status", "open")
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getAllOpenComplianceActions]", { message: error.message });
    return [];
  }

  return (data as WorkforceComplianceAction[] | null) ?? [];
}

// Idempotent upsert-by-issue — see sync_workforce_compliance_action() in
// the migration. Never creates a second open action for the same
// (member, requirement, action_type); refreshes the existing one in place.
export async function syncComplianceAction(input: {
  workforceMemberId: string;
  requirementId: string;
  actionType: WorkforceComplianceActionType;
  title: string;
  reason: string;
  priority: WorkforceComplianceActionPriority;
  dueAt: string | null;
  actor: string;
}): Promise<{ action?: WorkforceComplianceAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("sync_workforce_compliance_action", {
      p_workforce_member_id: input.workforceMemberId,
      p_requirement_id: input.requirementId,
      p_action_type: input.actionType,
      p_title: input.title,
      p_reason: input.reason,
      p_priority: input.priority,
      p_due_at: input.dueAt,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not sync compliance action: ${error?.message}` };
  }

  return { action: data as WorkforceComplianceAction };
}

// Closes every open action for one (member, requirement) pair — called
// once that requirement re-evaluates as satisfied. Returns how many
// actions were closed (0 is the normal case — most re-evaluations find
// nothing to close).
export async function autoResolveComplianceActionsForRequirement(
  workforceMemberId: string,
  requirementId: string
): Promise<number> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("auto_resolve_workforce_compliance_actions", {
    p_workforce_member_id: workforceMemberId,
    p_requirement_id: requirementId,
  });

  if (error) {
    console.error("[autoResolveComplianceActionsForRequirement]", { workforceMemberId, requirementId, message: error.message });
    return 0;
  }

  return (data as number | null) ?? 0;
}

export async function resolveComplianceAction(input: {
  actionId: string;
  status: "resolved" | "dismissed";
  actor: string;
  resolutionNote: string;
}): Promise<{ action?: WorkforceComplianceAction; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("resolve_workforce_compliance_action", {
      p_action_id: input.actionId,
      p_status: input.status,
      p_actor: input.actor,
      p_resolution_note: input.resolutionNote,
    })
    .single();

  if (error || !data) {
    return { error: `Could not resolve compliance action: ${error?.message}` };
  }

  return { action: data as WorkforceComplianceAction };
}

// Closes every open action for a member outright — used when the member is
// no longer eligible for compliance tracking at all (e.g. termination), so
// stale "missing/expired" work doesn't linger against someone no longer
// working here. System-driven and non-consequential to override, so a
// plain update is used rather than the single-action RPC's ceremony.
export async function closeAllOpenComplianceActionsForMember(workforceMemberId: string, note: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("workforce_compliance_actions")
    .update({
      status: "resolved",
      resolved_by: "System",
      resolved_at: new Date().toISOString(),
      resolution_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("workforce_member_id", workforceMemberId)
    .eq("status", "open");

  if (error) {
    console.error("[closeAllOpenComplianceActionsForMember]", { workforceMemberId, message: error.message });
  }
}

// Owner/due-date are operational metadata, not a protected verification
// judgment — a plain update is consistent with how person_documents'
// metadata is edited elsewhere in this codebase (no RPC ceremony needed
// for non-consequential fields).
export async function setComplianceActionOwnerAndDueDate(input: {
  actionId: string;
  owner: string | null;
  dueAt: string | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("workforce_compliance_actions")
    .update({ owner: input.owner, due_at: input.dueAt, updated_at: new Date().toISOString() })
    .eq("id", input.actionId)
    .eq("status", "open");

  if (error) {
    return { error: `Could not update compliance action: ${error.message}` };
  }
  return {};
}

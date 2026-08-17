// Data layer for audit_sessions / audit_session_items — the Audit Drill
// data model. See supabase/migrations/20260902030000_create_audit_readiness_platform.sql.
//
// This is the minimal drill workflow brought forward as soon as the core
// requirement/evidence architecture made it possible, per explicit
// instruction, rather than deferred to a later phase. It covers exactly
// the operations the Audit Drill Workflow (spec Module F) needs at the
// data layer: start a session, record findings against it, complete it.
// app/audit-readiness/drills/* (Phase 4) is the UI that consumes it.
//
// KNOWN GAP, same as lib/data/complianceCorrectiveActions.ts's own note:
// audit_session_items.subject_id has no existence validation for
// subject_type 'agency'/'community' (no backing table exists for either
// today). Tracked as required pre-August-26 hardening, not a Phase 2
// blocker.
import { createServerClient } from "../supabase/server.ts";
import type { AuditSession, AuditSessionItem, AuditSessionItemFinding, AuditSessionItemSubjectType } from "../supabase/types.ts";

export async function startAuditSession(input: {
  name: string;
  description: string | null;
  scopeDomains: string[];
  auditor: string;
  createdBy: string;
}): Promise<{ session?: AuditSession; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("audit_sessions")
    .insert({
      name: input.name,
      description: input.description,
      scope_domains: input.scopeDomains,
      auditor: input.auditor,
      status: "in_progress",
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not start audit session: ${error?.message}` };
  }

  return { session: data as AuditSession };
}

export async function getAuditSessionById(id: string): Promise<AuditSession | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("audit_sessions").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getAuditSessionById]", { id, message: error.message });
    return null;
  }

  return (data as AuditSession | null) ?? null;
}

export async function listAuditSessions(): Promise<AuditSession[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("audit_sessions").select("*").order("started_at", { ascending: false });

  if (error) {
    console.error("[listAuditSessions]", { message: error.message });
    return [];
  }

  return (data as AuditSession[] | null) ?? [];
}

// Preserves exactly what was reviewed. Status-agnostic on purpose: the DB's
// check_session_not_completed trigger is the real guarantee that a
// completed session's items never change after the fact, so this same read
// serves both the active-review screen and the read-only historical view
// (app/audit-readiness/drills/[id]/page.tsx) — no separate "reopen" query
// path is needed.
export async function getAuditSessionItems(sessionId: string): Promise<AuditSessionItem[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("audit_session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getAuditSessionItems]", { sessionId, message: error.message });
    return [];
  }

  return (data as AuditSessionItem[] | null) ?? [];
}

// Records one finding — one requirement reviewed against one sampled
// subject. Fails structurally (via the DB trigger) if the session is
// already completed; surfaced here as a friendly error rather than a raw
// exception.
export async function recordAuditSessionItem(input: {
  sessionId: string;
  requirementId: string;
  subjectType: AuditSessionItemSubjectType;
  subjectId: string;
  evidenceId: string | null;
  finding: AuditSessionItemFinding;
  notes: string | null;
  createdBy: string;
}): Promise<{ item?: AuditSessionItem; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("audit_session_items")
    .insert({
      session_id: input.sessionId,
      requirement_id: input.requirementId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      evidence_id: input.evidenceId,
      finding: input.finding,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not record audit finding: ${error?.message}` };
  }

  return { item: data as AuditSessionItem };
}

// Attaches a corrective action to a finding after the fact (Module F step
// "create a corrective action") — a plain update, not a protected
// transition, since the session is still in_progress at this point (the
// completion trigger blocks this once the session is completed, as
// intended: a corrective action must be attached before the drill closes,
// matching the 15-step acceptance scenario's own ordering).
export async function attachCorrectiveActionToAuditSessionItem(input: {
  itemId: string;
  correctiveActionId: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("audit_session_items")
    .update({ corrective_action_id: input.correctiveActionId, updated_at: new Date().toISOString() })
    .eq("id", input.itemId);

  if (error) {
    return { error: `Could not attach corrective action to finding: ${error.message}` };
  }
  return {};
}

// The one-way transition — see complete_audit_session() in the migration.
// Only succeeds from a non-completed status; the DB trigger then makes
// every item belonging to this session immutable.
export async function completeAuditSession(input: {
  sessionId: string;
  summary: string | null;
  actor: string;
}): Promise<{ session?: AuditSession; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("complete_audit_session", {
      p_session_id: input.sessionId,
      p_summary: input.summary,
      p_actor: input.actor,
    })
    .single();

  if (error || !data) {
    return { error: `Could not complete audit session: ${error?.message}` };
  }

  return { session: data as AuditSession };
}

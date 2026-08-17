// Data layer for Governed Correction Mode — see
// supabase/migrations/20260902060000_add_audit_session_corrections.sql.
// Append-only: no update/delete path exists here, same shape as
// lib/data/residentServeRelationshipCorrections.ts. The original
// audit_session_items rows a session completed with are never touched by
// anything in this file.
import { createServerClient } from "../supabase/server.ts";
import type { AuditSessionCorrection, AuditSessionItemCorrection } from "../supabase/types.ts";

export async function getCorrectionsForSession(sessionId: string): Promise<AuditSessionCorrection[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("audit_session_corrections")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getCorrectionsForSession]", { sessionId, message: error.message });
    return [];
  }

  return (data as AuditSessionCorrection[] | null) ?? [];
}

// All item-level changes across every correction for a session, in one
// call — composeCorrectedSessionView (lib/compliance/auditDrillView.ts)
// needs the full set to compute each item's latest effective state. Two
// plain queries (corrections for the session, then their item-corrections)
// rather than a PostgREST embedded-filter join, to keep the query shape
// obvious and easy to reason about for a table this small.
export async function getItemCorrectionsForSession(sessionId: string): Promise<AuditSessionItemCorrection[]> {
  const corrections = await getCorrectionsForSession(sessionId);
  if (corrections.length === 0) return [];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("audit_session_item_corrections")
    .select("*")
    .in("correction_id", corrections.map((c) => c.id))
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getItemCorrectionsForSession]", { sessionId, message: error.message });
    return [];
  }

  return (data as AuditSessionItemCorrection[] | null) ?? [];
}

export interface ItemCorrectionInput {
  auditSessionItemId: string | null;
  changeType: AuditSessionItemCorrection["change_type"];
  requirementId: string;
  subjectType: AuditSessionItemCorrection["subject_type"];
  subjectId: string;
  previousFinding: AuditSessionItemCorrection["previous_finding"];
  previousNotes: string | null;
  newFinding: AuditSessionItemCorrection["new_finding"];
  newNotes: string | null;
}

export async function addAuditSessionCorrection(input: {
  sessionId: string;
  actor: string;
  rationale: string;
  itemCorrections: ItemCorrectionInput[];
}): Promise<{ correction?: AuditSessionCorrection; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("add_audit_session_correction", {
      p_session_id: input.sessionId,
      p_actor: input.actor,
      p_rationale: input.rationale,
      p_item_corrections: input.itemCorrections.map((c) => ({
        audit_session_item_id: c.auditSessionItemId,
        change_type: c.changeType,
        requirement_id: c.requirementId,
        subject_type: c.subjectType,
        subject_id: c.subjectId,
        previous_finding: c.previousFinding,
        previous_notes: c.previousNotes,
        new_finding: c.newFinding,
        new_notes: c.newNotes,
      })),
    })
    .single();

  if (error || !data) {
    return { error: `Could not save correction: ${error?.message}` };
  }

  return { correction: data as AuditSessionCorrection };
}

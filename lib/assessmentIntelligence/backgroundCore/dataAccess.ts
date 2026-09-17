import { createServerClient } from "../../supabase/server.ts";
import type { NormalizedDraftFact } from "../factTypes.ts";
import { findConflictingFactPairs, findSelfFlaggedConflicts } from "../conflictDetection.ts";
import { isRecordableDiagnosticStage, type ProcessingDiagnosticStage } from "../processingQueue.ts";

// Background-safe processing data access (2026-09-17 architecture change). Deliberately carries
// NO `import "server-only"` and NO React/Next dependency -- this module is what makes
// advanceQueuedAssessmentProcessing() (backgroundCore/processingCore.ts) safely importable from
// a standalone Netlify Background Function, not just from Next's own server runtime.
//
// WHY THIS SPLIT EXISTS: `server-only` is a pure build-time marker with zero runtime behavior --
// its only job is making Next's client bundler throw if a server module leaks into browser code.
// A Netlify Function never produces a browser bundle, so that risk doesn't exist there at all,
// but the marker throws unconditionally outside the "react-server" export condition regardless
// of context -- which is what crashed netlify/functions/assessment-processing-stage-worker-
// background.mts at MODULE LOAD TIME when it used to import this logic from the guarded
// lib/data/assessmentIntelligence.ts directly (root-caused 2026-09-16/17 across several live
// dispatch tests -- see that file's own header history).
//
// This module holds ONLY the exact subset of lib/data/assessmentIntelligence.ts's functions
// advanceQueuedAssessmentProcessing() / runExtractionPipelineForSession() actually need --
// everything else (approval, decisions, outputs, audio, retry/stale-recovery, the admin
// diagnostics list, AxisCare identity) stays in lib/data/assessmentIntelligence.ts exactly as
// before, still guarded by `import "server-only"`, since none of it needs to run outside Next's
// own server runtime. That file now re-exports everything defined here, so every existing
// Next.js Server Action/Route Handler import path is unaffected -- this is one implementation,
// never duplicated between the two files.

export interface AssessmentSessionRecord {
  id: string;
  resident_id: string;
  status: string;
  initiated_from: string;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  // Canonical FK, additive alongside community_name_snapshot. Null is
  // structurally valid (see
  // supabase/migrations/20260902220000_add_community_id_to_intake_assessment_sessions.sql).
  community_id: string | null;
  // Asynchronous extraction queue (supabase/migrations/
  // 20260916000000_add_assessment_processing_queue.sql) — see processingQueue.ts for the
  // decision logic these drive.
  processing_attempt_count: number;
  processing_claimed_at: string | null;
  failure_reason: string | null;
  failed_at: string | null;
  // Diagnostic-only handoff breadcrumb (supabase/migrations/
  // 20260916010000_add_assessment_processing_diagnostics.sql) — the furthest stage the most
  // recent dispatch/claim attempt reached. Never governs behavior; admin/diagnostic display
  // only, never rendered in the normal assessor-facing UI.
  processing_diagnostic_stage: string | null;
  processing_diagnostic_stage_at: string | null;
  // Retired 2026-09-17 alongside the self-callback architecture it diagnosed (see
  // netlify/functions/assessment-processing-stage-worker-background.mts's header comment) --
  // left in place as harmless schema residue (supabase/migrations/20260917010000_add_worker_
  // wrapper_fetch_outcome_diagnostic_stages.sql already applied to production; not worth a
  // destructive migration to remove). No code path writes this anymore.
  processing_diagnostic_wrapper_fetch_status: number | null;
}

export async function getAssessmentSession(assessmentSessionId: string): Promise<AssessmentSessionRecord | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("id", assessmentSessionId)
    .maybeSingle();
  if (error) {
    console.error("[getAssessmentSession]", { assessmentSessionId, message: error.message });
    return null;
  }
  return data as AssessmentSessionRecord | null;
}

/** Aggregates transcript_text across every intake_sources row for a session — the
 * source-agnostic input boundary (docs/architecture/
 * ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A). Works identically whether the text came
 * from a pasted-transcript entry or (later) a transcription pipeline. */
export async function getCombinedTranscriptText(assessmentSessionId: string): Promise<string> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .select("transcript_text, created_at")
    .eq("assessment_session_id", assessmentSessionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[getCombinedTranscriptText]", { assessmentSessionId, message: error.message });
    return "";
  }
  return ((data as { transcript_text: string | null }[] | null) ?? [])
    .map((row) => row.transcript_text)
    .filter((text): text is string => Boolean(text && text.trim()))
    .join("\n\n---\n\n");
}

export async function updateAssessmentSessionStatus(assessmentSessionId: string, status: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase.from("intake_assessment_sessions").update({ status }).eq("id", assessmentSessionId);
  if (error) {
    console.error("[updateAssessmentSessionStatus]", { assessmentSessionId, status, message: error.message });
    return false;
  }
  return true;
}

/** The source a background worker should attribute freshly-extracted draft facts to — the most
 * recently created intake_sources row for this session. There is exactly one for the
 * pasted-transcript path; for a future multi-source (e.g. audio + a manual note) session the
 * newest source is the one whose arrival is what triggered this processing run. */
export async function getMostRecentSourceIdForSession(assessmentSessionId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .select("id")
    .eq("assessment_session_id", assessmentSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getMostRecentSourceIdForSession]", { assessmentSessionId, message: error.message });
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

// ─── Asynchronous extraction queue (2026-09-16) ──────────────────────────────────────────────
// Conditional-update-then-check-affected-rows pattern: UPDATE ... WHERE id = ? AND <the exact
// precondition this transition requires>, then look at whether any row was actually affected.
// This is what makes concurrent/duplicate dispatch and duplicate background-worker invocations
// safe — Postgres guarantees only one concurrent UPDATE against the same row can see the
// precondition still true; every loser's UPDATE affects zero rows and is a harmless no-op.

/** Attempts to claim a queued session for processing. Returns true only if THIS call won the
 * claim (the update affected a row) — false means either another worker already claimed it, or
 * it wasn't queued at all. Increments processing_attempt_count as part of the same atomic
 * update, so "how many times has this session actually been attempted" can never drift from
 * how many times it was actually claimed. */
export async function claimSessionForProcessing(assessmentSessionId: string): Promise<boolean> {
  const supabase = createServerClient();
  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return false;
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .update({
      status: "processing",
      processing_claimed_at: new Date().toISOString(),
      processing_attempt_count: session.processing_attempt_count + 1,
    })
    .eq("id", assessmentSessionId)
    .eq("status", "queued")
    .select("id");
  if (error) {
    console.error("[claimSessionForProcessing]", { assessmentSessionId, message: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Best-effort breadcrumb of the furthest stage the most recent dispatch/claim attempt reached —
 * overwritten each attempt, not an append-only log. Never throws and never blocks or fails the
 * real dispatch/claim/extraction path it's called alongside: a diagnostic write failing must
 * never be the reason a real assessment fails to process. */
export async function recordProcessingDiagnosticStage(
  assessmentSessionId: string,
  stage: ProcessingDiagnosticStage
): Promise<void> {
  if (!isRecordableDiagnosticStage(stage)) return;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("intake_assessment_sessions")
      .update({ processing_diagnostic_stage: stage, processing_diagnostic_stage_at: new Date().toISOString() })
      .eq("id", assessmentSessionId);
    if (error) {
      console.error("[recordProcessingDiagnosticStage]", { assessmentSessionId, stage, message: error.message });
    }
  } catch (err) {
    console.error("[recordProcessingDiagnosticStage]", { assessmentSessionId, stage, err });
  }
}

/** Durably marks a session failed with a sanitized (see processingQueue.ts's
 * sanitizeFailureReason()), bounded reason — administrator/debugging detail only, never the raw
 * text shown in the operator UI (see SAFE_PROCESSING_FAILURE_MESSAGE). Scoped to sessions
 * currently 'processing' — the only state a worker holding a real claim should ever be failing
 * out of. */
export async function markSessionFailed(assessmentSessionId: string, reason: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("intake_assessment_sessions")
    .update({ status: "failed", failure_reason: reason, failed_at: new Date().toISOString() })
    .eq("id", assessmentSessionId)
    .eq("status", "processing");
  if (error) {
    console.error("[markSessionFailed]", { assessmentSessionId, message: error.message });
    return false;
  }
  return true;
}

export async function writeDraftFacts(input: {
  assessmentSessionId: string;
  sourceId: string | null;
  facts: NormalizedDraftFact[];
  extractionRunRef: string;
  modelVersion: string;
}): Promise<number> {
  if (input.facts.length === 0) return 0;
  const supabase = createServerClient();
  const rows = input.facts.map((f) => ({
    assessment_session_id: input.assessmentSessionId,
    source_id: input.sourceId,
    domain: f.domain,
    field_path: f.fieldPath,
    value: f.value,
    assertion_state: f.assertionState,
    collection_method: f.collectionMethod,
    reporter: f.reporter,
    evidence: f.evidence,
    confidence: f.confidence,
    extraction_run_ref: input.extractionRunRef,
    model_version: input.modelVersion,
  }));
  const { error } = await supabase.from("assessment_draft_facts").insert(rows);
  if (error) {
    console.error("[writeDraftFacts]", { message: error.message });
    return 0;
  }
  return rows.length;
}

export interface DraftFactRow {
  id: string;
  assessment_session_id: string;
  field_path: string;
  value: unknown;
  assertion_state: string;
  collection_method: string | null;
  reporter: string | null;
  evidence: string | null;
  confidence: string;
}

export async function getDraftFactsForSession(assessmentSessionId: string): Promise<DraftFactRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("assessment_draft_facts")
    .select("*")
    .eq("assessment_session_id", assessmentSessionId)
    .order("field_path", { ascending: true });
  if (error) {
    console.error("[getDraftFactsForSession]", { assessmentSessionId, message: error.message });
    return [];
  }
  return (data as DraftFactRow[] | null) ?? [];
}

export interface FactConflictRow {
  id: string;
  field_path: string;
  fact_a_draft_id: string;
  fact_b_draft_id: string | null;
  status: string;
  resolved_fact_id: string | null;
}

/** Detects and persists conflicts: same-field_path draft facts whose assertion states
 * genuinely disagree (opposite confirmed_yes/confirmed_no polarity, or, for non-boolean
 * fields, same-polarity facts with different values — see findConflictingFactPairs()), plus a
 * "singleton" row (fact_b_draft_id null) for any model-self-flagged conflicting fact with no
 * natural second fact to pair against — see findSelfFlaggedConflicts(). Called after extraction
 * writes draft facts. */
export async function detectAndRecordConflicts(residentId: string, assessmentSessionId: string): Promise<number> {
  const supabase = createServerClient();
  const facts = await getDraftFactsForSession(assessmentSessionId);
  const candidateFacts = facts.map((f) => ({ id: f.id, field_path: f.field_path, assertion_state: f.assertion_state, value: f.value }));
  const pairs = findConflictingFactPairs(candidateFacts);
  const selfFlagged = findSelfFlaggedConflicts(candidateFacts);

  let created = 0;
  for (const pair of pairs) {
    const { error } = await supabase.from("assessment_fact_conflicts").insert([
      {
        resident_id: residentId,
        field_path: pair.fieldPath,
        fact_a_draft_id: pair.factAId,
        fact_b_draft_id: pair.factBId,
        status: "open",
      },
    ]);
    if (!error) created++;
    else console.error("[detectAndRecordConflicts]", { fieldPath: pair.fieldPath, message: error.message });
  }
  for (const flagged of selfFlagged) {
    const { error } = await supabase.from("assessment_fact_conflicts").insert([
      {
        resident_id: residentId,
        field_path: flagged.fieldPath,
        fact_a_draft_id: flagged.factId,
        fact_b_draft_id: null,
        status: "open",
      },
    ]);
    if (!error) created++;
    else console.error("[detectAndRecordConflicts]", { fieldPath: flagged.fieldPath, message: error.message });
  }
  return created;
}

/** Shared by getOpenConflictsForSession (below, used right after extraction) and
 * lib/data/assessmentIntelligence.ts's getConflictsForSession (the "all" variant the review UI
 * uses) — kept here, exported, so the Next-facing file can import it back rather than
 * duplicating this query. */
export async function getConflictsForSessionByStatus(
  assessmentSessionId: string,
  status: "open" | "all"
): Promise<FactConflictRow[]> {
  const supabase = createServerClient();
  const { data: sessionRow } = await supabase
    .from("intake_assessment_sessions")
    .select("resident_id")
    .eq("id", assessmentSessionId)
    .maybeSingle();
  if (!sessionRow) return [];

  // Conflicts are resident-scoped but only meaningful for this review if their draft facts
  // belong to this session — join through assessment_draft_facts' session id.
  const draftFacts = await getDraftFactsForSession(assessmentSessionId);
  const sessionDraftIds = new Set(draftFacts.map((f) => f.id));

  let query = supabase
    .from("assessment_fact_conflicts")
    .select("*")
    .eq("resident_id", (sessionRow as { resident_id: string }).resident_id);
  if (status === "open") query = query.eq("status", "open");

  const { data, error } = await query;
  if (error) {
    console.error("[getConflictsForSessionByStatus]", { assessmentSessionId, status, message: error.message });
    return [];
  }
  return ((data as FactConflictRow[] | null) ?? []).filter(
    (c) => sessionDraftIds.has(c.fact_a_draft_id) || (c.fact_b_draft_id !== null && sessionDraftIds.has(c.fact_b_draft_id))
  );
}

/** Open conflicts only — used right after extraction to decide whether a fresh session needs
 * review before anything has been reviewed at all, where "open" and "all" are equivalent
 * anyway (nothing has been resolved yet). */
export async function getOpenConflictsForSession(assessmentSessionId: string): Promise<FactConflictRow[]> {
  return getConflictsForSessionByStatus(assessmentSessionId, "open");
}

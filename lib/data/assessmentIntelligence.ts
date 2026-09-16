import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { getPersonVendorIdentityLinksForSubject } from "./personVendorIdentityLinks.ts";
import type { AxisCareIdentityLinkState } from "../assessmentIntelligence/axiscareReadiness.ts";
import type { NormalizedDraftFact } from "../assessmentIntelligence/factTypes.ts";
import { findConflictingFactPairs, findSelfFlaggedConflicts } from "../assessmentIntelligence/conflictDetection.ts";
import {
  decideStaleRecovery,
  isStaleProcessing,
  isRecordableDiagnosticStage,
  type QueueableSession,
  type ProcessingDiagnosticStage,
} from "../assessmentIntelligence/processingQueue.ts";

// Data layer for the assessment intelligence tables (supabase/migrations/
// 20260901000000_create_assessment_intelligence_layer.sql). Machine-generated rows (draft
// facts, decisions, outputs) are written directly via the service-role client, matching how
// intake_sources/intake_assessment_sessions are already written elsewhere in this repo.
// Approval is the one governed, atomic action — routed through approve_assessment_session().

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
  // only (components/settings/AssessmentProcessingDispatchTrigger.tsx), never rendered in the
  // normal assessor-facing UI.
  processing_diagnostic_stage: string | null;
  processing_diagnostic_stage_at: string | null;
  // The exact HTTP status code the worker wrapper's outbound fetch to the worker Route Handler
  // received, when it received one at all (supabase/migrations/20260917010000_add_worker_
  // wrapper_fetch_outcome_diagnostic_stages.sql). NULL means either no fetch outcome has been
  // recorded yet, or the fetch never got a response (network/DNS/timeout) -- paired with
  // processing_diagnostic_stage='worker_wrapper_fetch_failed' to distinguish those two cases.
  // Written directly by the .mts wrapper via raw PostgREST, not through this data layer.
  processing_diagnostic_wrapper_fetch_status: number | null;
}

function toQueueableSession(session: AssessmentSessionRecord): QueueableSession {
  return {
    status: session.status,
    processingAttemptCount: session.processing_attempt_count,
    processingClaimedAt: session.processing_claimed_at,
  };
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

export async function getAssessmentSessionsForResident(residentId: string): Promise<AssessmentSessionRecord[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("resident_id", residentId)
    .order("started_at", { ascending: false });
  if (error) {
    console.error("[getAssessmentSessionsForResident]", { residentId, message: error.message });
    return [];
  }
  return (data as AssessmentSessionRecord[] | null) ?? [];
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

export async function createPastedTranscriptSource(input: {
  assessmentSessionId: string;
  transcriptText: string;
}): Promise<{ id: string } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .insert([
      {
        assessment_session_id: input.assessmentSessionId,
        source_type: "pasted_transcript",
        raw_text: input.transcriptText,
        transcript_text: input.transcriptText,
        status: "uploaded",
      },
    ])
    .select("id")
    .single();
  if (error) {
    console.error("[createPastedTranscriptSource]", { message: error.message });
    return null;
  }
  return data as { id: string };
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
// Every transition below uses the same conditional-update-then-check-affected-rows pattern:
// UPDATE ... WHERE id = ? AND <the exact precondition this transition requires>, then look at
// whether any row was actually affected. This is what makes concurrent/duplicate dispatch,
// duplicate background-worker invocations, and a double-clicked Retry all safe — Postgres
// guarantees only one concurrent UPDATE against the same row can see the precondition still
// true; every loser's UPDATE affects zero rows and is a harmless no-op, never a duplicate
// extraction run or a corrupted state. Same pattern feature/assessment-aws-transcription-
// pipeline's claimAssessmentProcessingStage() used for its own (more elaborate) multi-stage
// claim — proven here in its smallest form, since extraction is one bounded step.

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
 * overwritten each attempt, not an append-only log (see the migration's comment for why). Never
 * throws and never blocks or fails the real dispatch/claim/extraction path it's called
 * alongside: a diagnostic write failing must never be the reason a real assessment fails to
 * process. Deliberately does not condition on the session's current status — the call sites
 * (pipeline.ts) already only call this at the exact moments each stage genuinely occurs. */
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

/** Operator-triggered retry: requeues a failed session, clearing its failure metadata, WITHOUT
 * resetting processing_attempt_count — retry counts toward the same bounded attempt policy as
 * automatic recovery, never an unlimited escape hatch. Only proceeds if the session is currently
 * 'failed' AND under the attempt cap, checked atomically in the same update as the requeue — a
 * double-click or concurrent retry attempt loses safely (see the module comment above) rather
 * than requeuing twice. */
export async function requeueSessionForRetry(
  assessmentSessionId: string,
  maxAttempts: number
): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .update({
      status: "queued",
      failure_reason: null,
      failed_at: null,
      processing_diagnostic_stage: null,
      processing_diagnostic_stage_at: null,
      processing_diagnostic_wrapper_fetch_status: null,
    })
    .eq("id", assessmentSessionId)
    .eq("status", "failed")
    .lt("processing_attempt_count", maxAttempts)
    .select("id");
  if (error) {
    console.error("[requeueSessionForRetry]", { assessmentSessionId, message: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Finds sessions genuinely stuck at 'processing' (claimed long enough ago that the worker
 * holding that claim is presumed dead — crashed, or killed by a platform timeout) and, per
 * decideStaleRecovery()'s bounded policy, either requeues them for another attempt or marks
 * them permanently failed once the attempt cap is reached. Called by the scheduled dispatcher
 * before it looks for newly-queued work, so a stuck session gets the exact same recovery path
 * regardless of how it got stuck.
 *
 * A 'processing' row with processing_claimed_at IS NULL is never eligible here — that column is
 * written exclusively by claimSessionForProcessing(), so its absence means this row was never
 * claimed by the new async worker at all (every session that predates the 20260916000000
 * migration has it NULL by construction, including long-abandoned legacy sessions). Such a row
 * is left untouched, not swept up and silently resurrected as if it were genuinely-queued new
 * work — see isStaleProcessing()'s own comment for the incident this fixes. */
export async function recoverStaleProcessingSessions(staleAfterMs: number, maxAttempts: number): Promise<number> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("intake_assessment_sessions").select("*").eq("status", "processing");
  if (error) {
    console.error("[recoverStaleProcessingSessions]", { message: error.message });
    return 0;
  }
  const sessions = (data as AssessmentSessionRecord[] | null) ?? [];
  const now = Date.now();
  let recovered = 0;

  for (const session of sessions) {
    const queueable = toQueueableSession(session);
    if (!isStaleProcessing(queueable, now, staleAfterMs)) continue;

    const decision = decideStaleRecovery(queueable, maxAttempts);
    if (decision.action === "fail") {
      const { error: failError } = await supabase
        .from("intake_assessment_sessions")
        .update({ status: "failed", failure_reason: decision.reason, failed_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "processing");
      if (!failError) recovered++;
      continue;
    }

    // Requeue -- re-affirm staleness in the WHERE clause itself so a worker that finished and
    // wrote a terminal status in the moment between the read above and this write is never
    // clobbered back to 'queued'. isStaleProcessing() above already guarantees
    // processing_claimed_at is non-null here, so this can compare it directly.
    const cutoffIso = new Date(now - staleAfterMs).toISOString();
    const { data: updated, error: requeueError } = await supabase
      .from("intake_assessment_sessions")
      .update({
        status: "queued",
        processing_claimed_at: null,
        processing_diagnostic_stage: null,
        processing_diagnostic_stage_at: null,
        processing_diagnostic_wrapper_fetch_status: null,
      })
      .eq("id", session.id)
      .eq("status", "processing")
      .lt("processing_claimed_at", cutoffIso)
      .select("id");
    if (!requeueError && (updated?.length ?? 0) > 0) recovered++;
  }

  return recovered;
}

export async function getQueuedSessionsForDispatch(limit: number): Promise<AssessmentSessionRecord[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("status", "queued")
    .order("started_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[getQueuedSessionsForDispatch]", { message: error.message });
    return [];
  }
  return (data as AssessmentSessionRecord[] | null) ?? [];
}

export interface ProcessingDiagnosticRow {
  readonly id: string;
  readonly residentId: string;
  readonly residentName: string | null;
  readonly status: string;
  readonly processingAttemptCount: number;
  readonly processingClaimedAt: string | null;
  readonly processingDiagnosticStage: string | null;
  readonly processingDiagnosticStageAt: string | null;
  // Paired with processingDiagnosticStage==='worker_wrapper_fetch_failed' -- see
  // AssessmentSessionRecord's own field comment. A bounded HTTP status integer only, never a
  // message/body/URL.
  readonly wrapperFetchStatus: number | null;
  // Admin/diagnostic-only detail -- never the operator-facing message (SAFE_PROCESSING_FAILURE_
  // MESSAGE), see markSessionFailed()'s comment.
  readonly failureReason: string | null;
  readonly startedAt: string;
}

/** Admin-only diagnostic listing (app/settings/page.tsx, gated the same as the manual dispatch
 * trigger) -- every session currently in flight in the async queue, most recent first, so the
 * next dispatch/claim attempt's exact stopping point is visible without Netlify log access. Not
 * used by, and must never be wired into, the normal assessor-facing UI. */
export async function getSessionsWithProcessingDiagnostics(limit: number): Promise<ProcessingDiagnosticRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*, residents(display_name, full_name, first_name, last_name)")
    .in("status", ["queued", "processing", "failed"])
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[getSessionsWithProcessingDiagnostics]", { message: error.message });
    return [];
  }
  type ResidentNameFields = {
    display_name: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  const rows = (data as (AssessmentSessionRecord & { residents: ResidentNameFields | null })[] | null) ?? [];
  return rows.map((row) => ({
    id: row.id,
    residentId: row.resident_id,
    residentName:
      row.residents?.display_name ||
      row.residents?.full_name ||
      [row.residents?.first_name, row.residents?.last_name].filter(Boolean).join(" ") ||
      null,
    status: row.status,
    processingAttemptCount: row.processing_attempt_count,
    processingClaimedAt: row.processing_claimed_at,
    processingDiagnosticStage: row.processing_diagnostic_stage,
    processingDiagnosticStageAt: row.processing_diagnostic_stage_at,
    wrapperFetchStatus: row.processing_diagnostic_wrapper_fetch_status,
    failureReason: row.failure_reason,
    startedAt: row.started_at,
  }));
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

async function getConflictsForSessionByStatus(
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

/** Open conflicts only — used right after extraction (pipeline.ts) to decide whether a fresh
 * session needs review before anything has been reviewed at all, where "open" and "all" are
 * equivalent anyway (nothing has been resolved yet). */
export async function getOpenConflictsForSession(assessmentSessionId: string): Promise<FactConflictRow[]> {
  return getConflictsForSessionByStatus(assessmentSessionId, "open");
}

/** Every conflict for this session regardless of status — the review screen needs to keep
 * showing a field as "conflicting" (with its resolution, if any) even after it's been
 * resolved, rather than having it silently vanish and its rejected value fall through to
 * auto-accepted. */
export async function getConflictsForSession(assessmentSessionId: string): Promise<FactConflictRow[]> {
  return getConflictsForSessionByStatus(assessmentSessionId, "all");
}

/** Durably resolves a conflict: records which of the conflicting facts (or, for a singleton
 * self-flagged conflict, the one fact) the reviewer confirmed as correct. Reuses the existing
 * status/resolved_by/resolved_at columns (previously written 'open' at creation and never
 * updated by any code path) plus resolved_fact_id (20260915020000_add_assessment_fact_conflict_
 * resolution.sql) — never overwrites resolution_note, which stays free for a human note.
 * Unconditional (no "must currently be open" guard): a reviewer changing their mind and picking
 * a different value is expected, ordinary usage, not a race to guard against. */
export async function resolveFactConflict(input: {
  conflictId: string;
  resolvedFactId: string;
  resolvedBy: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("assessment_fact_conflicts")
    .update({
      status: "resolved",
      resolved_fact_id: input.resolvedFactId,
      resolved_by: input.resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.conflictId);
  if (error) {
    console.error("[resolveFactConflict]", { conflictId: input.conflictId, message: error.message });
    return { error: error.message };
  }
  return {};
}

export interface ApprovedFactRow {
  id: string;
  resident_id: string;
  field_path: string;
  value: unknown;
  assertion_state: string;
  collection_method: string | null;
  reporter: string | null;
  evidence: string | null;
  confidence: string;
  approved_by: string;
  approved_at: string;
}

export async function getApprovedFactsForResident(residentId: string): Promise<ApprovedFactRow[]> {
  const supabase = createServerClient();
  // Only current facts — a superseded row (superseded_by a later insert) is excluded by
  // checking no other approved fact points back at it as its supersedes_fact_id.
  const { data, error } = await supabase
    .from("assessment_approved_facts")
    .select("*")
    .eq("resident_id", residentId)
    .order("approved_at", { ascending: true });
  if (error) {
    console.error("[getApprovedFactsForResident]", { residentId, message: error.message });
    return [];
  }
  const all = (data as (ApprovedFactRow & { supersedes_fact_id: string | null })[] | null) ?? [];
  const supersededIds = new Set(all.map((f) => f.supersedes_fact_id).filter(Boolean));
  return all.filter((f) => !supersededIds.has(f.id));
}

export async function approveAssessmentSession(input: {
  assessmentSessionId: string;
  actor: string;
  approvedFacts: {
    field_path: string;
    value: unknown;
    assertion_state: string;
    collection_method: string | null;
    reporter: string | null;
    evidence: string | null;
    confidence: string;
    source_draft_fact_id: string | null;
    supersedes_fact_id: string | null;
  }[];
  rationale?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("approve_assessment_session", {
    p_assessment_session_id: input.assessmentSessionId,
    p_actor: input.actor,
    p_approved_facts: input.approvedFacts,
    p_rationale: input.rationale ?? null,
  });
  if (error) {
    console.error("[approveAssessmentSession]", { message: error.message });
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function writeAssessmentDecision(input: {
  assessmentSessionId: string;
  decisionType: "service_recommendation" | "pricing" | "axiscare_readiness";
  inputFactIds: string[];
  output: Record<string, unknown>;
  rationale?: string;
  catalogVersion?: string;
  rulesVersion?: string;
}): Promise<{ id: string } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("assessment_decisions")
    .insert([
      {
        assessment_session_id: input.assessmentSessionId,
        decision_type: input.decisionType,
        input_fact_ids: input.inputFactIds,
        output: input.output,
        rationale: input.rationale ?? null,
        catalog_version: input.catalogVersion ?? null,
        rules_version: input.rulesVersion ?? null,
      },
    ])
    .select("id")
    .single();
  if (error) {
    console.error("[writeAssessmentDecision]", { message: error.message });
    return null;
  }
  return data as { id: string };
}

export async function getLatestDecision(
  assessmentSessionId: string,
  decisionType: "service_recommendation" | "pricing" | "axiscare_readiness"
): Promise<{ id: string; output: Record<string, unknown>; rationale: string | null } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("assessment_decisions")
    .select("id, output, rationale")
    .eq("assessment_session_id", assessmentSessionId)
    .eq("decision_type", decisionType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getLatestDecision]", { assessmentSessionId, decisionType, message: error.message });
    return null;
  }
  return data as { id: string; output: Record<string, unknown>; rationale: string | null } | null;
}

export async function writeAssessmentOutput(input: {
  assessmentSessionId: string;
  outputType: "internal_summary" | "client_email" | "proposal" | "axiscare_payload_preview" | "cinch_projection";
  content: Record<string, unknown>;
  generatedBy?: string;
}): Promise<{ id: string } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("assessment_outputs")
    .insert([
      {
        assessment_session_id: input.assessmentSessionId,
        output_type: input.outputType,
        content: input.content,
        generated_by: input.generatedBy ?? null,
      },
    ])
    .select("id")
    .single();
  if (error) {
    console.error("[writeAssessmentOutput]", { message: error.message });
    return null;
  }
  return data as { id: string };
}

export async function getOutputsForSession(assessmentSessionId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("assessment_outputs")
    .select("*")
    .eq("assessment_session_id", assessmentSessionId)
    .order("generated_at", { ascending: false });
  if (error) {
    console.error("[getOutputsForSession]", { assessmentSessionId, message: error.message });
    return [];
  }
  return data ?? [];
}

const AUDIO_BUCKET = "intake-audio";

export interface AudioSourceRow {
  id: string;
  assessment_session_id: string;
  status: string;
  transcript_text: string | null;
}

/** The live_audio_stream intake_sources row a Capture Assessment session writes chunks
 * against (netlify/functions/intake-audio-chunk-url.js / intake-finish.js in serve-intake-mvp).
 * Reads the same row the pasted-transcript path never touches — one row per source_type. */
export async function getAudioSourceForSession(assessmentSessionId: string): Promise<AudioSourceRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .select("id, assessment_session_id, status, transcript_text")
    .eq("assessment_session_id", assessmentSessionId)
    .eq("source_type", "live_audio_stream")
    .maybeSingle();
  if (error) {
    console.error("[getAudioSourceForSession]", { assessmentSessionId, message: error.message });
    return null;
  }
  return data as AudioSourceRow | null;
}

export interface StoredAudioChunk {
  path: string;
  bytes: ArrayBuffer;
  mimeType: string;
}

/** Lists and downloads every uploaded chunk for a session from the private intake-audio
 * bucket, in chunk-index order. Object paths are opaque ({session_id}/{index}.webm) — no
 * resident identity anywhere in the path, matching the existing storage convention. */
export async function downloadAudioChunksForSession(assessmentSessionId: string): Promise<StoredAudioChunk[]> {
  const supabase = createServerClient();
  const { data: listing, error: listError } = await supabase.storage.from(AUDIO_BUCKET).list(assessmentSessionId);
  if (listError || !listing) {
    console.error("[downloadAudioChunksForSession] list failed", { assessmentSessionId, message: listError?.message });
    return [];
  }

  const chunks: StoredAudioChunk[] = [];
  for (const entry of listing.filter((e) => e.name.endsWith(".webm")).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${assessmentSessionId}/${entry.name}`;
    const { data: fileData, error: downloadError } = await supabase.storage.from(AUDIO_BUCKET).download(path);
    if (downloadError || !fileData) {
      console.error("[downloadAudioChunksForSession] download failed", { path, message: downloadError?.message });
      continue;
    }
    chunks.push({ path, bytes: await fileData.arrayBuffer(), mimeType: fileData.type || "audio/webm" });
  }
  return chunks;
}

export async function writeTranscriptSegments(input: {
  sourceId: string;
  segments: { text: string; chunkIndex: number }[];
}): Promise<number> {
  if (input.segments.length === 0) return 0;
  const supabase = createServerClient();
  const rows = input.segments.map((s) => ({
    source_id: input.sourceId,
    speaker: null,
    start_time: s.chunkIndex,
    end_time: null,
    text: s.text,
    is_final: true,
  }));
  const { error } = await supabase.from("intake_transcript_segments").insert(rows);
  if (error) {
    console.error("[writeTranscriptSegments]", { message: error.message });
    return 0;
  }
  return rows.length;
}

export async function updateSourceTranscriptText(sourceId: string, transcriptText: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase.from("intake_sources").update({ transcript_text: transcriptText }).eq("id", sourceId);
  if (error) {
    console.error("[updateSourceTranscriptText]", { sourceId, message: error.message });
    return false;
  }
  return true;
}

/** Records whether every chunk transcribed successfully, durably, in source_payload — so a
 * partial transcription (some chunks failed) is visible to anyone reviewing the session later,
 * not just present in an ephemeral function-call return value nobody may have looked at. Never
 * silently presents a partial transcript as complete. */
export async function recordTranscriptionOutcome(input: {
  sourceId: string;
  totalChunks: number;
  succeededChunks: number;
  failedChunkPaths: string[];
}): Promise<boolean> {
  const supabase = createServerClient();
  const { data: existing } = await supabase.from("intake_sources").select("source_payload").eq("id", input.sourceId).maybeSingle();
  const { error } = await supabase
    .from("intake_sources")
    .update({
      source_payload: {
        ...((existing as { source_payload?: Record<string, unknown> } | null)?.source_payload ?? {}),
        transcription_status: input.failedChunkPaths.length > 0 ? "partial" : "complete",
        transcription_total_chunks: input.totalChunks,
        transcription_succeeded_chunks: input.succeededChunks,
        transcription_failed_chunk_paths: input.failedChunkPaths,
      },
    })
    .eq("id", input.sourceId);
  if (error) {
    console.error("[recordTranscriptionOutcome]", { message: error.message });
    return false;
  }
  return true;
}

/** Reuses the EXISTING governed identity-resolution mechanism — never a parallel query. */
export async function getAxisCareIdentityLinkState(residentId: string): Promise<AxisCareIdentityLinkState> {
  const links = await getPersonVendorIdentityLinksForSubject("resident", residentId);
  const axiscareLinks = links.filter((l) => l.source_system === "axiscare");
  const primary = axiscareLinks.find((l) => l.link_role === "primary") ?? axiscareLinks[0];
  if (!primary) {
    return { status: null, axiscareClientId: null, matchConfidence: null };
  }
  return {
    status: primary.status as AxisCareIdentityLinkState["status"],
    axiscareClientId: primary.status === "confirmed" ? primary.vendor_record_id : null,
    matchConfidence: primary.match_confidence as AxisCareIdentityLinkState["matchConfidence"],
  };
}

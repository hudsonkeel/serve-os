import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { getPersonVendorIdentityLinksForSubject } from "./personVendorIdentityLinks.ts";
import type { AxisCareIdentityLinkState } from "../assessmentIntelligence/axiscareReadiness.ts";
import type { NormalizedDraftFact } from "../assessmentIntelligence/factTypes.ts";

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
  processing_stage?: string | null;
  processing_stage_entered_at?: string | null;
  is_synthetic_test?: boolean;
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

/** Setting status away from 'processing' always clears processing_stage too — a finer-grained
 * stage description must never linger on a terminal row (see the 20260903000000 migration's
 * comment on why processing_stage is purely descriptive, never itself authoritative). Callers
 * moving a session TO 'processing' (only finalizeNativeAudioSource does this) set
 * processing_stage separately, deliberately — see that function. */
export async function updateAssessmentSessionStatus(assessmentSessionId: string, status: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("intake_assessment_sessions")
    .update(status === "processing" ? { status } : { status, processing_stage: null })
    .eq("id", assessmentSessionId);
  if (error) {
    console.error("[updateAssessmentSessionStatus]", { assessmentSessionId, status, message: error.message });
    return false;
  }
  return true;
}

// ─── Failure/retry state (Phase 13) ────────────────────────────────────────
// Requires supabase/migrations/20260902060000_add_assessment_session_failure_state.sql
// (written, NOT YET APPLIED as of this code — see this scope's completion report). Until
// applied, calls to this function will fail against the live database with an "unrecognized
// status 'failed'" constraint violation — the caller (pipeline.ts) treats that failure the
// same as any other write failure (logged, non-fatal to the response).
export async function markAssessmentSessionFailed(input: {
  assessmentSessionId: string;
  stage: "transcription" | "extraction";
  reason: string;
}): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("intake_assessment_sessions")
    .update({
      status: "failed",
      failure_stage: input.stage,
      failure_reason: input.reason,
      failed_at: new Date().toISOString(),
      // A failure is a terminal state — no finer-grained processing_stage should linger
      // alongside it (matches updateAssessmentSessionStatus's same discipline).
      processing_stage: null,
    })
    .eq("id", input.assessmentSessionId);
  if (error) {
    console.error("[markAssessmentSessionFailed]", { message: error.message });
    return false;
  }
  return true;
}

export interface AssessmentSessionFailureRecord extends AssessmentSessionRecord {
  failure_stage: string | null;
  failure_reason: string | null;
  failed_at: string | null;
  processing_stage: string | null;
}

export async function getAssessmentSessionWithFailureState(
  assessmentSessionId: string
): Promise<AssessmentSessionFailureRecord | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("id", assessmentSessionId)
    .maybeSingle();
  if (error) {
    console.error("[getAssessmentSessionWithFailureState]", { assessmentSessionId, message: error.message });
    return null;
  }
  return data as AssessmentSessionFailureRecord | null;
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
  fact_b_draft_id: string;
  status: string;
}

/** Detects and persists conflicts: two draft facts for the same field_path with different
 * confirmed_yes/confirmed_no assertion states. Called after extraction writes draft facts. */
export async function detectAndRecordConflicts(residentId: string, assessmentSessionId: string): Promise<number> {
  const supabase = createServerClient();
  const facts = await getDraftFactsForSession(assessmentSessionId);
  const byFieldPath = new Map<string, DraftFactRow[]>();
  for (const fact of facts) {
    const list = byFieldPath.get(fact.field_path) ?? [];
    list.push(fact);
    byFieldPath.set(fact.field_path, list);
  }

  let created = 0;
  for (const [fieldPath, group] of byFieldPath) {
    const confirmedYes = group.find((f) => f.assertion_state === "confirmed_yes");
    const confirmedNo = group.find((f) => f.assertion_state === "confirmed_no");
    if (confirmedYes && confirmedNo) {
      const { error } = await supabase.from("assessment_fact_conflicts").insert([
        {
          resident_id: residentId,
          field_path: fieldPath,
          fact_a_draft_id: confirmedYes.id,
          fact_b_draft_id: confirmedNo.id,
          status: "open",
        },
      ]);
      if (!error) created++;
      else console.error("[detectAndRecordConflicts]", { fieldPath, message: error.message });
    }
  }
  return created;
}

export async function getOpenConflictsForSession(assessmentSessionId: string): Promise<FactConflictRow[]> {
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

  const { data, error } = await supabase
    .from("assessment_fact_conflicts")
    .select("*")
    .eq("resident_id", (sessionRow as { resident_id: string }).resident_id)
    .eq("status", "open");
  if (error) {
    console.error("[getOpenConflictsForSession]", { assessmentSessionId, message: error.message });
    return [];
  }
  return ((data as FactConflictRow[] | null) ?? []).filter(
    (c) => sessionDraftIds.has(c.fact_a_draft_id) || sessionDraftIds.has(c.fact_b_draft_id)
  );
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
  transcription_provider: string | null;
  transcription_job_id: string | null;
  transcription_provider_metadata: Record<string, unknown> | null;
}

/** The live_audio_stream intake_sources row a Capture Assessment session writes chunks
 * against (netlify/functions/intake-audio-chunk-url.js / intake-finish.js in serve-intake-mvp).
 * Reads the same row the pasted-transcript path never touches — one row per source_type. */
export async function getAudioSourceForSession(assessmentSessionId: string): Promise<AudioSourceRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .select("id, assessment_session_id, status, transcript_text, transcription_provider, transcription_job_id, transcription_provider_metadata")
    .eq("assessment_session_id", assessmentSessionId)
    .eq("source_type", "live_audio_stream")
    .maybeSingle();
  if (error) {
    console.error("[getAudioSourceForSession]", { assessmentSessionId, message: error.message });
    return null;
  }
  return data as AudioSourceRow | null;
}

/** Persists a resumable transcription job handle on the audio source row — how a later worker
 * tick finds and checks a job an earlier tick started, without starting a duplicate one. */
export async function persistTranscriptionJobHandle(input: {
  sourceId: string;
  providerId: string;
  jobId: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("intake_sources")
    .update({
      transcription_provider: input.providerId,
      transcription_job_id: input.jobId,
      transcription_provider_metadata: input.metadata ?? null,
    })
    .eq("id", input.sourceId);
  if (error) {
    console.error("[persistTranscriptionJobHandle]", { message: error.message });
    return false;
  }
  return true;
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

// ─── Native Serve OS capture (Phase 2/5) ───────────────────────────────────
// Session creation now happens directly in Serve OS, server-side, for an already-authenticated
// user against an already-verified resident — no opaque handoff code needed for this path (the
// handoff-code mechanism in assessmentCapture.ts / create_intake_handoff_code remains for the
// external serve-intake.netlify.app reference implementation, untouched).

export async function createNativeAssessmentSession(input: {
  residentId: string;
  startedBy: string;
  // Resolved by the caller (getOrStartNativeCaptureSession, mirroring
  // startAssessmentForExistingPerson's identical resolveAssessmentCommunity
  // call) — this function never resolves community identity itself, same
  // separation every other session-creating action in this codebase uses.
  communityId: string | null;
}): Promise<{ session?: AssessmentSessionRecord; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .insert([
      {
        resident_id: input.residentId,
        status: "recording",
        initiated_from: "existing_person",
        started_by: input.startedBy,
        community_id: input.communityId,
      },
    ])
    .select("*")
    .single();
  if (error || !data) {
    return { error: `Could not start assessment capture: ${error?.message}` };
  }
  return { session: data as AssessmentSessionRecord };
}

/** Creates a NEW assessment session explicitly marked synthetic (is_synthetic_test = true) —
 * the ONLY function in this codebase that ever sets that column. createNativeAssessmentSession
 * above never touches it, so every normal capture session gets the column's own default
 * (false) — synthetic status is never inferred, never a side effect of any other field (e.g. a
 * resident's name), and never settable through the ordinary capture flow. Only ever called from
 * the admin-only createSyntheticAssessmentSession action (lib/actions/
 * assessmentProcessingAdmin.ts) — this function itself does not check authorization; like every
 * other function in this file, that is the caller's responsibility. Status starts at
 * 'recording', same as a normal session, so the existing capture screen
 * (getOrStartNativeCaptureSession -> getInProgressAssessmentSessionForResident) resumes into it
 * exactly like any other in-progress session — no special-casing needed anywhere in the capture
 * path itself. */
export async function createSyntheticAssessmentSession(input: {
  residentId: string;
  startedBy: string;
  // Resolved by the caller (createSyntheticAssessmentSessionAction, mirroring
  // startAssessmentForNewProspect's identical resolveAssessmentCommunity call
  // — the synthetic session's resident is a fresh provisional record via the
  // same RPC, so the same "no resident/relationship source, fall back to
  // creator's current context" resolution applies unchanged).
  communityId: string | null;
}): Promise<{ session?: AssessmentSessionRecord; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .insert([
      {
        resident_id: input.residentId,
        status: "recording",
        initiated_from: "new_provisional",
        started_by: input.startedBy,
        community_id: input.communityId,
        is_synthetic_test: true,
      },
    ])
    .select("*")
    .single();
  if (error || !data) {
    return { error: `Could not start synthetic assessment session: ${error?.message}` };
  }
  return { session: data as AssessmentSessionRecord };
}

export interface InProgressSessionLookup {
  session: AssessmentSessionRecord | null;
  error?: string;
}

/** The one in-progress ('recording') session for this resident, if any — used to resume a
 * capture screen after a reload rather than trusting a client-supplied session id on its own.
 * Scoping every subsequent lookup by BOTH the resident id (from the URL) and this result is
 * what prevents a user from manufacturing an arbitrary resident/session association by editing
 * the URL — see getAssessmentSessionForResidentOrThrow().
 *
 * CORRECTION (2026-08-25, native-capture resume defect): a real query failure here must never
 * be indistinguishable from "genuinely no in-progress session exists" — the caller previously
 * treated both the same way (a plain `null`), which meant a transient lookup error silently
 * fell through to creating a brand-new session instead of resuming the existing one. That's
 * exactly how a resident ended up with two sessions during a synthetic-pipeline acceptance
 * test: the admin-created synthetic session was still sitting at status='recording', untouched,
 * but a second, non-synthetic session got created alongside it. `{ session, error }` lets the
 * caller (getOrStartNativeCaptureSession) refuse to proceed to session creation on a lookup
 * failure — it surfaces the error instead, rather than silently starting fresh and orphaning
 * whatever session was actually in progress. `error` is only ever a generic, safe-to-display
 * message — never the raw Postgres error text. */
export async function getInProgressAssessmentSessionForResident(residentId: string): Promise<InProgressSessionLookup> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("resident_id", residentId)
    .eq("status", "recording")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getInProgressAssessmentSessionForResident]", { residentId, message: error.message });
    return { session: null, error: "Could not check for an in-progress assessment session — please try again." };
  }
  return { session: data as AssessmentSessionRecord | null };
}

export type CaptureSessionResumeDecision =
  | { kind: "resume"; session: AssessmentSessionRecord }
  | { kind: "create" }
  | { kind: "error"; error: string };

/** Pure decision logic, no I/O — mirrors communityResolution.ts's own split (decide separately
 * from fetch). Given the result of an in-progress-session lookup, decides whether native capture
 * should resume the found session, create a new one, or refuse outright. The entire fix for the
 * 2026-08-25 defect lives in this one function being consulted before any session is ever
 * created: a lookup `error` always yields `"error"`, never `"create"` — the exact distinction
 * the previous code collapsed (both "lookup failed" and "genuinely no session" produced a plain
 * `null`, so a failed lookup silently behaved exactly like "safe to start a new session"). See
 * getOrStartNativeCaptureSession (lib/actions/assessmentCapture.ts) for the only caller. */
export function decideCaptureSessionResume(lookup: InProgressSessionLookup): CaptureSessionResumeDecision {
  if (lookup.error) return { kind: "error", error: lookup.error };
  if (lookup.session) return { kind: "resume", session: lookup.session };
  return { kind: "create" };
}

/** The authorization-critical check every native capture server action must call before
 * touching a session: confirms the session actually belongs to the resident id the caller
 * claims (from the URL), not just that the session id exists at all. Never trust a
 * client-supplied session id without this. */
export async function assertSessionBelongsToResident(assessmentSessionId: string, residentId: string): Promise<boolean> {
  const session = await getAssessmentSession(assessmentSessionId);
  return Boolean(session && session.resident_id === residentId);
}

const CHUNK_UPLOAD_URL_TTL_SECONDS = 120;

/** Mints one short-lived signed upload URL for one audio chunk — mirrors serve-intake-mvp's
 * netlify/functions/intake-audio-chunk-url.js exactly (same bucket, same
 * {session}/{zero-padded-index}.webm path convention, same lazy intake_sources creation on the
 * first chunk, same 120s TTL). The browser only ever receives this narrowly-scoped signed URL —
 * never the service-role credential itself. */
export async function getSignedAudioChunkUploadUrl(input: {
  assessmentSessionId: string;
  chunkIndex: number;
}): Promise<{ uploadUrl?: string; path?: string; error?: string }> {
  const supabase = createServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("intake_assessment_sessions")
    .select("id, status")
    .eq("id", input.assessmentSessionId)
    .single();
  if (sessionError || !session) {
    return { error: "Assessment session not found." };
  }
  if ((session as { status: string }).status !== "recording") {
    return { error: `Session is '${(session as { status: string }).status}', not accepting new audio chunks.` };
  }

  let { data: source } = await supabase
    .from("intake_sources")
    .select("id, status")
    .eq("assessment_session_id", input.assessmentSessionId)
    .eq("source_type", "live_audio_stream")
    .maybeSingle();

  if (!source) {
    const { data: created, error: createError } = await supabase
      .from("intake_sources")
      .insert([
        {
          assessment_session_id: input.assessmentSessionId,
          source_type: "live_audio_stream",
          source_payload: { chunk_count: 0 },
          status: "uploading",
        },
      ])
      .select("id, status")
      .single();
    if (createError || !created) {
      return { error: "Could not initialize audio source." };
    }
    source = created;
  } else if ((source as { status: string }).status !== "uploading") {
    await supabase.from("intake_sources").update({ status: "uploading" }).eq("id", (source as { id: string }).id);
  }

  const objectPath = `${input.assessmentSessionId}/${String(input.chunkIndex).padStart(6, "0")}.webm`;

  const { data: signed, error: signError } = await supabase.storage.from(AUDIO_BUCKET).createSignedUploadUrl(objectPath);
  if (signError || !signed) {
    return { error: "Could not create an upload URL." };
  }

  return { uploadUrl: signed.signedUrl, path: objectPath };
}

export { CHUNK_UPLOAD_URL_TTL_SECONDS };

/** "Finish" for the native path — marks the audio source uploaded and the session
 * 'processing', mirroring intake-finish.js's first half exactly. Unlike the earlier design,
 * this does NOT also trigger transcription/extraction in-process — it only finalizes the
 * upload and marks the session ready for a background worker to pick up (processing_stage =
 * 'transcription_staging', the next pending step; audio_finalization — the step this function
 * itself performs — is already done by the time this returns). See this scope's completion
 * report §4/§5 for why Finish must return promptly rather than awaiting the pipeline. */
export async function finalizeNativeAudioSource(input: {
  assessmentSessionId: string;
  chunkCount: number;
}): Promise<{ sourceId?: string; error?: string }> {
  const supabase = createServerClient();

  const { data: source } = await supabase
    .from("intake_sources")
    .select("id, source_payload")
    .eq("assessment_session_id", input.assessmentSessionId)
    .eq("source_type", "live_audio_stream")
    .maybeSingle();

  if (!source) {
    return { error: "No audio source found for this session." };
  }

  await supabase
    .from("intake_sources")
    .update({
      status: "uploaded",
      source_payload: { ...((source as { source_payload?: Record<string, unknown> }).source_payload ?? {}), chunk_count: input.chunkCount },
    })
    .eq("id", (source as { id: string }).id);

  const { error: sessionError } = await supabase
    .from("intake_assessment_sessions")
    .update({ status: "processing", processing_stage: "transcription_staging", finished_at: new Date().toISOString() })
    .eq("id", input.assessmentSessionId);

  if (sessionError) {
    return { error: "Could not finish the assessment session." };
  }

  return { sourceId: (source as { id: string }).id };
}

// ─── Background processing worker support (Production Assessment Transcription
// Orchestration, 2026-08-15) ─────────────────────────────────────────────────

/** The optimistic-concurrency guard that makes it safe for overlapping/duplicate worker ticks
 * to look at the same session: only the tick whose expectedStage matches the CURRENT row wins
 * the conditional update, so two ticks racing on the same session can never both start a
 * duplicate transcription job or run extraction twice. `expectedStage: null` matches a row
 * whose processing_stage is currently NULL. Returns true only if this call actually won the
 * claim (a row was updated); false means either another tick already claimed it, or the
 * session is no longer in a claimable state (not status='processing', or a different stage than
 * expected) — either way, the caller must treat that as "someone else is handling this, do
 * nothing" rather than proceeding. */
export async function claimAssessmentProcessingStage(input: {
  assessmentSessionId: string;
  expectedStage: string | null;
  nextStage: string;
}): Promise<boolean> {
  const supabase = createServerClient();
  let query = supabase
    .from("intake_assessment_sessions")
    .update({ processing_stage: input.nextStage, processing_stage_entered_at: new Date().toISOString() })
    .eq("id", input.assessmentSessionId)
    .eq("status", "processing");
  query = input.expectedStage === null ? query.is("processing_stage", null) : query.eq("processing_stage", input.expectedStage);
  const { data, error } = await query.select("id");
  if (error) {
    console.error("[claimAssessmentProcessingStage]", { assessmentSessionId: input.assessmentSessionId, message: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** A narrower, second claim path used ONLY to recover a session stuck at
 * processing_stage='transcribing' with no job handle ever persisted — a state that is
 * indistinguishable, by stage name alone, from "another background invocation is legitimately
 * still in the middle of audio assembly / S3 staging / starting the Transcribe job right now."
 * Unlike claimAssessmentProcessingStage (which always requires expectedStage !== nextStage to be
 * a meaningful transition), this one claims 'transcribing' -> 'transcribing' — a same-value
 * "re-lease" — so it additionally requires processing_stage_entered_at to be older than
 * `staleAfterMs`, or null (a defensive fallback for a row from before this column existed).
 * Returns true only if this call itself won the re-lease; false means either the session isn't
 * actually stuck (another invocation is still within its lease window) or it's no longer in a
 * recoverable state at all — either way, the caller must do nothing. */
export async function claimStaleTranscribingStageForRestart(input: {
  assessmentSessionId: string;
  staleAfterMs: number;
}): Promise<boolean> {
  const supabase = createServerClient();
  const cutoffIso = new Date(Date.now() - input.staleAfterMs).toISOString();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .update({ processing_stage: "transcribing", processing_stage_entered_at: nowIso })
    .eq("id", input.assessmentSessionId)
    .eq("status", "processing")
    .eq("processing_stage", "transcribing")
    .or(`processing_stage_entered_at.is.null,processing_stage_entered_at.lt.${cutoffIso}`)
    .select("id");
  if (error) {
    console.error("[claimStaleTranscribingStageForRestart]", { assessmentSessionId: input.assessmentSessionId, message: error.message });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export interface FailedAssessmentSessionRow {
  id: string;
  resident_id: string;
  residentDisplayName: string;
  failure_stage: string | null;
  failure_reason: string | null;
  failed_at: string | null;
}

/** Every assessment session currently sitting in status='failed', with the resident's display
 * name attached — feeds the Today's Work "needs attention" surfacing (see
 * lib/workspace/mapping.ts's mapFailedAssessmentProcessingToWorkItem and lib/data/todaysWork.ts)
 * so a failed background-processing run is visible somewhere a reviewer will actually see it,
 * not just on the specific resident's page someone would need to already be looking at. Two
 * queries rather than a PostgREST embedded join, deliberately — avoids depending on a specific
 * foreign-key relationship name being recognized by Supabase's schema cache. */
export async function getFailedAssessmentSessions(): Promise<FailedAssessmentSessionRow[]> {
  const supabase = createServerClient();
  const { data: sessions, error } = await supabase
    .from("intake_assessment_sessions")
    .select("id, resident_id, failure_stage, failure_reason, failed_at")
    .eq("status", "failed");
  if (error) {
    console.error("[getFailedAssessmentSessions]", { message: error.message });
    return [];
  }
  const rows = (sessions as { id: string; resident_id: string; failure_stage: string | null; failure_reason: string | null; failed_at: string | null }[] | null) ?? [];
  if (rows.length === 0) return [];

  const residentIds = Array.from(new Set(rows.map((r) => r.resident_id)));
  const { data: residents, error: residentsError } = await supabase.from("residents").select("id, display_name").in("id", residentIds);
  if (residentsError) {
    console.error("[getFailedAssessmentSessions] residents lookup", { message: residentsError.message });
  }
  const nameById = new Map(((residents as { id: string; display_name: string }[] | null) ?? []).map((r) => [r.id, r.display_name]));

  return rows.map((r) => ({
    id: r.id,
    resident_id: r.resident_id,
    residentDisplayName: nameById.get(r.resident_id) ?? "Resident",
    failure_stage: r.failure_stage,
    failure_reason: r.failure_reason,
    failed_at: r.failed_at,
  }));
}

/** Every session the background worker should consider on this tick — bounded to `limit` so a
 * single invocation always stays short, oldest-finished-first so no session starves behind a
 * newer one. Deliberately just `status = 'processing'`: every non-terminal processing_stage
 * value (including NULL, immediately after Finish) is eligible; terminal states ('draft',
 * 'needs_review', 'failed', etc.) are excluded by the status filter itself. */
export async function getSessionsEligibleForProcessing(limit: number): Promise<AssessmentSessionRecord[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("status", "processing")
    .order("finished_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    console.error("[getSessionsEligibleForProcessing]", { message: error.message });
    return [];
  }
  return (data as AssessmentSessionRecord[] | null) ?? [];
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

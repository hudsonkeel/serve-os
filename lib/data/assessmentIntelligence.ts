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

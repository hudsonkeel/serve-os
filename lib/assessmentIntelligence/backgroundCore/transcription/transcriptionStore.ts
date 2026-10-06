// Supabase implementation of the transcription store + captured-audio reader. No `server-only`
// (loaded by the Netlify background worker). Reads canonical audio from the private intake-audio
// bucket and never writes or deletes it.
//
// Columns used (all already present in the live database):
//   intake_assessment_sessions.status                'captured' -> 'queued' | 'failed' (conditional)
//   intake_assessment_sessions.processing_claimed_at  transcription lease token while 'captured'
//   intake_assessment_sessions.failure_reason/failed_at  on 'failed' (existing constraint)
//   intake_assessment_sessions.is_synthetic_test      session-scoped synthetic authorization
//   intake_sources.transcription_provider / _job_id / _provider_metadata  durable job state
//   intake_sources.transcript_text                    the canonical transcript (written once)

import { createServerClient } from "../../../supabase/server.ts";
import {
  CAPTURED_SESSION_STATUS,
  INTAKE_AUDIO_BUCKET,
  NATIVE_CAPTURE_ORIGIN,
  parseStoredChunks,
  type StorageObjectInfo,
} from "../../../assessmentCapture/captureLogic.ts";
import type { CapturedAudioReader, NativeAudioSourceRow, TranscriptionSessionRow, TranscriptionStore } from "./transcriptionOrchestrator.ts";
import { TRANSCRIPTION_PROVIDER_ID, type TranscriptionState } from "./transcriptionState.ts";

const QUEUED_STATUS = "queued";
const FAILED_STATUS = "failed";

function nativeOrigin(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && (payload as Record<string, unknown>).capture_origin === NATIVE_CAPTURE_ORIGIN);
}

export function createSupabaseTranscriptionStore(): TranscriptionStore {
  const supabase = createServerClient();
  return {
    async getSession(sessionId) {
      const { data, error } = await supabase.from("intake_assessment_sessions").select("*").eq("id", sessionId).maybeSingle();
      if (error || !data) return null;
      const row = data as { id: string; status: string; is_synthetic_test?: boolean | null };
      return { id: row.id, status: row.status, isSyntheticTest: row.is_synthetic_test === true } satisfies TranscriptionSessionRow;
    },

    async claimLease(sessionId, tokenIso, staleBeforeIso) {
      const { data, error } = await supabase
        .from("intake_assessment_sessions")
        .update({ processing_claimed_at: tokenIso })
        .eq("id", sessionId)
        .eq("status", CAPTURED_SESSION_STATUS)
        .or(`processing_claimed_at.is.null,processing_claimed_at.lt.${staleBeforeIso}`)
        .select("id");
      if (error) {
        console.error("[transcription.claimLease]", { sessionId, message: error.message });
        return false;
      }
      return (data?.length ?? 0) > 0;
    },

    async releaseLease(sessionId, tokenIso) {
      await supabase.from("intake_assessment_sessions").update({ processing_claimed_at: null }).eq("id", sessionId).eq("processing_claimed_at", tokenIso);
    },

    async getNativeAudioSource(sessionId) {
      const { data, error } = await supabase
        .from("intake_sources")
        .select("id, transcript_text, source_payload, transcription_provider_metadata")
        .eq("assessment_session_id", sessionId)
        .eq("source_type", "live_audio_stream");
      if (error) throw new Error(`Could not read the audio source: ${error.message}`);
      const rows = (data as { id: string; transcript_text: string | null; source_payload: Record<string, unknown> | null; transcription_provider_metadata: unknown }[] | null) ?? [];
      const native = rows.find((r) => nativeOrigin(r.source_payload));
      if (!native) return null;
      return { id: native.id, transcriptText: native.transcript_text, payload: native.source_payload, metadata: native.transcription_provider_metadata } satisfies NativeAudioSourceRow;
    },

    async saveState(sourceId, state: TranscriptionState) {
      const { error } = await supabase
        .from("intake_sources")
        .update({ transcription_provider: TRANSCRIPTION_PROVIDER_ID, transcription_job_id: state.batchId, transcription_provider_metadata: state })
        .eq("id", sourceId);
      if (error) throw new Error(`Could not save transcription state: ${error.message}`);
    },

    async persistTranscript(sourceId, text) {
      const { data, error } = await supabase.from("intake_sources").update({ transcript_text: text }).eq("id", sourceId).is("transcript_text", null).select("id");
      if (error) throw new Error(`Could not save the transcript: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async queueForExtraction(sessionId) {
      const { data, error } = await supabase
        .from("intake_assessment_sessions")
        .update({ status: QUEUED_STATUS })
        .eq("id", sessionId)
        .eq("status", CAPTURED_SESSION_STATUS)
        .select("id");
      if (error) throw new Error(`Could not queue the assessment: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async failTranscription(sessionId, reason) {
      const { data, error } = await supabase
        .from("intake_assessment_sessions")
        .update({ status: FAILED_STATUS, failure_reason: reason.slice(0, 500), failed_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("status", CAPTURED_SESSION_STATUS)
        .select("id");
      if (error) {
        console.error("[transcription.failTranscription]", { sessionId, message: error.message });
        return false;
      }
      return (data?.length ?? 0) > 0;
    },
  };
}

export function createSupabaseCapturedAudioReader(): CapturedAudioReader {
  const supabase = createServerClient();
  return {
    async listChunks(sessionId) {
      const objects: StorageObjectInfo[] = [];
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase.storage
          .from(INTAKE_AUDIO_BUCKET)
          .list(sessionId, { limit: 1000, offset: page * 1000, sortBy: { column: "name", order: "asc" } });
        if (error || !data) return { chunks: [], error: "Could not read stored audio for this assessment." };
        for (const entry of data as { name: string; id: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null }[]) {
          if (!entry.id) continue;
          const size = entry.metadata?.size;
          const mime = entry.metadata?.mimetype;
          objects.push({ name: entry.name, size: typeof size === "number" ? size : null, mimeType: typeof mime === "string" ? mime : null, createdAt: entry.created_at ?? null });
        }
        if (data.length < 1000) break;
      }
      return { chunks: parseStoredChunks(objects).chunks };
    },

    async download(sessionId, chunkName) {
      const { data, error } = await supabase.storage.from(INTAKE_AUDIO_BUCKET).download(`${sessionId}/${chunkName}`);
      if (error || !data) throw new Error(`Could not download audio chunk ${chunkName}.`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

/** Captured sessions a dispatcher may hand to the worker for transcription, per the AWS PHI
 * dispatch scope: none at all unless authorized; only attested synthetic sessions in synthetic
 * test mode. Oldest-finished first. */
export async function getTranscriptionDispatchCandidates(limit: number, scope: "all_captured" | "synthetic_only" | "none"): Promise<string[]> {
  if (scope === "none" || limit <= 0) return [];
  const supabase = createServerClient();
  let query = supabase.from("intake_assessment_sessions").select("id").eq("status", CAPTURED_SESSION_STATUS);
  if (scope === "synthetic_only") query = query.eq("is_synthetic_test", true);
  const { data, error } = await query.order("finished_at", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) {
    console.error("[getTranscriptionDispatchCandidates]", { message: error.message });
    return [];
  }
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/** Sessions whose temporary AWS transcription artifacts still need cleanup. */
export async function getTranscriptionCleanupCandidates(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .select("assessment_session_id")
    .eq("transcription_provider", TRANSCRIPTION_PROVIDER_ID)
    .eq("transcription_provider_metadata->cleanup->>status", "pending")
    .limit(limit);
  if (error) {
    console.error("[getTranscriptionCleanupCandidates]", { message: error.message });
    return [];
  }
  return ((data as { assessment_session_id: string }[] | null) ?? []).map((r) => r.assessment_session_id);
}

/** Operator retry for a session that failed during TRANSCRIPTION: failed -> captured (failure
 * fields cleared, as the existing constraint requires), with failed runs reset to a new attempt.
 * Never moves an audio-only session to 'queued'. */
export async function restoreCapturedForTranscriptionRetry(sessionId: string, sourceId: string, resetState: TranscriptionState | null): Promise<boolean> {
  const supabase = createServerClient();
  if (resetState) {
    const { error } = await supabase
      .from("intake_sources")
      .update({ transcription_provider_metadata: resetState, transcription_job_id: resetState.batchId, transcription_provider: TRANSCRIPTION_PROVIDER_ID })
      .eq("id", sourceId);
    if (error) return false;
  }
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .update({ status: CAPTURED_SESSION_STATUS, failure_reason: null, failed_at: null, processing_claimed_at: null })
    .eq("id", sessionId)
    .eq("status", FAILED_STATUS)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Whether a session's assessment content came from audio (any live_audio_stream source) — the
 * extraction gate applies the AWS-only policy to these. */
export async function sessionHasLiveAudioSource(sessionId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("intake_sources").select("id").eq("assessment_session_id", sessionId).eq("source_type", "live_audio_stream").limit(1);
  if (error) throw new Error(`Could not determine the assessment's source type: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

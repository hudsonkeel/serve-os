import "server-only";
import { createServerClient } from "../supabase/server.ts";
import type { CommunityQueryFilter } from "../auth/communityScope.ts";
import {
  CAPTURED_SESSION_STATUS,
  RECORDING_SESSION_STATUS,
  INTAKE_AUDIO_BUCKET,
  NATIVE_CAPTURE_ORIGIN,
  NATIVE_CAPTURE_VERSION,
  CHUNK_DOWNLOAD_URL_TTL_SECONDS,
  parseStoredChunks,
  type CaptureSessionLookup,
  type CapturedAudioSummary,
  type FinalizeManifestEntry,
  type StorageObjectInfo,
  type StoredChunk,
} from "../assessmentCapture/captureLogic.ts";
import type { ContinuitySummary, RunLogEntry } from "../assessmentCapture/recordingHealth.ts";
import {
  parseTranscriptionState,
  transcriptionDisplayState,
  type TranscriptionDisplayState,
} from "../assessmentIntelligence/backgroundCore/transcription/transcriptionState.ts";

// Data access for Assessment Mobile Capture v0.1 (native in-browser capture). Deliberately a
// separate module from lib/data/assessmentIntelligence.ts: nothing here participates in the
// asynchronous processing queue, and nothing here can write status 'queued' — the only status
// transitions are the initial insert ('recording') and finalizeNativeCaptureSession()
// ('recording' -> 'captured'). Authorization is the caller's job (lib/actions/
// nativeAssessmentCapture.ts), matching every other lib/data module.
//
// Native sessions are identified by their live_audio_stream intake_sources row carrying
// source_payload.capture_origin = NATIVE_CAPTURE_ORIGIN, written at session creation. Any other
// 'recording' session (e.g. the existing external capture flow's) is never resumed, written to,
// or otherwise touched by this module.

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 20;

/** Light, SQL-first community scope check with the same semantics as getCommunityResidentById()
 * (lib/data/communityMetrics.ts) — without that function's relationship/contact loading, since
 * this runs on every chunk upload. */
export async function isResidentInCaptureScope(residentId: string, filter: CommunityQueryFilter): Promise<boolean> {
  if (filter.mode === "none") return false;
  const supabase = createServerClient();
  let query = supabase.from("residents").select("id").eq("id", residentId);
  if (filter.mode === "single") query = query.eq("community_id", filter.communityId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[isResidentInCaptureScope]", { residentId, message: error.message });
    return false;
  }
  return Boolean(data);
}

interface LiveAudioSourceRow {
  id: string;
  assessment_session_id: string;
  status: string;
  source_payload: Record<string, unknown> | null;
}

function isNativePayload(payload: Record<string, unknown> | null | undefined): boolean {
  return Boolean(payload && payload.capture_origin === NATIVE_CAPTURE_ORIGIN);
}

/** Every 'recording' session for this resident, each tagged native or not. A query failure is
 * returned as `error` — never collapsed into "no sessions", which would let the caller create a
 * duplicate session (see decideCaptureSessionResume()). */
export async function lookupRecordingSessionsForResident(residentId: string): Promise<CaptureSessionLookup> {
  const supabase = createServerClient();
  const { data: sessions, error } = await supabase
    .from("intake_assessment_sessions")
    .select("id, started_at")
    .eq("resident_id", residentId)
    .eq("status", RECORDING_SESSION_STATUS);
  if (error) {
    console.error("[lookupRecordingSessionsForResident] sessions", { residentId, message: error.message });
    return { sessions: [], error: "Could not check for an in-progress assessment — please try again." };
  }
  const rows = (sessions as { id: string; started_at: string }[] | null) ?? [];
  if (rows.length === 0) return { sessions: [] };

  const { data: sources, error: sourcesError } = await supabase
    .from("intake_sources")
    .select("assessment_session_id, source_payload")
    .in("assessment_session_id", rows.map((r) => r.id))
    .eq("source_type", "live_audio_stream");
  if (sourcesError) {
    console.error("[lookupRecordingSessionsForResident] sources", { residentId, message: sourcesError.message });
    return { sessions: [], error: "Could not check for an in-progress assessment — please try again." };
  }
  const nativeIds = new Set(
    ((sources as { assessment_session_id: string; source_payload: Record<string, unknown> | null }[] | null) ?? [])
      .filter((s) => isNativePayload(s.source_payload))
      .map((s) => s.assessment_session_id)
  );
  return {
    sessions: rows.map((r) => ({ id: r.id, startedAt: r.started_at, isNativeCapture: nativeIds.has(r.id) })),
  };
}

export interface NativeCaptureSessionState {
  id: string;
  residentId: string;
  status: string;
  isNativeCapture: boolean;
  sourceId: string | null;
  sourcePayload: Record<string, unknown> | null;
  isSyntheticTest: boolean;
  transcriptPersisted: boolean;
  /** Raw transcription_provider_metadata (parsed by backgroundCore/transcription). */
  transcriptionState: unknown;
}

export async function getNativeCaptureSessionState(
  assessmentSessionId: string
): Promise<{ session: NativeCaptureSessionState | null; error?: string }> {
  const supabase = createServerClient();
  const { data: session, error } = await supabase
    .from("intake_assessment_sessions")
    .select("*")
    .eq("id", assessmentSessionId)
    .maybeSingle();
  if (error) {
    console.error("[getNativeCaptureSessionState] session", { assessmentSessionId, message: error.message });
    return { session: null, error: "Could not load the assessment session." };
  }
  if (!session) return { session: null };
  const { data: source, error: sourceError } = await supabase
    .from("intake_sources")
    .select("id, assessment_session_id, status, source_payload, transcript_text, transcription_provider_metadata")
    .eq("assessment_session_id", assessmentSessionId)
    .eq("source_type", "live_audio_stream")
    .maybeSingle();
  if (sourceError) {
    console.error("[getNativeCaptureSessionState] source", { assessmentSessionId, message: sourceError.message });
    return { session: null, error: "Could not load the assessment audio source." };
  }
  const src = source as (LiveAudioSourceRow & { transcript_text: string | null; transcription_provider_metadata: unknown }) | null;
  const s = session as { id: string; resident_id: string; status: string; is_synthetic_test?: boolean | null };
  return {
    session: {
      id: s.id,
      residentId: s.resident_id,
      status: s.status,
      isNativeCapture: isNativePayload(src?.source_payload),
      sourceId: src?.id ?? null,
      sourcePayload: src?.source_payload ?? null,
      isSyntheticTest: s.is_synthetic_test === true,
      transcriptPersisted: Boolean(src?.transcript_text?.trim()),
      transcriptionState: src?.transcription_provider_metadata ?? null,
    },
  };
}

/** Marks ONE finished native recording as a synthetic (fictional, non-PHI) test — the only
 * write path for is_synthetic_test. Records who attested and when in source_payload first, then
 * flips the flag, conditional on the session still being 'captured' (before transcription). */
export async function markNativeSessionSyntheticTest(input: {
  assessmentSessionId: string;
  sourceId: string;
  existingPayload: Record<string, unknown> | null;
  attestedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerClient();
  const attestation = {
    attested_by: input.attestedBy,
    attested_at: new Date().toISOString(),
    statement: "This recording is a fictional role-play containing no real client information.",
  };
  const { error: payloadError } = await supabase
    .from("intake_sources")
    .update({ source_payload: { ...(input.existingPayload ?? {}), synthetic_test_attestation: attestation } })
    .eq("id", input.sourceId);
  if (payloadError) return { ok: false, error: "Could not record the synthetic-test attestation." };
  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .update({ is_synthetic_test: true })
    .eq("id", input.assessmentSessionId)
    .eq("status", CAPTURED_SESSION_STATUS)
    .select("id");
  if (error || (data?.length ?? 0) === 0) return { ok: false, error: "The assessment is no longer awaiting transcription; it was not marked." };
  return { ok: true };
}

/** Operator-facing transcription progress for the sessions in an Assessment History list. */
export async function getTranscriptionDisplayStates(sessionIds: readonly string[]): Promise<Record<string, TranscriptionDisplayState>> {
  if (sessionIds.length === 0) return {};
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("intake_sources")
    .select("assessment_session_id, source_payload, transcript_text, transcription_provider_metadata")
    .in("assessment_session_id", [...sessionIds])
    .eq("source_type", "live_audio_stream");
  if (error) {
    console.error("[getTranscriptionDisplayStates]", { message: error.message });
    return {};
  }
  const out: Record<string, TranscriptionDisplayState> = {};
  for (const row of (data as { assessment_session_id: string; source_payload: Record<string, unknown> | null; transcript_text: string | null; transcription_provider_metadata: unknown }[] | null) ?? []) {
    if (!isNativePayload(row.source_payload)) continue;
    out[row.assessment_session_id] = transcriptionDisplayState({
      state: parseTranscriptionState(row.transcription_provider_metadata),
      transcriptPersisted: Boolean(row.transcript_text?.trim()),
    });
  }
  return out;
}

/** Creates a new 'recording' session plus its native live_audio_stream source (the marker that
 * makes it resumable by native capture). Never writes 'queued'. If the source insert fails twice
 * the session is left as-is (status 'recording', no native marker, no audio) and an error is
 * returned — it is then treated like any non-native session: never resumed or written to. The
 * assessor's next Start creates a fresh native session. */
export async function createNativeCaptureSession(input: {
  residentId: string;
  startedBy: string;
  communityId: string | null;
}): Promise<{ sessionId?: string; error?: string }> {
  const supabase = createServerClient();
  const { data: session, error } = await supabase
    .from("intake_assessment_sessions")
    .insert([
      {
        resident_id: input.residentId,
        status: RECORDING_SESSION_STATUS,
        initiated_from: "existing_person",
        started_by: input.startedBy,
        community_id: input.communityId,
      },
    ])
    .select("id")
    .single();
  if (error || !session) {
    console.error("[createNativeCaptureSession] session", { message: error?.message });
    return { error: "Could not start the assessment session." };
  }
  const sessionId = (session as { id: string }).id;
  const sourceRow = {
    assessment_session_id: sessionId,
    source_type: "live_audio_stream",
    status: "pending",
    source_payload: {
      capture_origin: NATIVE_CAPTURE_ORIGIN,
      capture_version: NATIVE_CAPTURE_VERSION,
      started_at: new Date().toISOString(),
    },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error: sourceError } = await supabase.from("intake_sources").insert([sourceRow]);
    if (!sourceError) return { sessionId };
    console.error("[createNativeCaptureSession] source", { sessionId, attempt, message: sourceError.message });
  }
  return { error: "Could not initialize audio storage for this assessment. Use a different test record and try again." };
}

function toStorageObjectInfo(entry: {
  name: string;
  id: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}): StorageObjectInfo | null {
  if (!entry.id) return null; // folder placeholder, not an object
  const size = entry.metadata?.size;
  const mimeType = entry.metadata?.mimetype;
  return {
    name: entry.name,
    size: typeof size === "number" ? size : null,
    mimeType: typeof mimeType === "string" ? mimeType : null,
    createdAt: entry.created_at ?? null,
  };
}

/** Every object stored for a session, parsed. A storage error is returned as `error`, never as an
 * empty list — an empty list would make the next chunk index restart at 0. */
export async function listStoredChunksForSession(
  assessmentSessionId: string,
  search?: string
): Promise<{ chunks: StoredChunk[]; unrecognized: string[]; error?: string }> {
  const supabase = createServerClient();
  const objects: StorageObjectInfo[] = [];
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const { data, error } = await supabase.storage.from(INTAKE_AUDIO_BUCKET).list(assessmentSessionId, {
      limit: LIST_PAGE_SIZE,
      offset: page * LIST_PAGE_SIZE,
      sortBy: { column: "name", order: "asc" },
      ...(search ? { search } : {}),
    });
    if (error || !data) {
      console.error("[listStoredChunksForSession]", { assessmentSessionId, message: error?.message });
      return { chunks: [], unrecognized: [], error: "Could not read stored audio for this assessment." };
    }
    for (const entry of data) {
      const info = toStorageObjectInfo(entry as unknown as Parameters<typeof toStorageObjectInfo>[0]);
      if (info) objects.push(info);
    }
    if (data.length < LIST_PAGE_SIZE) break;
  }
  return parseStoredChunks(objects);
}

/** A fresh, short-lived signed upload URL for one chunk object. Never requests upsert: an object
 * already at this path is rejected by storage, never overwritten. */
export async function createChunkSignedUploadUrl(path: string): Promise<{ signedUrl?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage.from(INTAKE_AUDIO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[createChunkSignedUploadUrl]", { message: error?.message });
    return { error: "Could not create an upload URL." };
  }
  return { signedUrl: data.signedUrl };
}

/** pending -> uploading on the first chunk; a no-op afterwards. */
export async function markNativeSourceUploading(sourceId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("intake_sources")
    .update({ status: "uploading" })
    .eq("id", sourceId)
    .eq("status", "pending");
  if (error) console.error("[markNativeSourceUploading]", { sourceId, message: error.message });
}

/** The one transition out of 'recording' for a native session: source -> 'uploaded' with capture
 * metadata, then session 'recording' -> 'captured' + finished_at, conditional on the session still
 * being 'recording' (a concurrent/double Finish loses harmlessly). Status 'queued' is never
 * written here or anywhere in native capture. */
export async function finalizeNativeCaptureSession(input: {
  assessmentSessionId: string;
  sourceId: string;
  existingPayload: Record<string, unknown> | null;
  summary: CapturedAudioSummary;
  manifest: readonly FinalizeManifestEntry[];
  runLog: readonly RunLogEntry[];
  continuity: ContinuitySummary;
}): Promise<{ status?: typeof CAPTURED_SESSION_STATUS; error?: string }> {
  const supabase = createServerClient();
  const finalizedAt = new Date().toISOString();
  const recordedAts = input.manifest.map((m) => m.recordedAt).filter((t) => Number.isFinite(t));
  const payload = {
    ...(input.existingPayload ?? {}),
    capture_origin: NATIVE_CAPTURE_ORIGIN,
    capture_version: NATIVE_CAPTURE_VERSION,
    finalized_at: finalizedAt,
    chunk_count: input.summary.chunkCount,
    total_bytes: input.summary.totalBytes,
    mime_types: input.summary.mimeTypes,
    run_count: input.summary.runCount,
    runs: input.summary.runs,
    chunk_indexes: input.summary.chunkIndexes,
    gaps: input.summary.gaps,
    finishing_device_chunks: input.manifest.map((m) => ({
      chunk_index: m.chunkIndex,
      run_id: m.runId,
      mime_type: m.mimeType,
      bytes: m.size,
      recorded_at: new Date(m.recordedAt).toISOString(),
    })),
    first_recorded_at: recordedAts.length ? new Date(Math.min(...recordedAts)).toISOString() : null,
    last_recorded_at: recordedAts.length ? new Date(Math.max(...recordedAts)).toISOString() : null,
    // Resilience hardening: whether this was one continuous capture, and if not, every recorder
    // run with when/why it ended (reason only where the browser distinguished one) and the
    // measured gaps between runs. Lives in the existing source_payload JSON — no schema change.
    capture_continuity: input.continuity.continuity,
    interruption_count: input.continuity.interruptionCount,
    interruptions: input.continuity.interruptions.map((i) => ({ run_id: i.runId, reason: i.reason, at: new Date(i.at).toISOString() })),
    gaps_between_runs_ms: input.continuity.gapsBetweenRunsMs,
    run_log: input.runLog.map((r) => ({
      run_id: r.runId,
      started_at: new Date(r.startedAt).toISOString(),
      ended_at: r.endedAt === null ? null : new Date(r.endedAt).toISOString(),
      end_reason: r.endReason,
    })),
  };

  const { error: sourceError } = await supabase
    .from("intake_sources")
    .update({ status: "uploaded", source_payload: payload })
    .eq("id", input.sourceId);
  if (sourceError) {
    console.error("[finalizeNativeCaptureSession] source", { message: sourceError.message });
    return { error: "Could not finalize the recorded audio." };
  }

  const { data, error } = await supabase
    .from("intake_assessment_sessions")
    .update({ status: CAPTURED_SESSION_STATUS, finished_at: finalizedAt })
    .eq("id", input.assessmentSessionId)
    .eq("status", RECORDING_SESSION_STATUS)
    .select("id");
  if (error) {
    console.error("[finalizeNativeCaptureSession] session", { message: error.message });
    return { error: "Could not finish the assessment session." };
  }
  if ((data?.length ?? 0) > 0) return { status: CAPTURED_SESSION_STATUS };

  // Lost the conditional update — idempotent success only if it is already captured.
  const { session } = await getNativeCaptureSessionState(input.assessmentSessionId);
  if (session?.status === CAPTURED_SESSION_STATUS) return { status: CAPTURED_SESSION_STATUS };
  return { error: "The assessment session changed while finishing — reload and try again." };
}

export async function createChunkDownloadUrls(
  paths: readonly string[]
): Promise<{ urls?: { path: string; signedUrl: string }[]; error?: string }> {
  if (paths.length === 0) return { urls: [] };
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(INTAKE_AUDIO_BUCKET)
    .createSignedUrls([...paths], CHUNK_DOWNLOAD_URL_TTL_SECONDS, { download: true });
  if (error || !data) {
    console.error("[createChunkDownloadUrls]", { message: error?.message });
    return { error: "Could not create download links." };
  }
  return {
    urls: data
      .filter((d) => d.signedUrl && d.path)
      .map((d) => ({ path: d.path as string, signedUrl: d.signedUrl as string })),
  };
}

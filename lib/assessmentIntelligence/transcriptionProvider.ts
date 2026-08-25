// The provider-neutral transcription boundary — mirrors extractionProvider.ts's shape
// deliberately, so the two provider families (transcription, extraction) read as one
// consistent pattern rather than two independently-invented ones. Provider-specific request/
// response shapes (OpenAI's audio.transcriptions envelope, AWS Transcribe's job-polling
// envelope) never leak past the provider's own module.
//
// PHI governance is NOT part of this interface — it stays where it already lives
// (phiGovernance.ts), called by the caller before a provider is ever invoked, exactly as today.
// A provider implementation must never decide for itself whether it's allowed to run — though
// every provider re-asserts the gate defensively too, same belt-and-suspenders discipline as
// before.
//
// SHAPE DECISION (2026-08-15, Production Assessment Transcription Orchestration): this
// interface is deliberately TWO-PHASE (start / check) rather than a single synchronous call
// that returns finished text. AWS Transcribe's batch API has no synchronous "bytes in, text
// out" call — StartTranscriptionJob returns immediately and the job completes independently,
// sometime later. A single-call interface would force either (a) polling to completion INSIDE
// the call — exactly the in-request-polling design this scope exists to remove — or (b) an
// AWS-shaped interface that OpenAI's genuinely-synchronous API would have to fake around.
// Two phases lets each provider be honest about its own shape: startTranscription() returns
// `status: "completed"` immediately for a synchronous provider (OpenAI) or `status: "pending"`
// plus a resumable handle for an asynchronous one (AWS); checkTranscription() is only ever
// called for a handle still pending, and does exactly ONE non-blocking status check — no sleep,
// no loop, safe to call from a single short-lived worker tick.

export interface TranscribedSegment {
  text: string;
  chunkIndex: number;
  sourcePath: string;
}

export interface TranscriptionProviderResult {
  segments: TranscribedSegment[];
  /** Which provider produced this result — e.g. "openai", "aws-transcribe". Never inferred. */
  provider: string;
  /** The exact model/service identifier used, e.g. "gpt-4o-transcribe" or
   * "aws-transcribe:en-US". */
  modelId: string;
  failedChunks: { path: string; error: string }[];
}

export interface AudioChunkInput {
  path: string;
  bytes: ArrayBuffer;
  mimeType: string;
}

// Every provider gates its own PHI check internally, defensively, in addition to the
// orchestrator checking before it even selects a provider — same belt-and-suspenders discipline
// phiGovernance.ts's existing OpenAI gate already uses. gateOverride carries the synthetic-test
// escape hatch through; it is never set by any production code path.
export interface TranscriptionGateOverride {
  syntheticTestOverride?: boolean;
}

/** A resumable reference to an in-flight (or already-complete) transcription job. Persisted
 * verbatim (providerId -> transcription_provider, jobId -> transcription_job_id, metadata ->
 * transcription_provider_metadata) by the caller between worker ticks — see
 * lib/data/assessmentIntelligence.ts's persistTranscriptionJobHandle(). Never interpreted by
 * the caller; only ever round-tripped back into the SAME provider's checkTranscription(). */
export interface TranscriptionJobHandle {
  providerId: string;
  jobId: string;
  metadata?: Record<string, unknown>;
}

export interface TranscriptionStartOutcome {
  handle: TranscriptionJobHandle;
  status: "completed" | "pending";
  /** Present only when status === "completed". */
  result?: TranscriptionProviderResult;
}

export interface TranscriptionStatusOutcome {
  status: "pending" | "completed" | "failed";
  /** Present only when status === "completed". */
  result?: TranscriptionProviderResult;
  /** Present only when status === "failed". */
  error?: string;
}

export interface AssessmentTranscriptionProvider {
  readonly providerId: string;
  readonly modelId: string;

  /** Begins transcribing a full set of already-uploaded audio chunks for one assessment.
   * A synchronous provider does the real work here and returns `status: "completed"` with the
   * result attached. An asynchronous provider stages/starts external work and returns
   * `status: "pending"` with a handle the caller persists and later passes to
   * checkTranscription(). MUST throw for a genuine provider-level failure (auth failure,
   * network error, staging failure) that prevents any attempt at all, or for the PHI gate being
   * unconfirmed — callers must not catch a thrown error here and silently retry against a
   * different provider. Real PHI must never be rerouted to a fallback provider as a
   * convenience. */
  startTranscription(
    chunks: AudioChunkInput[],
    gateOverride?: TranscriptionGateOverride
  ): Promise<TranscriptionStartOutcome>;

  /** A single, non-blocking check of a previously-started job's status — no internal sleep or
   * retry loop. Called once per worker tick for a session still in the "transcribing" stage.
   * Only ever called with a handle this SAME provider produced from startTranscription(); a
   * provider never needs to validate providerId itself, callers only route a handle to the
   * provider it names. */
  checkTranscription(
    handle: TranscriptionJobHandle,
    gateOverride?: TranscriptionGateOverride
  ): Promise<TranscriptionStatusOutcome>;
}

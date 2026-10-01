// Production wiring for the transcription step runner (background-safe; no `server-only`).

import { decideAwsAssessmentAuthorization } from "../../phiGovernance.ts";
import { createAwsTranscriptionBackend } from "./awsTranscribeBackend.ts";
import {
  advanceTranscription,
  retryTranscriptionCleanup,
  DEFAULT_TRANSCRIPTION_TIMINGS,
  type TranscriptionBackend,
  type TranscriptionDeps,
  type TranscriptionOutcome,
} from "./transcriptionOrchestrator.ts";
import { createSupabaseCapturedAudioReader, createSupabaseTranscriptionStore } from "./transcriptionStore.ts";

function productionDeps(): TranscriptionDeps {
  let backend: TranscriptionBackend | null = null;
  return {
    store: createSupabaseTranscriptionStore(),
    audio: createSupabaseCapturedAudioReader(),
    backend: () => (backend ??= createAwsTranscriptionBackend()),
    authorize: (session) => decideAwsAssessmentAuthorization(session),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...DEFAULT_TRANSCRIPTION_TIMINGS,
  };
}

export function advanceCapturedAssessmentTranscription(assessmentSessionId: string): Promise<TranscriptionOutcome> {
  return advanceTranscription(productionDeps(), assessmentSessionId);
}

export function retryCapturedAssessmentTranscriptionCleanup(assessmentSessionId: string) {
  return retryTranscriptionCleanup(productionDeps(), assessmentSessionId);
}

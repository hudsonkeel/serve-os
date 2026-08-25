"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import type { AuthRole } from "@/lib/auth/constants";
import {
  createNativeAssessmentSession,
  getInProgressAssessmentSessionForResident,
  assertSessionBelongsToResident,
  getSignedAudioChunkUploadUrl,
  finalizeNativeAudioSource,
  getAssessmentSessionWithFailureState,
  getAudioSourceForSession,
} from "@/lib/data/assessmentIntelligence";

// Entry point into the Serve Intake Engine's voice/mobile capture experience — distinct
// from lib/actions/intakeEngine.ts (the website-form Intake Intelligence Engine; see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md). This is the "Capture Assessment" action
// from an existing canonical Serve person's profile, per serve-intake-mvp's
// docs/architecture/phase3-mobile-person-first-architecture.md §2 (2026-08-10 revision):
// mints a single-use, opaque handoff code via the create_intake_handoff_code() RPC
// (serve-intake-mvp's supabase/... migration, applied to this same Supabase project) and
// returns a capture URL carrying only that opaque code — never resident identity or actor
// claims in the URL itself.

export interface StartAssessmentCaptureResult {
  captureUrl?: string;
  error?: string;
}

export async function startAssessmentCapture(
  residentId: string
): Promise<StartAssessmentCaptureResult> {
  if (!residentId) {
    return { error: "Missing resident." };
  }

  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to start an assessment." };
  }

  const intakeBaseUrl = process.env.NEXT_PUBLIC_SERVE_INTAKE_URL;
  if (!intakeBaseUrl) {
    return { error: "Serve Intake is not configured (NEXT_PUBLIC_SERVE_INTAKE_URL is unset)." };
  }

  const actor = profile.full_name || profile.email;
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("create_intake_handoff_code", {
    p_resident_id: residentId,
    p_actor: actor,
  });

  if (error) {
    return { error: `Could not start assessment capture: ${error.message}` };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const code = row?.code as string | undefined;

  if (!code) {
    return { error: "Could not start assessment capture: no handoff code returned." };
  }

  const captureUrl = new URL("/capture", intakeBaseUrl);
  captureUrl.searchParams.set("code", code);

  return { captureUrl: captureUrl.toString() };
}

// ─── Native Serve OS capture (2026-08-15 architecture decision) ───────────────────────────
// The person-level "Assessment" button now opens app/residents/[id]/assessment/capture instead
// of window.open()-ing the above external URL. startAssessmentCapture()/AssessmentCaptureButton
// above are UNCHANGED and remain reachable directly (the external serve-intake.netlify.app
// deployment stays live as the reference/fallback implementation, per explicit instruction) —
// nothing here deletes or disables that path.
//
// Every function below re-derives the authenticated actor and re-verifies resident/session
// ownership itself — never trusts a client-supplied session id in isolation. This is what makes
// "a user cannot manufacture an arbitrary resident/session association by editing the URL" true:
// the URL supplies a resident id, and every subsequent action checks the target session actually
// belongs to THAT resident id, not just that the session id exists at all.

async function requireCaptureActor(): Promise<{ label: string; role: AuthRole | null } | null> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return null;
  const label = profile.full_name || profile.email;
  if (!label) return null;
  return { label, role: profile.role ?? null };
}

export interface NativeCaptureSession {
  assessmentSessionId: string;
  nextChunkIndex: number;
  elapsedSecondsAtPause: number;
}

/** Starts a new recording session, or resumes the one already-in-progress session for this
 * resident if one exists (mirrors serve-intake-mvp's own "resume rather than silently start a
 * second session" behavior) — called on page load, not from a button click. */
export async function getOrStartNativeCaptureSession(residentId: string): Promise<{ session?: NativeCaptureSession; error?: string }> {
  const actor = await requireCaptureActor();
  if (!actor) return { error: "You must be signed in to start an assessment." };
  if (!canEditResidentProfile(actor.role)) {
    return { error: "You do not have permission to capture an assessment for this resident." };
  }

  const existing = await getInProgressAssessmentSessionForResident(residentId);
  if (existing) {
    const source = await getAudioSourceForSession(existing.id);
    const chunkCount = ((source as unknown as { source_payload?: { chunk_count?: number } })?.source_payload?.chunk_count ?? 0) as number;
    return { session: { assessmentSessionId: existing.id, nextChunkIndex: chunkCount, elapsedSecondsAtPause: 0 } };
  }

  const { session, error } = await createNativeAssessmentSession({ residentId, startedBy: actor.label });
  if (error || !session) return { error: error ?? "Could not start assessment capture." };

  return { session: { assessmentSessionId: session.id, nextChunkIndex: 0, elapsedSecondsAtPause: 0 } };
}

export async function getSignedAudioChunkUploadUrlAction(input: {
  residentId: string;
  assessmentSessionId: string;
  chunkIndex: number;
}): Promise<{ uploadUrl?: string; path?: string; error?: string }> {
  const actor = await requireCaptureActor();
  if (!actor) return { error: "You must be signed in." };

  const belongs = await assertSessionBelongsToResident(input.assessmentSessionId, input.residentId);
  if (!belongs) return { error: "Session not found for this resident." };

  return getSignedAudioChunkUploadUrl({ assessmentSessionId: input.assessmentSessionId, chunkIndex: input.chunkIndex });
}

export interface FinishNativeCaptureResult {
  error?: string;
  status?: string;
}

/** "Finish Assessment" for the native path. Finalizes the audio source/session (mirrors
 * intake-finish.js's first half) and returns immediately — it does NOT transcribe or extract
 * anything itself (2026-08-15 architecture decision, Production Assessment Transcription
 * Orchestration). finalizeNativeAudioSource() marks the session 'processing' at the
 * 'transcription_staging' stage; a scheduled background worker
 * (netlify/functions/assessment-processing-worker.ts) independently discovers and advances any
 * session sitting in that state — Finish never needs to know how or when that happens. This is
 * what makes it safe for the user to lock their phone or navigate away the moment they see the
 * confirmation: the recording is already durably uploaded (by the time Finish is even called,
 * every chunk has drained from IndexedDB — see CaptureScreen.tsx's upload-drain loop), and
 * everything after that point is entirely the background worker's responsibility, not the
 * browser's. */
export async function finishNativeAssessmentCaptureAction(input: {
  residentId: string;
  assessmentSessionId: string;
  chunkCount: number;
}): Promise<FinishNativeCaptureResult> {
  const actor = await requireCaptureActor();
  if (!actor) return { error: "You must be signed in." };

  const belongs = await assertSessionBelongsToResident(input.assessmentSessionId, input.residentId);
  if (!belongs) return { error: "Session not found for this resident." };

  const { error: finalizeError } = await finalizeNativeAudioSource({
    assessmentSessionId: input.assessmentSessionId,
    chunkCount: input.chunkCount,
  });
  if (finalizeError) return { error: finalizeError };

  return { status: "processing" };
}

export async function getNativeCaptureSessionStatusAction(input: {
  residentId: string;
  assessmentSessionId: string;
}) {
  const actor = await requireCaptureActor();
  if (!actor) return { error: "You must be signed in." };

  const belongs = await assertSessionBelongsToResident(input.assessmentSessionId, input.residentId);
  if (!belongs) return { error: "Session not found for this resident." };

  const session = await getAssessmentSessionWithFailureState(input.assessmentSessionId);
  if (!session) return { error: "Session not found." };
  return { session };
}

// Phase 13's explicit retry action lives in lib/actions/assessmentIntelligence.ts
// (retryFailedAssessment) — the review page's own action file, which already has an
// equivalent-strength authorization check (requireActor/canEditResidentProfile). Not
// duplicated here; the capture flow doesn't need its own copy since retrying happens from the
// review page, not the capture screen.

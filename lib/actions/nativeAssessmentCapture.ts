"use server";

import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { getResidentById } from "@/lib/data/residents";
import { resolveAssessmentCommunity } from "@/lib/assessmentIntelligence/communityResolution";
import {
  CAPTURED_SESSION_STATUS,
  RECORDING_SESSION_STATUS,
  decideCaptureAccess,
  decideCaptureSessionResume,
  decideChunkUpload,
  decideCaptureFinalize,
  deriveNextChunkIndex,
  isValidSessionId,
  summarizeStoredChunks,
  validateChunkUploadRequest,
  type CapturedAudioSummary,
  type FinalizeManifestEntry,
} from "@/lib/assessmentCapture/captureLogic";
import {
  isResidentInCaptureScope,
  lookupRecordingSessionsForResident,
  getNativeCaptureSessionState,
  createNativeCaptureSession,
  listStoredChunksForSession,
  createChunkSignedUploadUrl,
  markNativeSourceUploading,
  finalizeNativeCaptureSession,
  createChunkDownloadUrls,
  type NativeCaptureSessionState,
} from "@/lib/data/nativeAssessmentCapture";

// Server actions for Assessment Mobile Capture v0.1 — the native, in-browser recorder at
// /residents/[id]/assessment/capture, opened by the normal Assessment/Reassessment button.
//
// Separate from lib/actions/assessmentCapture.ts (the existing production "Assessment" button's
// external-capture handoff), which is untouched. Every action here is reachable by direct POST,
// so each one independently re-derives the signed-in actor, checks both capture permissions and
// community scope, validates its inputs, and verifies that any session it touches belongs to the
// resident in the URL AND was created by native capture — never trusting a client-supplied id.
//
// Terminal state is 'captured' (audio durably stored, transcription not begun). Nothing in this
// file can move a session to 'queued', so production's scheduled dispatcher — which shares this
// database — can never pick a native capture session up.

type Ctx = { actorLabel: string; role: NonNullable<Awaited<ReturnType<typeof getCurrentAuthorizedUser>>>["role"] };
/** `transient` marks failures worth retrying (signed out mid-capture, a read that failed) as
 * opposed to a definitive authorization/ownership refusal, which must stop the upload loop. */
type AccessError = { error: string; transient?: boolean };

async function requireResidentAccess(residentId: unknown): Promise<{ ctx: Ctx; residentId: string } | AccessError> {
  if (!isValidSessionId(residentId)) return { error: "Resident not found." };
  const profile = await getCurrentAuthorizedUser();
  if (!profile) return { error: "You must be signed in.", transient: true };
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  const residentInScope = await isResidentInCaptureScope(residentId, filter);
  const decision = decideCaptureAccess({ role: profile.role, residentInScope, residentId });
  if (!decision.ok) return { error: decision.error };
  const actorLabel = profile.full_name || profile.email;
  if (!actorLabel) return { error: "You must be signed in." };
  return { ctx: { actorLabel, role: profile.role }, residentId };
}

async function requireSessionAccess(
  residentId: unknown,
  assessmentSessionId: unknown,
  allowedStatuses: readonly string[],
  requireAudioInspection = false
): Promise<{ ctx: Ctx; residentId: string; session: NativeCaptureSessionState } | AccessError> {
  const access = await requireResidentAccess(residentId);
  if ("error" in access) return access;
  if (!isValidSessionId(assessmentSessionId)) return { error: "Assessment session not found for this resident." };
  const { session, error } = await getNativeCaptureSessionState(assessmentSessionId);
  if (error) return { error, transient: true };
  const decision = decideCaptureAccess({
    role: access.ctx.role,
    residentInScope: true,
    residentId: access.residentId,
    session: session ? { residentId: session.residentId, status: session.status, isNativeCapture: session.isNativeCapture } : null,
    allowedStatuses,
    requireAudioInspection,
  });
  if (!decision.ok || !session) return { error: decision.ok ? "Assessment session not found for this resident." : decision.error };
  return { ...access, session };
}

export interface NativeCaptureSessionInfo {
  assessmentSessionId: string;
  serverNextChunkIndex: number;
  uploadedChunkCount: number;
  resumed: boolean;
}

export type NativeCaptureStartState =
  | { kind: "none" }
  | { kind: "resumable"; session: NativeCaptureSessionInfo };

async function describeSession(assessmentSessionId: string, resumed: boolean): Promise<{ session?: NativeCaptureSessionInfo; error?: string }> {
  const listing = await listStoredChunksForSession(assessmentSessionId);
  if (listing.error) return { error: listing.error };
  return {
    session: {
      assessmentSessionId,
      serverNextChunkIndex: deriveNextChunkIndex(listing.chunks.map((c) => c.chunkIndex)),
      uploadedChunkCount: listing.chunks.length,
      resumed,
    },
  };
}

/** Read-only: is there a native in-progress session to resume? Never creates anything — safe to
 * call while rendering the capture page (including prefetch). */
export async function getNativeCaptureStartState(residentId: string): Promise<NativeCaptureStartState | { kind: "error"; error: string }> {
  const access = await requireResidentAccess(residentId);
  if ("error" in access) return { kind: "error", error: access.error };
  const decision = decideCaptureSessionResume(await lookupRecordingSessionsForResident(access.residentId));
  if (decision.kind === "error") return { kind: "error", error: decision.error };
  if (decision.kind === "create") return { kind: "none" };
  const described = await describeSession(decision.sessionId, true);
  if (!described.session) return { kind: "error", error: described.error ?? "Could not load the in-progress assessment." };
  return { kind: "resumable", session: described.session };
}

/** Called when the assessor taps Start: resumes this resident's native in-progress session, or
 * creates one. A lookup failure never falls through to creating a duplicate. */
export async function startOrResumeNativeCapture(residentId: string): Promise<{ session?: NativeCaptureSessionInfo; error?: string }> {
  const access = await requireResidentAccess(residentId);
  if ("error" in access) return { error: access.error };

  const decision = decideCaptureSessionResume(await lookupRecordingSessionsForResident(access.residentId));
  if (decision.kind === "error") return { error: decision.error };
  if (decision.kind === "resume") return describeSession(decision.sessionId, true);

  // Same community resolution as startAssessmentForExistingPerson (lib/actions/
  // assessmentIntelligence.ts): the resident's own community is the strongest source.
  const resident = await getResidentById(access.residentId);
  if (!resident) return { error: "Resident not found." };
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const community = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: resident.community_id,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: communityFilter,
  });
  if (!community.ok) return { error: community.error };

  const created = await createNativeCaptureSession({
    residentId: access.residentId,
    startedBy: access.ctx.actorLabel,
    communityId: community.communityId,
  });
  if (!created.sessionId) return { error: created.error ?? "Could not start the assessment session." };
  return { session: { assessmentSessionId: created.sessionId, serverNextChunkIndex: 0, uploadedChunkCount: 0, resumed: false } };
}

export type ChunkUploadActionResult =
  | { kind: "upload"; signedUrl: string }
  | { kind: "already_uploaded" }
  | { kind: "conflict"; error: string }
  | { kind: "session_closed"; error: string }
  | { kind: "denied"; error: string }
  | { kind: "retry"; error: string };

/** One locally-persisted chunk asks where to go. Returns a fresh signed upload URL, or
 * `already_uploaded` when an identical object is already stored (idempotent success — this is
 * what stops an "object already exists" rejection from retrying forever), or `conflict` when a
 * different object occupies the index (never overwritten; the client stops retrying it). */
export async function requestNativeChunkUpload(input: {
  residentId: string;
  assessmentSessionId: string;
  chunkIndex: number;
  runId: string;
  mimeType: string;
  size: number;
}): Promise<ChunkUploadActionResult> {
  const request = { chunkIndex: input?.chunkIndex, runId: input?.runId, mimeType: input?.mimeType, size: input?.size };
  const invalid = validateChunkUploadRequest(request);
  if (invalid) return { kind: "conflict", error: invalid };

  const access = await requireSessionAccess(input.residentId, input.assessmentSessionId, [RECORDING_SESSION_STATUS, CAPTURED_SESSION_STATUS]);
  if ("error" in access) return access.transient ? { kind: "retry", error: access.error } : { kind: "denied", error: access.error };
  if (access.session.status !== RECORDING_SESSION_STATUS) {
    return { kind: "session_closed", error: "This assessment has already been finished; no more audio can be added to it." };
  }

  const listing = await listStoredChunksForSession(access.session.id, String(request.chunkIndex).padStart(6, "0"));
  if (listing.error) return { kind: "retry", error: listing.error };

  const decision = decideChunkUpload(access.session.id, request, listing.chunks);
  if (decision.kind === "invalid" || decision.kind === "conflict") return { kind: "conflict", error: decision.reason };
  if (decision.kind === "already_uploaded") return { kind: "already_uploaded" };

  const signed = await createChunkSignedUploadUrl(decision.path);
  if (!signed.signedUrl) return { kind: "retry", error: signed.error ?? "Could not create an upload URL." };
  if (access.session.sourceId) await markNativeSourceUploading(access.session.sourceId);
  return { kind: "upload", signedUrl: signed.signedUrl };
}

const MAX_MANIFEST_ENTRIES = 20_000;

export type FinishNativeCaptureResult =
  | { status: typeof CAPTURED_SESSION_STATUS; chunkCount: number; totalBytes: number }
  | { incompleteChunkIndexes: number[]; error: string }
  | { error: string };

/** Finish. Succeeds only when every chunk this device persisted is verifiably in storage; then
 * finalizes the audio source and moves the session 'recording' -> 'captured' with finished_at.
 * Incomplete uploads return the missing chunk indexes and change nothing. */
export async function finishNativeCapture(input: {
  residentId: string;
  assessmentSessionId: string;
  manifest: FinalizeManifestEntry[];
}): Promise<FinishNativeCaptureResult> {
  if (!Array.isArray(input?.manifest) || input.manifest.length > MAX_MANIFEST_ENTRIES) {
    return { error: "Invalid recording manifest." };
  }
  const manifest: FinalizeManifestEntry[] = input.manifest.map((m) => ({
    chunkIndex: m?.chunkIndex,
    runId: m?.runId,
    mimeType: m?.mimeType,
    size: m?.size,
    recordedAt: typeof m?.recordedAt === "number" ? m.recordedAt : NaN,
  }));

  const access = await requireSessionAccess(input.residentId, input.assessmentSessionId, [RECORDING_SESSION_STATUS, CAPTURED_SESSION_STATUS]);
  if ("error" in access) return { error: access.error };

  const listing = await listStoredChunksForSession(access.session.id);
  if (listing.error) return { error: listing.error };

  const decision = decideCaptureFinalize({
    sessionStatus: access.session.status,
    manifest,
    storedChunks: listing.chunks,
    unrecognizedCount: listing.unrecognized.length,
  });

  if (decision.kind === "already_captured") {
    const summary = summarizeStoredChunks(listing.chunks);
    return { status: CAPTURED_SESSION_STATUS, chunkCount: summary.chunkCount, totalBytes: summary.totalBytes };
  }
  if (decision.kind === "incomplete") return { incompleteChunkIndexes: decision.missingChunkIndexes, error: decision.reason };
  if (decision.kind === "rejected") return { error: decision.reason };
  if (!access.session.sourceId) return { error: "No audio source found for this assessment." };

  const result = await finalizeNativeCaptureSession({
    assessmentSessionId: access.session.id,
    sourceId: access.session.sourceId,
    existingPayload: access.session.sourcePayload,
    summary: decision.summary,
    manifest,
  });
  if (!result.status) return { error: result.error ?? "Could not finish the assessment." };
  return { status: result.status, chunkCount: decision.summary.chunkCount, totalBytes: decision.summary.totalBytes };
}

// ─── Admin inspection for Test #1 ─────────────────────────────────────────────────────────────
// Scoped to exactly one native-capture session; admin/manager only (canInspectCapturedAssessmentAudio).
// Not a general audio browser:
// a non-native session (e.g. the existing capture flow's real recordings) is refused outright.

export interface CapturedAudioInspection {
  assessmentSessionId: string;
  status: string;
  summary: CapturedAudioSummary;
  chunks: { chunkIndex: number; runId: string | null; mimeType: string | null; size: number | null; createdAt: string | null }[];
  finalizedAt: string | null;
}

export async function inspectNativeCapturedAudio(input: {
  residentId: string;
  assessmentSessionId: string;
}): Promise<{ inspection?: CapturedAudioInspection; error?: string }> {
  const access = await requireSessionAccess(input?.residentId, input?.assessmentSessionId, [RECORDING_SESSION_STATUS, CAPTURED_SESSION_STATUS], true);
  if ("error" in access) return { error: access.error };
  const listing = await listStoredChunksForSession(access.session.id);
  if (listing.error) return { error: listing.error };
  const finalizedAt = access.session.sourcePayload?.finalized_at;
  return {
    inspection: {
      assessmentSessionId: access.session.id,
      status: access.session.status,
      summary: summarizeStoredChunks(listing.chunks, listing.unrecognized.length),
      chunks: listing.chunks.map((c) => ({ chunkIndex: c.chunkIndex, runId: c.runId, mimeType: c.mimeType, size: c.size, createdAt: c.createdAt })),
      finalizedAt: typeof finalizedAt === "string" ? finalizedAt : null,
    },
  };
}

/** Short-lived (5 minute) signed download links for this one session's raw, unmodified chunk
 * blobs, for offline inspection during the device test. */
export async function createNativeCapturedAudioDownloadLinks(input: {
  residentId: string;
  assessmentSessionId: string;
}): Promise<{ links?: { chunkIndex: number; runId: string | null; name: string; signedUrl: string }[]; error?: string }> {
  const access = await requireSessionAccess(input?.residentId, input?.assessmentSessionId, [RECORDING_SESSION_STATUS, CAPTURED_SESSION_STATUS], true);
  if ("error" in access) return { error: access.error };
  const listing = await listStoredChunksForSession(access.session.id);
  if (listing.error) return { error: listing.error };
  const byPath = new Map(listing.chunks.map((c) => [`${access.session.id}/${c.name}`, c]));
  const result = await createChunkDownloadUrls([...byPath.keys()]);
  if (!result.urls) return { error: result.error ?? "Could not create download links." };
  return {
    links: result.urls
      .map((u) => {
        const chunk = byPath.get(u.path);
        return chunk ? { chunkIndex: chunk.chunkIndex, runId: chunk.runId, name: chunk.name, signedUrl: u.signedUrl } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => a.chunkIndex - b.chunkIndex),
  };
}

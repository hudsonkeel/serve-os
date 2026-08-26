import "server-only";
import { randomUUID } from "node:crypto";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  DeleteTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type {
  AssessmentTranscriptionProvider,
  AudioChunkInput,
  TranscriptionGateOverride,
  TranscriptionJobHandle,
  TranscriptionStartOutcome,
  TranscriptionStatusOutcome,
} from "../transcriptionProvider.ts";
import { requirePhiAwsProcessingConfirmed } from "../phiGovernance.ts";
import { assembleAudioChunks } from "../audioAssembly.ts";
import { getServeAwsCredentials } from "../awsCredentials.ts";

// Amazon Transcribe implementation of the provider-neutral transcription interface — the
// intended production transcription path.
//
// TRANSCRIPTION UNIT DECISION (2026-08-15, Production Assessment Transcription Orchestration —
// supersedes this file's earlier per-chunk design): ONE assembled audio object, ONE Transcribe
// job, PER ASSESSMENT — not one job per ~10s capture chunk. A real 10-30 minute assessment
// captured as 10s chunks is 60-180 chunks; one job each would mean 60-180 concurrent-or-queued
// AWS jobs per assessment, no cross-chunk conversational context for Transcribe, heavy S3
// staging churn, and orchestration complexity (tracking 60-180 job identities, not one) with no
// offsetting benefit. The capture-durability reason the audio is chunked into 10s pieces
// (crash/reload-safe incremental upload) is independent of what unit gets transcribed — nothing
// about preserving capture durability requires transcribing at that same granularity. Chunks are
// downloaded, assembled into one continuous WebM file via audioAssembly.ts (real ffmpeg
// remuxing, not unsafe byte concatenation), staged to S3 once, and transcribed as one job. This
// also maximizes Transcribe's conversational context (it sees the whole exchange, not isolated
// 10s fragments) and is a plausible fit for serverless memory/runtime limits — a 30-minute Opus
// voice recording at typical bitrate is roughly 5-15MB.
//
// ASYNC SHAPE DECISION: StartTranscriptionJob returns immediately; the job completes some time
// later, independently. This module's startTranscription() therefore starts the job and returns
// `status: "pending"` with a resumable handle — it does NOT poll to completion inside the call.
// checkTranscription() performs exactly ONE non-blocking GetTranscriptionJobCommand call, meant
// to be invoked from a short-lived background worker tick (see pipeline.ts /
// netlify/functions/assessment-processing-worker.ts), not from a user-facing request.
//
// STORAGE DECISION: canonical audio remains ONLY in Supabase Storage (intake-audio bucket) —
// never duplicated permanently. S3 is used purely as ephemeral transcription staging: the
// assembled file is copied to a temporary S3 object immediately before starting the job, and
// BOTH the input object and Transcribe's output object are deleted immediately once the job
// reaches a terminal state (completed or failed) — not left to an external lifecycle policy
// alone (though a bucket-level lifecycle rule as a backstop is recommended — see this scope's
// completion report, §8). No resident name ever appears in any S3 key — paths are opaque,
// derived only from the already-opaque session id.

const REGION = "us-east-1"; // matches Bedrock's approved, pinned region — one PHI boundary
const LANGUAGE_CODE = "en-US"; // pinned for this first version; not read from an env var
const PROVIDER_ID = "aws-transcribe";
const MODEL_ID = `aws-transcribe:${LANGUAGE_CODE}`;

function getStagingBucket(): string {
  const bucket = process.env.SERVE_AWS_TRANSCRIBE_STAGING_BUCKET;
  if (!bucket) {
    throw new Error(
      "Missing SERVE_AWS_TRANSCRIBE_STAGING_BUCKET — required for AWS Transcribe (a private S3 bucket used only as temporary staging, never canonical storage). Not fabricated; configure it before selecting the aws transcription provider."
    );
  }
  return bucket;
}

let cachedTranscribeClient: TranscribeClient | null = null;
let cachedS3Client: S3Client | null = null;

function getTranscribeClient(): TranscribeClient {
  if (cachedTranscribeClient) return cachedTranscribeClient;
  // Explicit credentials from SERVE_AWS_ACCESS_KEY_ID/SERVE_AWS_SECRET_ACCESS_KEY — see
  // awsCredentials.ts for why the AWS SDK's default credential chain is never used here.
  cachedTranscribeClient = new TranscribeClient({ region: REGION, credentials: getServeAwsCredentials() });
  return cachedTranscribeClient;
}

function getS3Client(): S3Client {
  if (cachedS3Client) return cachedS3Client;
  cachedS3Client = new S3Client({ region: REGION, credentials: getServeAwsCredentials() });
  return cachedS3Client;
}

interface AwsJobMetadata {
  bucket: string;
  inputKey: string;
  outputKey: string;
}

async function cleanupJob(jobName: string, metadata: AwsJobMetadata): Promise<void> {
  const s3 = getS3Client();
  const transcribe = getTranscribeClient();
  await Promise.allSettled([
    s3.send(new DeleteObjectCommand({ Bucket: metadata.bucket, Key: metadata.inputKey })),
    s3.send(new DeleteObjectCommand({ Bucket: metadata.bucket, Key: metadata.outputKey })),
    transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: jobName })),
  ]);
}

/** Starts (does not wait for) a single AWS Transcribe job covering the ENTIRE assessment's
 * assembled audio. requirePhiAwsProcessingConfirmed() is checked first, defensively, since this
 * is the one place a network call with real audio bytes would actually reach AWS. */
export async function startAwsTranscription(
  chunks: AudioChunkInput[],
  gateOverride?: TranscriptionGateOverride
): Promise<TranscriptionStartOutcome> {
  requirePhiAwsProcessingConfirmed(gateOverride);

  if (chunks.length === 0) {
    return {
      status: "completed",
      handle: { providerId: PROVIDER_ID, jobId: `aws-empty-${Date.now()}` },
      result: { segments: [], provider: PROVIDER_ID, modelId: MODEL_ID, failedChunks: [] },
    };
  }

  const bucket = getStagingBucket();
  const assembled = await assembleAudioChunks(chunks.map((c) => ({ path: c.path, bytes: c.bytes })));

  const runId = randomUUID();
  const inputKey = `transcribe-staging/${runId}/assembled-input.webm`;
  const outputKey = `transcribe-staging/${runId}/assembled-output.json`;
  // AWS job names: alphanumeric, hyphen, underscore only, max 200 chars.
  const jobName = `serve-assessment-${runId}`.slice(0, 200);

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: inputKey,
      Body: assembled.buffer,
      ContentType: assembled.mimeType,
    })
  );

  try {
    const transcribe = getTranscribeClient();
    await transcribe.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: LANGUAGE_CODE,
        MediaFormat: "webm",
        Media: { MediaFileUri: `s3://${bucket}/${inputKey}` },
        OutputBucketName: bucket,
        OutputKey: outputKey,
      })
    );
  } catch (err) {
    // The job never started — clean up the orphaned input object rather than leaving it for the
    // lifecycle backstop alone, then let the real error propagate (never swallowed/retried
    // against a different provider here).
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: inputKey })).catch(() => {});
    throw err;
  }

  return {
    status: "pending",
    handle: {
      providerId: PROVIDER_ID,
      jobId: jobName,
      metadata: { bucket, inputKey, outputKey } satisfies AwsJobMetadata,
    },
  };
}

/** One non-blocking status check of a previously-started job — no sleep, no loop. Safe to call
 * from a single short-lived worker tick, repeatedly, until it returns a terminal status. */
export async function checkAwsTranscription(
  handle: TranscriptionJobHandle,
  gateOverride?: TranscriptionGateOverride
): Promise<TranscriptionStatusOutcome> {
  requirePhiAwsProcessingConfirmed(gateOverride);

  const metadata = handle.metadata as AwsJobMetadata | undefined;
  if (!metadata?.bucket || !metadata.inputKey || !metadata.outputKey) {
    return { status: "failed", error: "Transcription job handle is missing required AWS staging metadata." };
  }

  const transcribe = getTranscribeClient();
  const s3 = getS3Client();

  const jobResult = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: handle.jobId }));
  const status = jobResult.TranscriptionJob?.TranscriptionJobStatus;

  if (status === "IN_PROGRESS" || status === "QUEUED") {
    return { status: "pending" };
  }

  if (status !== "COMPLETED") {
    await cleanupJob(handle.jobId, metadata);
    return { status: "failed", error: status === "FAILED" ? "AWS Transcribe job failed." : `Unexpected AWS Transcribe job status: ${status ?? "unknown"}` };
  }

  // OutputBucketName/OutputKey means the result lands in our own bucket at a known key — read it
  // directly rather than following transcriptFileUri (which may be a presigned AWS console URL
  // in some configurations, not guaranteed to be our own object).
  try {
    const outputObject = await s3.send(new GetObjectCommand({ Bucket: metadata.bucket, Key: metadata.outputKey }));
    const bodyText = await outputObject.Body?.transformToString();
    if (!bodyText) {
      await cleanupJob(handle.jobId, metadata);
      return { status: "failed", error: "AWS Transcribe output object was empty." };
    }

    const parsed = JSON.parse(bodyText) as { results?: { transcripts?: { transcript?: string }[] } };
    const text = (parsed.results?.transcripts?.[0]?.transcript ?? "").trim();

    await cleanupJob(handle.jobId, metadata);

    return {
      status: "completed",
      result: {
        segments: text ? [{ text, chunkIndex: 0, sourcePath: "assembled" }] : [],
        provider: PROVIDER_ID,
        modelId: MODEL_ID,
        failedChunks: [],
      },
    };
  } catch (err) {
    await cleanupJob(handle.jobId, metadata).catch(() => {});
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error reading AWS Transcribe output." };
  }
}

export const awsTranscribeProvider: AssessmentTranscriptionProvider = {
  providerId: PROVIDER_ID,
  modelId: MODEL_ID,
  startTranscription: (chunks, gateOverride) => startAwsTranscription(chunks, gateOverride),
  checkTranscription: (handle, gateOverride) => checkAwsTranscription(handle, gateOverride),
};

export { REGION as AWS_TRANSCRIBE_REGION };

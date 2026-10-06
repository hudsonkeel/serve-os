// Real AWS implementation of TranscriptionBackend (S3 temporary staging + Amazon Transcribe).
// No `server-only` and no Next dependency: loaded by the Netlify background worker.
//
// - Region pinned to us-east-1 (same approved boundary as Bedrock); bucket from
//   SERVE_AWS_TRANSCRIBE_STAGING_BUCKET (required — never guessed).
// - Credentials: explicit SERVE_AWS_* only (lib/ai/awsCredentials.ts strict mode) — never the
//   ambient/default credential chain on a deployed site.
// - Staging objects are written with SSE (AES256) and live only under transcribe-staging/; the
//   canonical recording stays in Supabase. Transcribe writes its output JSON to the same bucket at
//   a key we choose (so we read our own object, not a presigned URL).
// - Speaker labels on (ShowSpeakerLabels, up to 6 speakers): AWS assigns anonymous spk_N labels.

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  DeleteTranscriptionJobCommand,
  type MediaFormat,
} from "@aws-sdk/client-transcribe";
import { resolveAssessmentPipelineAwsCredentials, SERVE_AWS_REGION } from "../../../ai/awsCredentials.ts";
import type { TranscribeJobStatus, TranscriptionBackend } from "./transcriptionOrchestrator.ts";

export const STAGING_BUCKET_VAR = "SERVE_AWS_TRANSCRIBE_STAGING_BUCKET";
export const TRANSCRIBE_LANGUAGE_CODE = "en-US";
export const MAX_SPEAKER_LABELS = 6;

function errorName(err: unknown): string {
  return (err as { name?: string })?.name ?? "";
}

function isNotFound(err: unknown): boolean {
  const name = errorName(err);
  const msg = err instanceof Error ? err.message : "";
  return name === "NotFoundException" || (name === "BadRequestException" && /couldn't be found|could not be found|not found/i.test(msg));
}

export function createAwsTranscriptionBackend(env: Record<string, string | undefined> = process.env): TranscriptionBackend {
  const bucket = env[STAGING_BUCKET_VAR]?.trim();
  if (!bucket) throw new Error(`${STAGING_BUCKET_VAR} is not configured — AWS Transcribe staging is unavailable.`);
  const credentials = resolveAssessmentPipelineAwsCredentials(env, "AWS Transcribe/S3");
  const clientConfig = { region: SERVE_AWS_REGION, ...(credentials ? { credentials } : {}) };
  const s3 = new S3Client(clientConfig);
  const transcribe = new TranscribeClient(clientConfig);

  return {
    async putStagingObject(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
    },

    async startJob({ jobName, inputKey, outputKey, mediaFormat }) {
      try {
        await transcribe.send(
          new StartTranscriptionJobCommand({
            TranscriptionJobName: jobName,
            LanguageCode: TRANSCRIBE_LANGUAGE_CODE,
            MediaFormat: mediaFormat as MediaFormat,
            Media: { MediaFileUri: `s3://${bucket}/${inputKey}` },
            OutputBucketName: bucket,
            OutputKey: outputKey,
            Settings: { ShowSpeakerLabels: true, MaxSpeakerLabels: MAX_SPEAKER_LABELS },
          })
        );
        return "started";
      } catch (err) {
        // A job with this deterministic name already exists: adopt it, never start another.
        if (errorName(err) === "ConflictException") return "already_exists";
        throw err;
      }
    },

    async getJob(jobName) {
      try {
        const res = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
        const status = (res.TranscriptionJob?.TranscriptionJobStatus ?? "IN_PROGRESS") as TranscribeJobStatus;
        return { status, failureReason: res.TranscriptionJob?.FailureReason };
      } catch (err) {
        if (isNotFound(err)) return { status: "NOT_FOUND" };
        throw err;
      }
    },

    async readOutput(outputKey) {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: outputKey }));
      const text = await res.Body?.transformToString();
      if (!text) throw new Error("Transcription output object was empty.");
      return JSON.parse(text);
    },

    async deleteStagingObject(key) {
      // S3 DeleteObject is idempotent: deleting a missing key succeeds.
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async deleteJob(jobName) {
      try {
        await transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      } catch (err) {
        if (isNotFound(err)) return;
        throw err;
      }
    },
  };
}

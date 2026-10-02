// Durable extraction provenance (pure). Answers, without relying on platform log retention:
// "Which provider/model processed this assessment, when, with what outcome, and how many facts
// were accepted / rejected?" — including when ZERO facts were accepted (draft fact rows, the only
// other place a model_version is stored, don't exist then).
//
// Stored in the existing intake_sources.source_payload JSON of the source the extraction read
// (no schema change), merged so every other key — capture metadata, run logs, synthetic-test
// attestation, transcription-related payload — is preserved untouched:
//   source_payload.extraction_provenance  — the most recent attempt
//   source_payload.extraction_history     — the last EXTRACTION_HISTORY_LIMIT attempts, oldest first

export type ExtractionOutcome = "succeeded" | "parse_error" | "provider_error";

export interface ExtractionProvenanceRecord {
  provider: string;
  model: string;
  outcome: ExtractionOutcome;
  extracted_at: string;
  /** null only when the provider failed before returning facts. */
  accepted_count: number | null;
  rejected_count: number | null;
  extraction_run_ref: string;
  /** Netlify deploy context captured at build time ("deploy-preview", "production", …), when known. */
  deploy_context: string | null;
  deploy_url: string | null;
  /** Bounded, sanitized failure detail (parse/provider errors only). Never transcript text. */
  error: string | null;
}

export const EXTRACTION_HISTORY_LIMIT = 10;
const MAX_ERROR_LENGTH = 300;

export function buildExtractionProvenance(input: {
  provider: string;
  model: string;
  outcome: ExtractionOutcome;
  at: Date;
  acceptedCount: number | null;
  rejectedCount: number | null;
  runRef: string;
  deployContext?: { context: string | null; deployPrimeUrl: string | null } | null;
  error?: unknown;
}): ExtractionProvenanceRecord {
  const rawError =
    input.error === undefined || input.error === null
      ? null
      : (input.error instanceof Error ? input.error.message : String(input.error)).replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LENGTH);
  return {
    provider: input.provider,
    model: input.model,
    outcome: input.outcome,
    extracted_at: input.at.toISOString(),
    accepted_count: input.acceptedCount,
    rejected_count: input.rejectedCount,
    extraction_run_ref: input.runRef,
    deploy_context: input.deployContext?.context ?? null,
    deploy_url: input.deployContext?.deployPrimeUrl ?? null,
    error: input.outcome === "succeeded" ? null : rawError,
  };
}

/** Returns a NEW payload: every existing key preserved, the latest record set, history appended
 * (bounded). Never mutates its input. */
export function mergeExtractionProvenance(
  existing: Record<string, unknown> | null | undefined,
  record: ExtractionProvenanceRecord
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? existing : {};
  const priorHistory = Array.isArray(base.extraction_history) ? (base.extraction_history as unknown[]) : [];
  return {
    ...base,
    extraction_provenance: record,
    extraction_history: [...priorHistory, record].slice(-EXTRACTION_HISTORY_LIMIT),
  };
}

/** One-line summary for the worker's diagnostic log. */
export function describeProvenanceForLog(record: ExtractionProvenanceRecord): string {
  const counts = record.accepted_count === null ? "" : ` accepted=${record.accepted_count} rejected=${record.rejected_count}`;
  return `provider=${record.provider} model=${record.model} outcome=${record.outcome}${counts}`;
}

// Shared types for the Resident Data Integrity engine. Answers a
// DIFFERENT question than lib/residents/identity/ ("is this the same
// human?") and lib/residents/identity/householdSignals.ts ("do these
// residents share a household?"): "was this record parsed, normalized, or
// written correctly?" — bad data handling, not identity uncertainty. See
// supabase/migrations/20260807000000_create_resident_data_integrity.sql's
// module comment for the full domain boundary.

export type IntegrityIssueType = "same_import_duplicate" | "duplicate_source_row" | "malformed_phone" | "malformed_name";

export type IntegritySeverity = "low" | "medium" | "high";

export interface IntegrityEvidenceSignal {
  readonly signalType: string;
  readonly description: string;
  readonly rawValue?: string | null;
  readonly normalizedValue?: string | null;
}

export interface ResidentForIntegrityDetection {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly middleName: string | null;
  readonly unitNumber: string | null;
  readonly phone: string | null;
  readonly phoneRaw: string | null;
  readonly sourceSystem: string | null;
  readonly sourceFile: string | null;
  readonly importBatch: string | null;
  readonly createdAt: string;
  readonly isActive: boolean;
}

export interface IssueMemberDraft {
  readonly residentId: string;
  readonly role?: string;
}

export interface IssueDraft {
  readonly issueType: IntegrityIssueType;
  readonly severity: IntegritySeverity;
  readonly sourceSystem: string | null;
  readonly sourceFile: string | null;
  readonly importBatch: string | null;
  readonly importRunId: string | null;
  readonly evidence: readonly IntegrityEvidenceSignal[];
  readonly recommendedAction: string;
  readonly detectorRule: string;
  readonly detectorVersion: string;
  readonly fingerprint: string;
  readonly members: readonly IssueMemberDraft[];
}

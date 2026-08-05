// Deterministic issue fingerprint — pure string function, no I/O. Same
// (issueType, residentIds, keyFields) always produces the same fingerprint,
// which is what makes both detection idempotency (create_resident_data_
// integrity_issues skips a repeat) and suppression matching
// (resident_data_integrity_suppressions) possible. See
// supabase/migrations/20260807000000_create_resident_data_integrity.sql.
import type { IntegrityIssueType } from "./types.ts";

export function computeFingerprint(issueType: IntegrityIssueType, residentIds: readonly string[], keyFields: readonly (string | null)[] = []): string {
  const sortedIds = [...residentIds].sort();
  return [issueType, ...sortedIds, ...keyFields.map((f) => f ?? "")].join("|");
}

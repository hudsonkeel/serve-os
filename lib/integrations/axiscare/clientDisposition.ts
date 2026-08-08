// A durable, human-set override for AxisCare client records that are
// not true clients (or whose lifecycle bucket needs an explicit human
// decision), without deleting or hiding the underlying AxisCare row.
// See supabase/migrations/20260823000000_add_axiscare_client_disposition.sql.
// Most AxisCare client records have no disposition row at all — absence
// means "no human override, use the computed lifecycle
// (clientLifecycle.ts) as-is." A row here is always a deliberate,
// actor-attributed human decision, never written by an automated sync.

function exhaustiveArrayOf<T>() {
  return <U extends readonly T[]>(...items: U & ([T] extends [U[number]] ? unknown : never)) => items;
}

export type AxisCareClientDisposition =
  | "real_client"
  | "prospect"
  | "non_client_related_person"
  | "administrative_record"
  | "test_placeholder"
  | "needs_review";

export const AXISCARE_CLIENT_DISPOSITIONS = exhaustiveArrayOf<AxisCareClientDisposition>()(
  "real_client",
  "prospect",
  "non_client_related_person",
  "administrative_record",
  "test_placeholder",
  "needs_review"
);

// A record with one of these dispositions is a deliberate human
// exclusion — it must never count toward Active/Inactive/Prospect
// client totals, regardless of what the computed lifecycle says.
const EXCLUDED_FROM_LIFECYCLE_COUNTS = new Set<AxisCareClientDisposition>([
  "non_client_related_person",
  "administrative_record",
  "test_placeholder",
]);

export function isExcludedFromLifecycleCounts(disposition: AxisCareClientDisposition | null): boolean {
  return disposition !== null && EXCLUDED_FROM_LIFECYCLE_COUNTS.has(disposition);
}

export interface AxisCareClientDispositionRow {
  readonly id: string;
  readonly axiscareClientId: string;
  readonly disposition: AxisCareClientDisposition;
  readonly rationale: string;
  readonly relatedAxisCareClientId: string | null;
  readonly relatedPersonNote: string | null;
  readonly setBy: string;
  readonly setAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

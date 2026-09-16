// Pure decision logic for client enrollment (Slice 1: Service Agreement ->
// Enrolled Inactive Client, 2026-09-15). No I/O -- lib/actions/
// clientEnrollment.ts wraps this with the real relationship lookup/create
// and the convert_resident_prospect_to_inactive_client() RPC call.
//
// Deliberately idempotent: recording a Service Agreement a second time
// (re-upload, duplicate click, a resident who is already further along)
// must never downgrade an Active Client back to Inactive, never duplicate
// the enrollment event, and never create a second relationship row for a
// resident who already has one. This is the single place that guarantees
// that, independent of the caller.

export interface EnrollmentRelationshipSummary {
  readonly id: string;
  readonly relationshipType: string;
  readonly status: string;
}

export type ClientEnrollmentDecision =
  // Already an enrolled Client (Inactive or Active) -- no-op. Signing
  // another Service Agreement is not itself grounds to change anything.
  | { readonly kind: "already_enrolled"; readonly relationshipId: string }
  // An existing, non-closed Resident Prospect relationship should be
  // converted in place -- never a new relationship row.
  | { readonly kind: "convert_existing"; readonly relationshipId: string }
  // No relationship exists yet for this resident at all -- create a
  // Resident Prospect relationship first, then convert it.
  | { readonly kind: "create_then_convert" };

export function decideClientEnrollmentAction(
  existingRelationships: readonly EnrollmentRelationshipSummary[]
): ClientEnrollmentDecision {
  const alreadyClient = existingRelationships.find(
    (r) => r.relationshipType === "active_client" || r.relationshipType === "inactive_client"
  );
  if (alreadyClient) {
    return { kind: "already_enrolled", relationshipId: alreadyClient.id };
  }

  const prospect = existingRelationships.find(
    (r) => r.relationshipType === "resident_prospect" && r.status !== "closed"
  );
  if (prospect) {
    return { kind: "convert_existing", relationshipId: prospect.id };
  }

  return { kind: "create_then_convert" };
}

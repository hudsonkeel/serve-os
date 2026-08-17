// Audit Readiness's own, stricter reading of the canonical
// ServeRelationshipProjection (serveRelationshipProjection.ts) — never a
// second definition of "Active Client." /residents' own tab already treats
// any active_client projection as real (identity confidence is a display
// badge there, never a filter — see projectServeRelationship.ts's own
// comment). Audit Readiness adds exactly one additional gate on top of
// that same projection: an AxisCare-SOURCED active_client is only
// auditable once a human has actually confirmed the Serve<->AxisCare
// identity match — an unconfirmed candidate/needs-review match is a real
// relationship for display purposes, but not yet a safe subject for a
// compliance denominator. That gap is reconciliation work (the existing
// /reconciliation page), never a Client Readiness requirement failure —
// excluded residents simply never enter the evaluated population at all.
//
// Every other relationship source (a CRM Relationship, the legacy
// serve_relationship_status fallback, or a reviewed human correction) has
// no AxisCare identity dimension to gate on, so it passes through exactly
// as the canonical projection already decided.
import type { ServeRelationshipProjection } from "./serveRelationshipProjection.ts";

export function isAuditEligibleActiveClient(
  projection: Pick<ServeRelationshipProjection, "relationship" | "relationshipSource">,
  axiscareIdentityStatus: "confirmed" | "candidate" | "needs_identity_review" | "unmatched" | null
): boolean {
  if (projection.relationship !== "active_client") return false;
  if (projection.relationshipSource !== "axiscare") return true;
  return axiscareIdentityStatus === "confirmed";
}

import Link from "next/link";
import { IdentityDecisionActions } from "@/components/reconciliation/IdentityDecisionActions";
import { ServeRelationshipCorrectionControl } from "@/components/residents/ServeRelationshipCorrectionControl";
import type { BadgeTone } from "@/components/ui/Badge";
import type { AxisCareRelationshipMatch, ServeRelationship } from "@/lib/residents/serveRelationshipProjection";

// A single, concise alert — rendered only when something actually needs
// a decision. Once identity is confirmed or a correction stops
// disagreeing with fresh vendor evidence, this renders nothing at all;
// there is no permanent "Corrected" or "Vendor evidence disagrees" badge
// left behind to explain a historical decision (that provenance lives in
// Record & History instead). Reuses the exact same governed actions
// /reconciliation and the Residents list already use —
// IdentityDecisionActions, ServeRelationshipCorrectionControl — never a
// parallel mechanism.

// Exported for reuse by the resident page's own header badge — the same
// canonical relationship label everywhere on this page.
export const RELATIONSHIP_LABELS: Record<ServeRelationship, string> = {
  prospect: "Prospect",
  active_client: "Active Client",
  inactive_client: "Inactive Client",
  no_current_relationship: "No Current Relationship",
  needs_review: "Needs Review",
};

export const RELATIONSHIP_TONES: Record<ServeRelationship, BadgeTone> = {
  prospect: "gold",
  active_client: "success",
  inactive_client: "neutral",
  no_current_relationship: "neutral",
  needs_review: "warning",
};

interface ResidentIdentityAndRelationshipProps {
  residentId: string;
  residentDisplayName: string;
  currentRelationship: ServeRelationship;
  axiscareMatch: AxisCareRelationshipMatch | null;
  correction: { actor: string; rationale: string; createdAt: string } | null;
  hasConflict: boolean;
  canResolveIdentity: boolean;
  canCorrectRelationship: boolean;
  // Set only when a real, open resident-identity-resolution candidate
  // already links this resident to a specific other record — i.e. the
  // conflict has a KNOWN, specific root cause (a probable duplicate
  // resident), not just "something disagrees." When present, this
  // replaces the generic relationship-correction prompt with a direct
  // link into the real comparison/merge review flow — correcting the
  // relationship value alone would not fix the underlying duplicate.
  openDuplicateCandidateId?: string | null;
  scrollAnchorId?: string;
}

export function ResidentIdentityAndRelationship({
  residentId,
  residentDisplayName,
  currentRelationship,
  axiscareMatch,
  correction,
  hasConflict,
  canResolveIdentity,
  canCorrectRelationship,
  openDuplicateCandidateId,
  scrollAnchorId,
}: ResidentIdentityAndRelationshipProps) {
  const identityNeedsConfirmation =
    !!axiscareMatch && (axiscareMatch.identityStatus === "candidate" || axiscareMatch.identityStatus === "needs_identity_review");

  if (!identityNeedsConfirmation && !hasConflict) return null;

  return (
    <div id={scrollAnchorId} className="space-y-3">
      {identityNeedsConfirmation && axiscareMatch && (
        <div className="rounded-xl border border-amber-200 bg-warning-surface p-4">
          <p className="font-sans text-sm font-semibold uppercase tracking-wide text-warning-text">Identity needs confirmation</p>
          <p className="mt-1 font-sans text-sm text-body">
            AxisCare #{axiscareMatch.axiscareId} appears to be {residentDisplayName}
            {axiscareMatch.vendorDisplayName && axiscareMatch.vendorDisplayName !== residentDisplayName
              ? ` (listed there as ${axiscareMatch.vendorDisplayName})`
              : ""}
            .
          </p>
          {canResolveIdentity ? (
            <div className="mt-2">
              <IdentityDecisionActions
                input={{
                  axiscareId: axiscareMatch.axiscareId,
                  vendorDisplayName: axiscareMatch.vendorDisplayName ?? "",
                  matchBasis: axiscareMatch.matchBasis ?? "none",
                  residentId,
                  statusLabel: axiscareMatch.statusLabel ?? null,
                  statusActive: axiscareMatch.statusActive ?? false,
                  classes: axiscareMatch.classes ? [...axiscareMatch.classes] : [],
                }}
              />
            </div>
          ) : (
            <p className="mt-2 font-sans text-xs text-muted">Your role does not include identity-resolution actions.</p>
          )}
        </div>
      )}

      {hasConflict && openDuplicateCandidateId && (
        <div className="rounded-xl border border-amber-200 bg-warning-surface p-4">
          <p className="font-sans text-sm font-semibold uppercase tracking-wide text-warning-text">Duplicate / identity conflict</p>
          <p className="mt-1 font-sans text-sm text-body">
            This looks like a duplicate resident record — that&rsquo;s the most likely reason Serve&rsquo;s AxisCare match
            disagrees with the recorded relationship. Correcting the relationship alone won&rsquo;t fix this.
          </p>
          {canCorrectRelationship ? (
            <Link
              href={`/resident-identities/${openDuplicateCandidateId}`}
              className="mt-2 inline-block font-sans text-sm font-medium text-navy hover:text-navy-light"
            >
              Resolve duplicate →
            </Link>
          ) : (
            <p className="mt-2 font-sans text-xs text-muted">Your role does not include duplicate-resolution actions.</p>
          )}
        </div>
      )}

      {hasConflict && !openDuplicateCandidateId && (
        <div className="rounded-xl border border-amber-200 bg-warning-surface p-4">
          <p className="font-sans text-sm font-semibold uppercase tracking-wide text-warning-text">Relationship needs review</p>
          <p className="mt-1 font-sans text-sm text-body">
            Recorded as {RELATIONSHIP_LABELS[currentRelationship]}
            {correction ? ` by ${correction.actor} (${correction.rationale})` : ""}, but Serve&rsquo;s own AxisCare match
            currently disagrees with that. The correction still governs what&rsquo;s shown.
          </p>
          {canCorrectRelationship ? (
            <div className="mt-2">
              <ServeRelationshipCorrectionControl residentId={residentId} currentValue={currentRelationship} />
            </div>
          ) : (
            <p className="mt-2 font-sans text-xs text-muted">Your role does not include relationship-correction actions.</p>
          )}
        </div>
      )}
    </div>
  );
}

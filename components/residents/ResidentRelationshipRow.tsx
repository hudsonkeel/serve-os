import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ServeRelationshipCorrectionControl } from "./ServeRelationshipCorrectionControl";
import type { EnrichedResidentRecord } from "@/lib/data/residentServeRelationships";
import type { ServeRelationship, ServeDeliverySystem } from "@/lib/residents/serveRelationshipProjection";
import type { AxisCareIdentityStatus } from "@/lib/integrations/axiscare/clientOperationalStatus";

const RELATIONSHIP_LABELS: Record<ServeRelationship, string> = {
  prospect: "Prospect",
  active_client: "Active Client",
  inactive_client: "Inactive Client",
  no_current_relationship: "No Current Relationship",
  needs_review: "Needs Review",
};

const RELATIONSHIP_TONES: Record<ServeRelationship, BadgeTone> = {
  prospect: "gold",
  active_client: "success",
  inactive_client: "neutral",
  no_current_relationship: "neutral",
  needs_review: "warning",
};

const IDENTITY_LABELS: Record<AxisCareIdentityStatus, string> = {
  confirmed: "Identity Confirmed",
  candidate: "Identity Candidate",
  needs_identity_review: "Needs Identity Review",
  unmatched: "Unmatched",
};

const IDENTITY_TONES: Record<AxisCareIdentityStatus, BadgeTone> = {
  confirmed: "success",
  candidate: "blue",
  needs_identity_review: "warning",
  unmatched: "neutral",
};

const DELIVERY_LABELS: Record<ServeDeliverySystem, string | null> = {
  axiscare: "AxisCare",
  cinch: "CINCH",
  both: "CINCH · AxisCare",
  none: null,
};

function shortDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ResidentRelationshipRowProps {
  record: EnrichedResidentRecord;
  canCorrect: boolean;
}

export function ResidentRelationshipRow({ record, canCorrect }: ResidentRelationshipRowProps) {
  const { base, projection, axiscareMatch } = record;
  const deliveryLabel = DELIVERY_LABELS[projection.deliverySystem];

  return (
    // Mobile: a single stacked column, deliberately not the same 3-column
    // layout squeezed narrower — family contact and "updated" are dropped
    // to the desktop-only columns below (tap through to the full record
    // for those), per "don't place every desktop field into every mobile
    // record." Desktop layout (md:) is completely unchanged.
    <div className="relative flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-ivory active:bg-ivory md:flex-row md:items-start md:gap-6 md:px-6 md:py-6">
      <Link
        href={`/residents/${base.id}`}
        aria-label={`Open resident record for ${base.residentDisplayName}`}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        className="absolute inset-0 z-0 focus:outline-none focus-visible:bg-ivory focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/40"
      />

      <div className="pointer-events-none relative z-[1] min-w-0 flex-1 pr-8 md:pr-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={RELATIONSHIP_TONES[projection.relationship]}>{RELATIONSHIP_LABELS[projection.relationship]}</Badge>
          {projection.correction && <Badge tone="blue">Corrected</Badge>}
          {projection.hasConflict && <Badge tone="danger">Vendor evidence disagrees</Badge>}
          {projection.onHold && <Badge tone="warning">On Hold</Badge>}
          {base.wellnessWatch && (
            <Badge tone={base.wellnessWatch.hasOverdue ? "danger" : "warning"}>
              {base.wellnessWatch.hasOverdue ? "Wellness Watch — Overdue" : "Wellness Watch"}
            </Badge>
          )}
          <span className="font-sans text-sm text-muted">
            {[base.unitNumber ? `Unit ${base.unitNumber}` : null, base.building].filter(Boolean).join(" | ")}
          </span>
        </div>

        <p className="font-sans text-card-title font-semibold text-body">{base.residentDisplayName}</p>
        <p className="mt-0.5 font-sans text-sm text-muted">Watermere Resident</p>

        {(axiscareMatch || deliveryLabel) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {deliveryLabel && <span className="font-sans text-sm text-muted">{deliveryLabel}</span>}
            {axiscareMatch && (
              <>
                <span className="font-sans text-sm text-muted">· AxisCare #{axiscareMatch.axiscareId}</span>
                <Badge tone={IDENTITY_TONES[axiscareMatch.identityStatus]}>
                  {IDENTITY_LABELS[axiscareMatch.identityStatus]}
                </Badge>
              </>
            )}
          </div>
        )}

        {projection.relationship === "prospect" && projection.prospectStage && (
          <p className="mt-1 font-sans text-sm text-muted">
            Stage: {projection.prospectStage.replace(/_/g, " ")}
          </p>
        )}

        {projection.correction && (
          <p className="mt-1 font-sans text-sm text-muted">
            Corrected by {projection.correction.actor}: &ldquo;{projection.correction.rationale}&rdquo;
            {projection.hasConflict && " — current vendor evidence now disagrees with this correction."}
          </p>
        )}

        {canCorrect && (
          <div className="mt-2">
            <ServeRelationshipCorrectionControl residentId={base.id} currentValue={projection.relationship} />
          </div>
        )}
      </div>

      {/* Deprioritized on mobile — recognizing/deciding needs name + status
          + community, not family contact or a raw timestamp. Both remain
          one tap away on the full record. */}
      <div className="pointer-events-none relative z-[1] hidden w-48 shrink-0 md:block">
        {base.familyContact !== "No contact on file" ? (
          <>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Family Contact</p>
            <p className="mt-1 font-sans text-base text-body">{base.familyContact}</p>
          </>
        ) : (
          <p className="font-sans text-sm text-muted">No contact on file</p>
        )}
      </div>

      <div className="pointer-events-none relative z-[1] hidden w-44 shrink-0 space-y-1 text-right md:block">
        <p className="font-sans text-sm text-muted">Updated {shortDate(base.updatedAt ?? base.createdAt)}</p>
      </div>

      {/* Disclosure signifier — makes "this row leads somewhere" visible
          rather than implied only by hover/cursor (Phase 5: the user
          shouldn't have to guess whether the row is tappable). */}
      <ChevronRight
        size={18}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-4 z-[1] shrink-0 text-subtle md:static md:mt-1 md:self-center"
      />
    </div>
  );
}

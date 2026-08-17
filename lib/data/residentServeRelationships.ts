// Enriches the existing Residents directory (getCommunityMetrics(), left
// completely unchanged) with the unified Serve relationship projection
// (lib/residents/serveRelationshipProjection.ts), joining in the
// AxisCare client operational summary
// (lib/data/axiscareClientOperationalSummary.ts) that the Residents
// page previously had zero awareness of. This is the single place a
// resident's AxisCare match is resolved for display purposes — no new
// identity-matching logic here, only reuse of what already exists.
import "server-only";
import {
  getCommunityMetrics,
  type CommunityResidentRecord,
} from "./communityMetrics";
import { getAxisCareClientOperationalSummary, type AxisCareClientOperationalRow } from "./axiscareClientOperationalSummary";
import { getLatestServeRelationshipCorrections } from "./residentServeRelationshipCorrections";
import {
  projectServeRelationship,
  applyServeRelationshipCorrection,
  type ServeRelationship,
  type ServeRelationshipProjectionWithCorrection,
  type AxisCareRelationshipMatch,
} from "@/lib/residents/serveRelationshipProjection";
import { isAuditEligibleActiveClient } from "@/lib/residents/auditEligibleActiveClient";
import type { Resident } from "@/lib/supabase/types";

export interface EnrichedResidentRecord {
  readonly base: CommunityResidentRecord;
  readonly projection: ServeRelationshipProjectionWithCorrection;
  readonly axiscareMatch: AxisCareRelationshipMatch | null;
}

export type ResidentRelationshipTabValue =
  | "all"
  | "active_client"
  | "prospect"
  | "inactive_client"
  | "no_current_relationship"
  | "needs_review";

export interface ResidentServeRelationshipsData {
  communityName: string;
  totalResidents: number;
  records: EnrichedResidentRecord[];
  relationshipCounts: Record<ServeRelationship, number>;
  residentsError?: string;
}

// Ranks which AxisCare match "wins" if more than one AxisCare client row
// somehow matched the same resident (e.g. a legacy duplicate client
// record) — confirmed human decisions outrank unconfirmed matches.
const IDENTITY_PRIORITY: Record<AxisCareClientOperationalRow["identityStatus"], number> = {
  confirmed: 3,
  candidate: 2,
  needs_identity_review: 1,
  unmatched: 0,
};

function buildResidentAxisCareMatches(
  axiscareRows: readonly AxisCareClientOperationalRow[]
): Map<string, AxisCareRelationshipMatch> {
  const byResident = new Map<string, AxisCareRelationshipMatch>();

  for (const row of axiscareRows) {
    // An excluded AxisCare record (disposition-driven, e.g. a related
    // person mistakenly created as a client) never represents a real
    // client relationship for the matched resident — see
    // serveRelationshipProjection.ts's AxisCareRelationshipBucket
    // contract.
    if (row.operationalBucket === "excluded") continue;

    const residentId = row.residentMatch.residentId;
    if (!residentId) continue;

    const existing = byResident.get(residentId);
    if (existing && IDENTITY_PRIORITY[existing.identityStatus] >= IDENTITY_PRIORITY[row.identityStatus]) {
      continue;
    }

    byResident.set(residentId, {
      axiscareId: row.axiscareId,
      operationalBucket: row.operationalBucket,
      identityStatus: row.identityStatus,
      vendorDisplayName: row.name,
      matchBasis: row.residentMatch.basis,
      statusLabel: row.statusLabel,
      statusActive: row.statusActive,
      classes: row.classes,
    });
  }

  return byResident;
}

export async function getResidentServeRelationships(): Promise<ResidentServeRelationshipsData> {
  const [community, axiscareSummary, corrections] = await Promise.all([
    getCommunityMetrics(),
    getAxisCareClientOperationalSummary(),
    getLatestServeRelationshipCorrections(),
  ]);

  const axiscareMatchesByResident = buildResidentAxisCareMatches(axiscareSummary.rows);

  const relationshipCounts: Record<ServeRelationship, number> = {
    prospect: 0,
    active_client: 0,
    inactive_client: 0,
    no_current_relationship: 0,
    needs_review: 0,
  };

  const records: EnrichedResidentRecord[] = community.residentRecords.map((base) => {
    const axiscareMatch = axiscareMatchesByResident.get(base.id) ?? null;

    const naturalProjection = projectServeRelationship({
      legacyResidentStatus: base.serveRelationshipStatus,
      activeRelationships: base.activeRelationships.map((r) => ({
        relationshipType: r.relationshipType,
        stage: r.stage,
        status: r.status,
      })),
      axiscareMatch,
      hasCinchEvidence: base.sourceCinchStatus !== null,
    });

    // A reviewed human correction, when one exists, takes precedence
    // for display over the naturally-computed value — but disagreement
    // from newer evidence is surfaced (projection.hasConflict), never
    // silently resolved. See serveRelationshipProjection.ts's own
    // comment on why this must never be used to mask a known software
    // defect in the projection logic itself.
    const projection = applyServeRelationshipCorrection(naturalProjection, corrections.get(base.id) ?? null);

    relationshipCounts[projection.relationship] += 1;

    return { base, projection, axiscareMatch };
  });

  return {
    communityName: community.communityName,
    totalResidents: community.metrics.totalResidents,
    records,
    relationshipCounts,
    residentsError: community.residentsError,
  };
}

export interface ResidentServeRelationshipDetail {
  projection: ServeRelationshipProjectionWithCorrection;
  axiscareMatch: AxisCareRelationshipMatch | null;
}

// Same computation as getResidentServeRelationshipProjection() above, but
// also returns the resident's axiscareMatch (identity status, match
// basis, vendor display name) — for pages that need both the relationship
// AND identity-resolution display data in one call, avoiding a second
// full live AxisCare fetch for what's already computed here.
export async function getResidentServeRelationshipDetail(
  residentId: string
): Promise<ResidentServeRelationshipDetail | null> {
  const { records } = await getResidentServeRelationships();
  const record = records.find((r) => r.base.id === residentId);
  if (!record) return null;
  return { projection: record.projection, axiscareMatch: record.axiscareMatch };
}

export interface AuditEligibleActiveClient {
  resident: Resident;
  projection: ServeRelationshipProjectionWithCorrection;
  axiscareMatch: AxisCareRelationshipMatch | null;
}

// Audit Readiness's own population source — the same canonical projection
// /residents' "Active Clients" tab uses (never a second definition), with
// exactly one additional gate: see auditEligibleActiveClient.ts for why an
// AxisCare-sourced match must be identity-confirmed before it's safe to
// hold to a compliance denominator. Excluded (unconfirmed-identity)
// residents simply never enter this list — they are not a Client
// Readiness failure, and remain visible/actionable on the existing
// /reconciliation page instead.
export async function getAuditEligibleActiveClientResidents(): Promise<AuditEligibleActiveClient[]> {
  const { records } = await getResidentServeRelationships();
  return records
    .filter((r) => isAuditEligibleActiveClient(r.projection, r.axiscareMatch?.identityStatus ?? null))
    .map((r) => ({ resident: r.base.resident, projection: r.projection, axiscareMatch: r.axiscareMatch }));
}

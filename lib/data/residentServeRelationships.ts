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
  type ResidentTabValue,
} from "./communityMetrics";
import { getAxisCareClientOperationalSummary, type AxisCareClientOperationalRow } from "./axiscareClientOperationalSummary";
import {
  projectServeRelationship,
  type ServeRelationship,
  type ServeRelationshipProjection,
  type AxisCareRelationshipMatch,
} from "@/lib/residents/serveRelationshipProjection";

export interface EnrichedResidentRecord {
  readonly base: CommunityResidentRecord;
  readonly projection: ServeRelationshipProjection;
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
  // Preserved for anything still reading the legacy tab shape (e.g. the
  // wellness-watch-due query param handling already on the Residents
  // page) — not the new primary filter set.
  legacyResidentTabCounts: Record<ResidentTabValue, number>;
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
    });
  }

  return byResident;
}

export async function getResidentServeRelationships(): Promise<ResidentServeRelationshipsData> {
  const [community, axiscareSummary] = await Promise.all([
    getCommunityMetrics(),
    getAxisCareClientOperationalSummary(),
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

    const projection = projectServeRelationship({
      legacyResidentStatus: base.serveRelationshipStatus,
      activeRelationships: base.activeRelationships.map((r) => ({
        relationshipType: r.relationshipType,
        stage: r.stage,
        status: r.status,
      })),
      axiscareMatch,
      hasCinchEvidence: base.sourceCinchStatus !== null,
    });

    relationshipCounts[projection.relationship] += 1;

    return { base, projection, axiscareMatch };
  });

  return {
    communityName: community.communityName,
    totalResidents: community.metrics.totalResidents,
    records,
    relationshipCounts,
    legacyResidentTabCounts: community.residentTabCounts,
    residentsError: community.residentsError,
  };
}

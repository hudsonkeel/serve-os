// Enriches the existing Residents directory (getCommunityMetrics(), left
// completely unchanged) with the unified Serve relationship projection
// (lib/residents/serveRelationshipProjection.ts), joining in a
// resident's AxisCare match for display purposes — no new identity-
// matching logic here, only reuse of what already exists.
//
// AxisCare Community Mapping + Operational State phase, section 18: this
// now reads the STORED axiscare_client_operational_state table
// (refreshed by the daily sync) instead of calling AxisCare live via
// getAxisCareClientOperationalSummary() — that function still exists,
// unchanged, and is still exactly what the Reconciliation workflow uses
// (it needs live, real-time identity-matching against fresh contact
// data to discover NEW unmatched candidates; normal /residents reads
// never did, they only need each already-known resident's own match
// result, which the sync already computed and stored). Disposition
// overrides are still looked up live here (a fast, internal Supabase
// query, not a live AxisCare call) so a human excluding a record stays
// immediately responsive, exactly as it already was.
import "server-only";
import {
  getCommunityMetrics,
  type CommunityResidentRecord,
} from "./communityMetrics";
import { getAxisCareOperationalStateForResidents, type AxisCareOperationalStateRow } from "./axiscareOperationalState";
import { getAxisCareClientDispositions } from "./axiscareClientDispositions";
import { resolveAxisCareClientOperationalBucket } from "@/lib/integrations/axiscare/clientOperationalStatus";
import type { AxisCareClientDispositionRow } from "@/lib/integrations/axiscare/clientDisposition";
import { getLatestServeRelationshipCorrections } from "./residentServeRelationshipCorrections";
import {
  projectServeRelationship,
  applyServeRelationshipCorrection,
  type ServeRelationship,
  type ServeRelationshipProjectionWithCorrection,
  type AxisCareRelationshipMatch,
} from "@/lib/residents/serveRelationshipProjection";
import { isAuditEligibleActiveClient } from "@/lib/residents/auditEligibleActiveClient";
import type { CommunityQueryFilter } from "@/lib/auth/communityScope";
import type { Resident } from "@/lib/supabase/types";
import type { AxisCareIdentityStatus } from "@/lib/integrations/axiscare/clientOperationalStatus";

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
// record) — confirmed human decisions outrank unconfirmed matches. Same
// tie-break the live path always used; unchanged.
const IDENTITY_PRIORITY: Record<AxisCareIdentityStatus, number> = {
  confirmed: 3,
  candidate: 2,
  needs_identity_review: 1,
  unmatched: 0,
};

function buildResidentAxisCareMatchesFromStoredState(
  storedRows: readonly AxisCareOperationalStateRow[],
  dispositions: Map<string, AxisCareClientDispositionRow>
): Map<string, AxisCareRelationshipMatch> {
  const byResident = new Map<string, AxisCareRelationshipMatch>();

  for (const row of storedRows) {
    if (!row.matchedResidentId) continue;

    // Disposition combined live (Serve's own data, cheap — not a live
    // AxisCare call) so a human override stays immediately responsive,
    // exactly as the live path already did.
    const disposition = dispositions.get(row.axiscareClientId)?.disposition ?? null;
    const operationalBucket = resolveAxisCareClientOperationalBucket(row.computedLifecycle, disposition);
    if (operationalBucket === "excluded") continue;

    const existing = byResident.get(row.matchedResidentId);
    if (existing && IDENTITY_PRIORITY[existing.identityStatus] >= IDENTITY_PRIORITY[row.identityStatus]) {
      continue;
    }

    byResident.set(row.matchedResidentId, {
      axiscareId: row.axiscareClientId,
      operationalBucket,
      identityStatus: row.identityStatus,
      vendorDisplayName: row.vendorDisplayName ?? undefined,
      matchBasis: row.matchBasis ?? undefined,
      statusLabel: row.statusLabel,
      statusActive: row.statusActive,
      classes: row.classCodes,
    });
  }

  return byResident;
}

export async function getResidentServeRelationships(
  filter: CommunityQueryFilter
): Promise<ResidentServeRelationshipsData> {
  // community must resolve first — the stored-state lookup below is
  // scoped to exactly this page's resident ids, not a live roster call,
  // so it genuinely depends on knowing which residents are in scope
  // first (unlike the old live path, which fetched everything
  // regardless and only filtered by resident id afterward).
  const community = await getCommunityMetrics(filter);
  const residentIds = community.residentRecords.map((r) => r.id);

  const [storedAxisCareRows, dispositions, corrections] = await Promise.all([
    getAxisCareOperationalStateForResidents(residentIds),
    getAxisCareClientDispositions(),
    getLatestServeRelationshipCorrections(),
  ]);

  const axiscareMatchesByResident = buildResidentAxisCareMatchesFromStoredState(storedAxisCareRows, dispositions);

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
//
// Scope enforcement falls out of this unchanged: `filter` scopes which
// residents getResidentServeRelationships() returns, so a resident id
// outside the caller's authorized community simply isn't in `records` —
// this resolves to null exactly like a genuinely unknown id, which is
// what a caller pasting a same-app resident URL from another community
// must see (see this phase's brief, section 6). The known
// getResidentServeRelationships()-recompute cost here is unchanged —
// already flagged in the performance baseline, not addressed in this
// pass per its own "no broad optimization" scope.
export async function getResidentServeRelationshipDetail(
  residentId: string,
  filter: CommunityQueryFilter
): Promise<ResidentServeRelationshipDetail | null> {
  const { records } = await getResidentServeRelationships(filter);
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
export async function getAuditEligibleActiveClientResidents(
  filter: CommunityQueryFilter
): Promise<AuditEligibleActiveClient[]> {
  const { records } = await getResidentServeRelationships(filter);
  return records
    .filter((r) => isAuditEligibleActiveClient(r.projection, r.axiscareMatch?.identityStatus ?? null))
    .map((r) => ({ resident: r.base.resident, projection: r.projection, axiscareMatch: r.axiscareMatch }));
}

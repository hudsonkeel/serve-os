// Historical Visit Fact ingestion — the scheduling domain's contribution
// to the shared Historical Fact foundation
// (lib/intelligence/persistence/historicalFacts.ts). Fetches AxisCare
// visits for a date range, normalizes and resolves identity, and ingests
// one scheduling.visit_recorded Fact per Visit (see visitFacts.ts).
//
// This module contains the actual sync logic — the same split already
// used by the client sync (lib/data/axiscareClientSync.ts's
// syncAllConfirmedResidentsCanonical(), called from both
// app/api/axiscare/scheduled-sync/route.ts and a manual "Sync Now"
// trigger): a route handler or script calls this function; it never
// duplicates the logic itself. See scripts/scheduling-visit-history-sync.ts
// for the manual/backfill entry point this phase ships.
import "server-only";
import { getVisitsForDateRangeBounded } from "../integrations/axiscare/visits.ts";
import { isAxisCareScheduleEnabled } from "../integrations/axiscare/config.ts";
import { AxisCareError, type AxisCareErrorCategory } from "../integrations/axiscare/errors.ts";
import type { AxisCareRawVisit } from "../integrations/axiscare/types.ts";
import { normalizeAxisCareVisit } from "./normalize.ts";
import { buildVisitHistoricalFact, type VisitFactResolution } from "./visitFacts.ts";
import { ingestHistoricalFact } from "../intelligence/persistence/historicalFacts.ts";
import { getResidentMatchesByAxisCareClientIds } from "../data/axiscareOperationalState.ts";
import { getPersonVendorIdentityLinksByVendorRecordIds } from "../data/personVendorIdentityLinks.ts";
import type { ServeScheduleVisit } from "./types.ts";

export interface VisitFactSyncCounts {
  readonly fetched: number;
  readonly normalized: number;
  readonly skippedUnresolvedIdentity: number;
  readonly skippedNoOccurrenceTime: number;
  readonly insertedNew: number;
  readonly insertedSuperseding: number;
  readonly unchanged: number;
  readonly errors: number;
}

export type VisitFactSyncResult =
  | ({ readonly available: true; readonly truncated: boolean } & VisitFactSyncCounts)
  | { readonly available: false; readonly reason: AxisCareErrorCategory | "disabled" };

// Fetches, normalizes, resolves identity for, and ingests every Visit
// AxisCare returns for [startDate, endDate] (inclusive, YYYY-MM-DD,
// Central Time — same contract as getVisitsForDateRange()). Idempotent:
// re-running with an unchanged range and unchanged source data produces
// the same Fact set, no duplicates (see ingestHistoricalFact()). Safe to
// use for both routine forward accumulation (a short rolling window) and
// a bounded historical backfill (a wider range) — the same path either
// way, per Phase 5's "do not build a second backfill-specific data model."
export async function syncHistoricalVisitFacts(
  startDate: string,
  endDate: string
): Promise<VisitFactSyncResult> {
  if (!isAxisCareScheduleEnabled()) {
    return { available: false, reason: "disabled" };
  }

  let pages: Awaited<ReturnType<typeof getVisitsForDateRangeBounded>>["pages"];
  let truncated: boolean;
  try {
    ({ pages, truncated } = await getVisitsForDateRangeBounded(startDate, endDate));
  } catch (err) {
    const category = err instanceof AxisCareError ? err.category : "unknown";
    return { available: false, reason: category };
  }

  const rawVisits: AxisCareRawVisit[] = pages.flatMap((page) =>
    Array.isArray(page.results?.visits) ? (page.results!.visits! as AxisCareRawVisit[]) : []
  );

  const normalizedPairs: { raw: AxisCareRawVisit; visit: ServeScheduleVisit }[] = [];
  for (const raw of rawVisits) {
    const visit = normalizeAxisCareVisit(raw);
    if (visit) normalizedPairs.push({ raw, visit });
  }

  // Bulk identity resolution — one query for every resident match, one
  // for every caregiver match in this batch, matching the existing batch
  // pattern (getAxisCareOperationalStateForResidents,
  // getPersonVendorIdentityLinksByVendorRecordIds) rather than a query
  // per Visit.
  const clientExternalIds = Array.from(
    new Set(normalizedPairs.map((p) => p.visit.resident.externalId).filter((id): id is string => id !== null))
  );
  const caregiverExternalIds = Array.from(
    new Set(
      normalizedPairs
        .map((p) => p.visit.caregiver?.externalId ?? null)
        .filter((id): id is string => id !== null)
    )
  );

  const [residentMatches, caregiverLinks] = await Promise.all([
    getResidentMatchesByAxisCareClientIds(clientExternalIds),
    getPersonVendorIdentityLinksByVendorRecordIds("axiscare", "workforce_member", caregiverExternalIds),
  ]);

  const residentMatchByClientId = new Map(residentMatches.map((m) => [m.axiscareClientId, m]));
  const caregiverWorkforceIdByExternalId = new Map<string, string>();
  for (const link of caregiverLinks) {
    if (link.status === "confirmed" && link.subject_id) {
      caregiverWorkforceIdByExternalId.set(link.vendor_record_id, link.subject_id);
    }
  }

  // Mutable accumulator during the loop — VisitFactSyncCounts itself stays
  // readonly (its public contract); only this local working copy needs
  // writable fields.
  let skippedUnresolvedIdentity = 0;
  let skippedNoOccurrenceTime = 0;
  let insertedNew = 0;
  let insertedSuperseding = 0;
  let unchanged = 0;
  let errors = 0;

  for (const { raw, visit } of normalizedPairs) {
    const clientExternalId = visit.resident.externalId;
    const match = clientExternalId ? residentMatchByClientId.get(clientExternalId) : undefined;
    const caregiverExternalId = visit.caregiver?.externalId ?? null;

    const resolution: VisitFactResolution = {
      residentId: match?.residentId ?? null,
      communityId: match?.resolvedCommunityId ?? null,
      caregiverWorkforceMemberId: caregiverExternalId
        ? caregiverWorkforceIdByExternalId.get(caregiverExternalId) ?? null
        : null,
    };

    const built = buildVisitHistoricalFact(raw, visit, resolution);
    if (built.skipped) {
      if (built.reason === "unresolved_resident_identity") skippedUnresolvedIdentity += 1;
      else skippedNoOccurrenceTime += 1;
      continue;
    }

    const { action, error } = await ingestHistoricalFact(built.input);
    if (error) {
      errors += 1;
      continue;
    }
    if (action === "inserted_new") insertedNew += 1;
    else if (action === "inserted_superseding") insertedSuperseding += 1;
    else unchanged += 1;
  }

  const counts: VisitFactSyncCounts = {
    fetched: rawVisits.length,
    normalized: normalizedPairs.length,
    skippedUnresolvedIdentity,
    skippedNoOccurrenceTime,
    insertedNew,
    insertedSuperseding,
    unchanged,
    errors,
  };

  return { available: true, truncated, ...counts };
}

// Production rolling Historical Visit Fact sync — the smallest orchestrator
// that computes a rolling business-date lookback window, delegates to the
// existing syncHistoricalVisitFacts() (never duplicated), and attaches
// diagnostic-only ID-stability observations for the same window.
//
// This module contains the sync's control flow and diagnostics only — all
// normalization/persistence logic still lives in visitFacts.ts /
// visitFactsSync.ts / historicalFacts.ts, exactly as before. The route
// handler that calls this (app/api/scheduling/visit-facts-sync/route.ts)
// and the scheduled trigger that calls the route
// (netlify/functions/scheduling-visit-facts-sync.mts) both contain zero
// sync logic of their own — the same split already established by
// lib/data/axiscareClientSync.ts / app/api/axiscare/scheduled-sync.
import "server-only";
import { syncHistoricalVisitFacts, type VisitFactSyncResult } from "./visitFactsSync.ts";
import { businessDateDaysBefore, businessDateRangeToUtcWindow, utcInstantToBusinessDate } from "./businessTime.ts";
import { todaysDateStringCentral } from "../integrations/axiscare/centralDate.ts";
import { getCurrentFactsByTypeAndWindow } from "../intelligence/persistence/historicalFacts.ts";
import { VISIT_FACT_TYPE } from "./visitFacts.ts";
import { diagnoseIdStability, computeVisitFingerprint, type IdStabilityDiagnostics } from "./visitIdentityDiagnostics.ts";

// 6 days back + today = a 7-business-day rolling lookback. Wide enough to
// catch late clock-in/out entry, verification, and status corrections
// without broadening into a backfill; cheap because unchanged Visits
// always no-op (proven idempotent — see the live validation report).
export const ROLLING_SYNC_LOOKBACK_DAYS = 6;

export interface RollingSyncResult {
  readonly requestedWindow: { readonly startDate: string; readonly endDate: string };
  readonly utcWindow: { readonly startUtc: string; readonly endUtcExclusive: string };
  readonly sync: VisitFactSyncResult;
  // null only if the sync itself was unavailable (e.g. disabled/misconfigured)
  readonly idStability: IdStabilityDiagnostics | null;
  readonly durationMs: number;
}

// referenceBusinessDate defaults to "today" (Central) — overridable only
// for testing/dry-run reproducibility, never for production use.
export async function runRollingVisitFactsSync(referenceBusinessDate?: string): Promise<RollingSyncResult> {
  const startedAt = Date.now();
  const endDate = referenceBusinessDate ?? todaysDateStringCentral();
  const startDate = businessDateDaysBefore(endDate, ROLLING_SYNC_LOOKBACK_DAYS);
  const utcWindow = businessDateRangeToUtcWindow(startDate, endDate);

  const sync = await syncHistoricalVisitFacts(startDate, endDate);

  let idStability: IdStabilityDiagnostics | null = null;
  if (sync.available) {
    const inclusiveEnd = new Date(new Date(utcWindow.endUtcExclusive).getTime() - 1).toISOString();
    const facts = await getCurrentFactsByTypeAndWindow(VISIT_FACT_TYPE, utcWindow.startUtc, inclusiveEnd);
    const records = facts
      .filter((f): f is typeof f & { provenance: { sourceRecordId: string } } => Boolean(f.provenance.sourceRecordId))
      .map((f) => ({
        sourceRecordId: f.provenance.sourceRecordId,
        fingerprint: computeVisitFingerprint(
          f.subject.subjectId,
          utcInstantToBusinessDate(f.occurredAt),
          ((f.payload as Record<string, unknown>).scheduledStart as string | null) ?? null
        ),
      }));
    idStability = diagnoseIdStability(records);
  }

  return {
    requestedWindow: { startDate, endDate },
    utcWindow,
    sync,
    idStability,
    durationMs: Date.now() - startedAt,
  };
}

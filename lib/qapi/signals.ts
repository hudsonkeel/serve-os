// Governance Connective Slice v0.1 — factual, non-interpretive aggregation
// over the Incident/Infection registers and open corrective work.
//
// Deliberately NOT a QAPI intelligence engine: every number here is a
// plain count, group, or rolling window over existing canonical columns —
// no threshold comparison, no severity language, no AI, and nothing here
// ever produces a Finding. Mirrors lib/qapi/dashboard.ts's own role
// exactly: this file composes and formats numbers already computed by
// each domain's own data layer (lib/data/incidents.ts, lib/data/infections.ts,
// lib/compliance/correctiveActionComposition.ts) — it owns no table and
// runs no query of its own.
//
// 30/90-day windows describe a time range for a count, the same
// non-judgmental role EXPIRING_SOON_WINDOW_DAYS plays in
// lib/compliance/requirementSetStatus.ts — they are not thresholds that
// trigger an alert, and there is no comparison anywhere in this file
// against a "should be" value.
//
// "Time from Entry to Review" uses created_at → reviewed_at specifically —
// the one clock both incidents (occurred_at) and infections (disclosed_at,
// date-only) both carry as a precise timestamp. This measures internal
// review turnaround, not elapsed time since the event happened or was
// disclosed; do not relabel it as the latter without adding a second,
// separately-labeled metric.
import { getAllIncidentsForSignals } from "../data/incidents.ts";
import { getAllInfectionsForSignals } from "../data/infections.ts";
import { getAllOpenCorrectiveActionsComposed } from "../compliance/correctiveActionComposition.ts";
import type { Incident, IncidentType, Infection } from "../supabase/types.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function withinDays(iso: string, days: number, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() <= days * MS_PER_DAY;
}

export function medianDays(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface RegisterSignals {
  totalOpen: number;
  totalNeedsReview: number;
  totalResolved: number;
  last30Days: number;
  last90Days: number;
  // Median days between created_at and reviewed_at, across reviewed
  // records only. Null when nothing has been reviewed yet — not zero,
  // which would misleadingly read as "instant."
  medianEntryToReviewDays: number | null;
}

export interface IncidentSignals extends RegisterSignals {
  byType: Partial<Record<IncidentType, number>>;
  injuryOccurredCount: number;
}

export interface RegisterSignalRow {
  status: string;
  review_status: string;
  created_at: string;
  reviewed_at: string | null;
}

// Pure — no I/O. Separated from the fetchers below so the aggregation
// logic itself (counts, windows, median latency) is unit-testable without
// a database, matching composeCorrectiveActions()'s established split in
// lib/compliance/correctiveActionComposition.ts.
export function computeRegisterSignals<T extends RegisterSignalRow>(
  rows: readonly T[],
  occurredOrDisclosedAt: (row: T) => string,
  now: Date
): RegisterSignals {
  const reviewLatencies: number[] = [];
  let totalOpen = 0;
  let totalNeedsReview = 0;
  let totalResolved = 0;
  let last30Days = 0;
  let last90Days = 0;

  for (const row of rows) {
    if (row.status === "open") totalOpen++;
    if (row.status === "resolved") totalResolved++;
    if (row.review_status === "not_reviewed") totalNeedsReview++;
    if (withinDays(occurredOrDisclosedAt(row), 30, now)) last30Days++;
    if (withinDays(occurredOrDisclosedAt(row), 90, now)) last90Days++;
    if (row.reviewed_at) {
      reviewLatencies.push((new Date(row.reviewed_at).getTime() - new Date(row.created_at).getTime()) / MS_PER_DAY);
    }
  }

  return {
    totalOpen,
    totalNeedsReview,
    totalResolved,
    last30Days,
    last90Days,
    medianEntryToReviewDays: medianDays(reviewLatencies),
  };
}

// Pure — no I/O.
export function computeIncidentSignals(incidents: readonly Incident[], now: Date): IncidentSignals {
  const base = computeRegisterSignals(incidents, (i) => i.occurred_at, now);

  const byType: Partial<Record<IncidentType, number>> = {};
  let injuryOccurredCount = 0;
  for (const incident of incidents) {
    byType[incident.incident_type] = (byType[incident.incident_type] ?? 0) + 1;
    if (incident.injury_occurred) injuryOccurredCount++;
  }

  return { ...base, byType, injuryOccurredCount };
}

// Pure — no I/O. disclosed_at is a plain date (no time component) —
// treated as midnight for the rolling-window comparison, same as every
// other date-only field in this codebase.
export function computeInfectionSignals(infections: readonly Infection[], now: Date): RegisterSignals {
  return computeRegisterSignals(infections, (i) => i.disclosed_at, now);
}

export interface CorrectiveWorkSignals {
  totalOpen: number;
  overdueCount: number;
  sourceLinkedCount: number;
}

// Pure — no I/O.
export function computeCorrectiveWorkSignals(
  composed: readonly { dueAt: string | null; sourceIncidentId: string | null; sourceInfectionId: string | null; sourceReviewItemId: string | null }[],
  now: Date
): CorrectiveWorkSignals {
  let overdueCount = 0;
  let sourceLinkedCount = 0;

  for (const action of composed) {
    if (action.dueAt && new Date(action.dueAt).getTime() < now.getTime()) overdueCount++;
    if (action.sourceIncidentId || action.sourceInfectionId || action.sourceReviewItemId) sourceLinkedCount++;
  }

  return { totalOpen: composed.length, overdueCount, sourceLinkedCount };
}

export async function getIncidentSignals(now: Date = new Date()): Promise<IncidentSignals> {
  const incidents = await getAllIncidentsForSignals();
  return computeIncidentSignals(incidents, now);
}

export async function getInfectionSignals(now: Date = new Date()): Promise<RegisterSignals> {
  const infections = await getAllInfectionsForSignals();
  return computeInfectionSignals(infections, now);
}

export async function getCorrectiveWorkSignals(now: Date = new Date()): Promise<CorrectiveWorkSignals> {
  const composed = await getAllOpenCorrectiveActionsComposed();
  return computeCorrectiveWorkSignals(composed, now);
}

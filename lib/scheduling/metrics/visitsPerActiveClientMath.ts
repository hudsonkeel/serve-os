// Pure arithmetic for Financial Metric Registry #12 — Visits per Active
// Client — deliberately split out of visitsPerActiveClient.ts (which also
// imports the DB-touching getAuditEligibleActiveClientResidents()) so this
// zero-dependency calculation stays trivially unit-testable on its own,
// matching this codebase's existing pure-logic/I/O-wrapper split
// (e.g. resolveAxisCareClientOperationalBucket vs. its Supabase callers).
export function calculateVisitsPerActiveClient(
  qualifyingVisitCount: number,
  activeClientCount: number
): { ratio: number | null } {
  return { ratio: activeClientCount === 0 ? null : qualifyingVisitCount / activeClientCount };
}

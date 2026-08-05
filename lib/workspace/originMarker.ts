// Origin marker — the first concrete workflow expression of "Today's Work
// is the operational home" (see
// docs/architecture/TODAYS_WORK_OPERATIONAL_HOME.md). When a user opens a
// record from a Today's Work WorkItemRow, the destination link carries a
// stable marker; the destination page reads it to conditionally show an
// ADDITIVE "Back to Today's Work" link, never replacing that page's
// existing local back-link. Absent the marker (a plain deep link), nothing
// changes. Pure, no I/O.
export const TODAYS_WORK_ORIGIN = "todays-work";

export function withTodaysWorkOrigin(route: string): string {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}from=${TODAYS_WORK_ORIGIN}`;
}

export function hasTodaysWorkOrigin(from: string | undefined | null): boolean {
  return from === TODAYS_WORK_ORIGIN;
}

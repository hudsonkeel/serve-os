// Office Staff Workspace Simplification v0.1 — pure, testable visibility
// rules for app/workspace/page.tsx's Operational Summary cards. Keyed on a
// stable identifier per card (never the display label, which is free to
// change independently) so the page component stays a thin renderer: it
// tags each card definition with its key and filters the array through
// isOperationalSummaryCardVisible before rendering, reusing the viewer's
// already-resolved role rather than adding a second lookup.
//
// Presentation only — never touches lib/data/todaysWork.ts's capability
// filtering (7224450) or which WorkItems exist in the composed array these
// cards count. "Payroll" isn't a Today's Work count at all (a static
// external Viventium link wearing a summary-card layout) and "Governance &
// Quality" is now guaranteed to always read 0 for office_staff (she holds
// none of the three governance capabilities) — both hidden for that role
// as providing no actionable signal, never because the underlying data is
// wrong or unauthorized.
import type { AuthRole } from "../auth/constants.ts";

export type OperationalSummaryCardKey =
  | "assessments"
  | "follow_ups"
  | "wellness_follow_ups"
  | "proposals"
  | "recruiting"
  | "payroll"
  | "governance";

const HIDDEN_FOR_OFFICE_STAFF: readonly OperationalSummaryCardKey[] = ["payroll", "governance"];

export function isOperationalSummaryCardVisible(
  card: OperationalSummaryCardKey,
  role: AuthRole | null | undefined
): boolean {
  if (role !== "office_staff") return true;
  return !HIDDEN_FOR_OFFICE_STAFF.includes(card);
}

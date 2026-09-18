// Human-readable presentation of an AxisCare client-create request (Slice B.1 UX polish,
// 2026-09-19) -- a PRESENTATION over the exact object AssessmentReviewPanel.tsx already
// generates/shows as raw JSON, never a second, independently-derived source of truth. Every
// value below is read directly off the same AxisCareClientCreateRequest the future POST would
// submit -- this module never re-reads Serve facts, never re-runs the Serve->AxisCare mapping in
// clientCreateRequest.ts/axiscareReadiness.ts, and can never disagree with the JSON shown
// alongside it, because it has no other source to disagree from.

import type { AxisCareClientCreateRequest } from "./clientCreateRequest.ts";
import { formatPlainDate } from "../../utils/date.ts";

export interface AxisCareClientCreateSummaryRow {
  readonly label: string;
  readonly value: string;
}

export interface AxisCareClientCreateSummary {
  /** "Firstname Lastname" -- both are guaranteed present on any payload this function is ever
   * given (buildAxisCareClientCreatePayload() throws otherwise), so this is never a fallback
   * placeholder in practice. */
  readonly fullName: string;
  /** The literal boolean this exact request would submit as `status.active` -- rendered as
   * ACTIVE/INACTIVE text by the caller. Never hardcoded to "Inactive": if the underlying mapper's
   * behavior ever changed, this presentation would correctly reflect that, not silently keep
   * claiming Inactive. */
  readonly statusActive: boolean;
  /** Only the fields actually present on the payload -- a field the mapper omitted (because
   * Serve never established it) produces no row here at all, never an empty/placeholder one. */
  readonly clientRows: readonly AxisCareClientCreateSummaryRow[];
  /** Null when the payload has no assessmentDate -- rendered as its own line, separate from
   * clientRows, matching this information's own distinct role (when Serve learned this, not who
   * the client is). */
  readonly assessmentDateDisplay: string | null;
}

function formatAddress(address: AxisCareClientCreateRequest["residentialAddress"]): string | null {
  if (!address) return null;
  const streetLine = [address.streetAddress1, address.streetAddress2].filter(Boolean).join(", ");
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, address.postalCode].filter(Boolean).join(" ");
  const full = [streetLine, cityStateZip].filter(Boolean).join(", ");
  return full.length > 0 ? full : null;
}

/** dateOfBirth/assessmentDate are plain YYYY-MM-DD calendar dates in the AxisCare contract (no
 * time-of-day) -- formatPlainDate() is this codebase's one shared date-only formatter, chosen
 * deliberately over a timezone-aware timestamp formatter to avoid the off-by-one-day bug a UTC
 * instant conversion would introduce for a bare calendar date (see that function's own header
 * comment in lib/utils/date.ts). Falls back to the raw string if it doesn't parse as a plain
 * date, rather than silently hiding a real value the payload actually contains. */
function formatCalendarDate(value: string): string {
  return formatPlainDate(value) ?? value;
}

export function describeAxisCareClientCreatePayload(payload: AxisCareClientCreateRequest): AxisCareClientCreateSummary {
  const fullName = [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim();

  const clientRows: AxisCareClientCreateSummaryRow[] = [];
  if (payload.goesBy) clientRows.push({ label: "Preferred name", value: payload.goesBy });
  if (payload.dateOfBirth) clientRows.push({ label: "Date of birth", value: formatCalendarDate(payload.dateOfBirth) });
  if (payload.homePhone) clientRows.push({ label: "Phone", value: payload.homePhone });
  if (payload.personalEmail) clientRows.push({ label: "Email", value: payload.personalEmail });
  const address = formatAddress(payload.residentialAddress);
  if (address) clientRows.push({ label: "Address", value: address });

  return {
    fullName,
    statusActive: payload.status?.active === true,
    clientRows,
    assessmentDateDisplay: payload.assessmentDate ? formatCalendarDate(payload.assessmentDate) : null,
  };
}

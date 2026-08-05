// Isolation tag for Recruiting Lead Flight evidence — see
// docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md §7 and
// lib/relationships/testMarker.ts for the sibling convention this mirrors.
// Deliberately a distinct prefix, not __SERVE_TEST__: this tags real
// evidence about a real, explicitly approved person gathered during one
// supervised run — not synthetic test data. It exists so this run's rows
// can be identified and removed later (scripts/cleanup-test-data.ts
// --flight-marker=<value>) without presupposing that decision here.
//
// Format: __SERVE_FLIGHT__ <purpose> <run-id>
// Example: __SERVE_FLIGHT__ recruiting-lead-3f9a 20260720T190000Z-a81f

const PREFIX = "__SERVE_FLIGHT__";

function formatTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function generateFlightMarker(
  purpose: string,
  now: Date = new Date(),
  randomSuffix: string = Math.random().toString(16).slice(2, 6)
): string {
  const trimmedPurpose = purpose.trim();
  if (!trimmedPurpose) {
    throw new Error("generateFlightMarker requires a non-blank purpose");
  }
  return `${PREFIX} ${trimmedPurpose} ${formatTimestamp(now)}-${randomSuffix}`;
}

export function isFlightMarker(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

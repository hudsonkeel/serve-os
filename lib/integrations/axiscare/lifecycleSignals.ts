// AxisCare class -> lifecycle signal normalization (AxisCare Community
// Mapping + Operational State phase). Pure, no I/O.
//
// Replaces clientLifecycle.ts's old PROSPECT_CLASS_CODES flat Set, which
// encoded a Frisco-only naming convention ("WAF Prospect") that never
// generalized — confirmed live: AxisCare client #40's real "prospect"
// class is "WAFirewheel Prospect", not "WAF Prospect", so the old check
// silently missed it. This table is the fix: it separates the LIFECYCLE
// half of a mixed class from the location half (see communityMapping.ts
// for the location half), so a class contributes independently to each
// normalized output, exactly as the phase's brief requires:
//
//   "WAFirewheel Prospect"
//     community = watermere_firewheel   (communityMapping.ts)
//     lifecycle signal = prospect       (this file)
//
// Extend only with real, reviewed AxisCare class codes — never a
// generic pattern match (e.g. "Prospect" or "No Visits" appearing
// anywhere in a class string) and never a name/substring heuristic.
//
// "inactive_client" signal (Frisco Needs Review investigation,
// 2026-08-23, authoritative business clarification): Serve deliberately
// keeps an established client Inactive in AxisCare — agreement/
// relationship already in place, ready to be served on request — until
// they actually request service, because activating a client in AxisCare
// has a real cost. "Active No Visits" therefore means "established
// client, currently no scheduled visits," never "never became a real
// client." This is NOT a former/discharged client (see
// clientLifecycle.ts's own header for that distinction) — it's a
// same-day-activatable standby client.
//
// "WAF - Active No Visits" (the pre-per-community-prefix naming — see
// the "WAF Prospect" -> "WAFirewheel Prospect" drift above for the same
// pattern) was previously mapped to "prospect" here. That was reviewed
// against the same confirmed business meaning and corrected: it
// represents the identical operational concept as
// "WAFrisco - Active No Visits", just under the older naming
// convention, so it now maps to "inactive_client" too — never preserved
// as "prospect" merely because that was the original mapping.
export type AxisCareLifecycleSignal = "prospect" | "inactive_client";

export const AXISCARE_LIFECYCLE_CLASS_MAP: Readonly<Record<string, AxisCareLifecycleSignal>> = {
  "WAFrisco Signed Agreement / No Visits": "prospect",
  "WAFirewheel Prospect": "prospect",
  // Historical Frisco-only code, preserved for back-compat in case it
  // still appears on an older record not yet using the "WA<Community>
  // ..." naming above.
  "WAF Prospect": "prospect",
  // Established client, currently no scheduled visits — an
  // inactive/standby client, not a prospect and not a former/discharged
  // client. See this file's header for the confirmed business meaning.
  "WAFrisco - Active No Visits": "inactive_client",
  "WAF - Active No Visits": "inactive_client",
};

// Returns the single reviewed lifecycle signal for a class list, or null
// if none of the classes carry one. Exact string match only — never
// substring/pattern inference.
export function getAxisCareLifecycleSignal(classCodes: readonly string[]): AxisCareLifecycleSignal | null {
  for (const code of classCodes) {
    const signal = AXISCARE_LIFECYCLE_CLASS_MAP[code];
    if (signal) return signal;
  }
  return null;
}

export function hasProspectLifecycleSignal(classCodes: readonly string[]): boolean {
  return getAxisCareLifecycleSignal(classCodes) === "prospect";
}

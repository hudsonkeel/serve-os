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
// generic pattern match on "Prospect" appearing anywhere in a class
// string.
export type AxisCareLifecycleSignal = "prospect";

export const AXISCARE_LIFECYCLE_CLASS_MAP: Readonly<Record<string, AxisCareLifecycleSignal>> = {
  "WAFrisco Signed Agreement / No Visits": "prospect",
  "WAFirewheel Prospect": "prospect",
  // Historical Frisco-only codes, preserved for back-compat in case
  // either still appears on an older record not yet using the two
  // "WA<Community> ..." codes above.
  "WAF Prospect": "prospect",
  "WAF - Active No Visits": "prospect",
};

export function hasProspectLifecycleSignal(classCodes: readonly string[]): boolean {
  return classCodes.some((code) => AXISCARE_LIFECYCLE_CLASS_MAP[code] === "prospect");
}

// Structural, explainable exclusion of AxisCare "community placeholder"
// records (AxisCare Community Mapping + Operational State phase, section
// 7). Pure, no I/O.
//
// Confirmed live: AxisCare client #3 has firstName "Watermere at
// Frisco", lastName "Community" — a non-person administrative row
// representing the community itself, not a real client or prospect.
// Excluding it by exact client ID would be a one-off hack that breaks
// the moment the ID changes or a second community's placeholder is
// created; excluding it by lastName === "Community" is the strongest
// available STRUCTURAL signal — it names the real convention AxisCare's
// own account setup used, and generalizes cleanly to a future
// "Watermere at Firewheel / Community" or "Watermere at McKinney /
// Community" row without any new code.
//
// Tradeoff, made explicit rather than hidden: a real client whose actual
// legal last name is exactly "Community" would also be excluded. This
// was judged acceptable — no such record exists in the current 38-record
// roster, and the alternative (an ID-only exclusion, or no exclusion at
// all) is worse: an ID-only rule silently breaks on the next placeholder
// row, and no exclusion lets a non-person record flow into reconciliation
// as if it were a human.
export function isAxisCareCommunityPlaceholderRecord(input: {
  readonly lastName: string | null;
}): boolean {
  return (input.lastName ?? "").trim().toLowerCase() === "community";
}

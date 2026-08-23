// Stable internal codes + exact display labels for EP_CLIENT_TRIAGE_CLASSIFIED
// (Serve P&P §256, item 4). The three display strings below are not a
// Serve-invented vocabulary — they are AxisCare's own Client Profile
// Triage Level picklist values, confirmed byte-for-byte against production
// AxisCare data (axiscare_client_canonical_snapshot.triage_level_description,
// ids 4/5/6). Preserving them exactly (including the em dash) is
// deliberate: it's what lets Serve's recorded value be compared directly
// against AxisCare's without a lossy/approximate translation, and it's
// what a future write-back phase would push back to AxisCare unchanged.
export const TRIAGE_LEVEL_CODES = ["P1", "P2", "P3"] as const;

export type TriageLevelCode = (typeof TRIAGE_LEVEL_CODES)[number];

export const TRIAGE_LEVEL_LABELS: Record<TriageLevelCode, string> = {
  P1: "PRIORITY 1 — HIGH CONTINUITY NEED",
  P2: "PRIORITY 2 — MODERATE CONTINUITY NEED",
  P3: "PRIORITY 3 — LOW CONTINUITY NEED",
};

export function isTriageLevelCode(value: string | null | undefined): value is TriageLevelCode {
  return value !== null && value !== undefined && (TRIAGE_LEVEL_CODES as readonly string[]).includes(value);
}

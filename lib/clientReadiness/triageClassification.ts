// Stable internal codes + exact display labels for EP_CLIENT_TRIAGE_CLASSIFIED
// (Serve P&P §256, item 4). P1/P2/P3 are Serve's own persisted codes and are
// never renamed to track vocabulary changes -- resident_triage_classifications.
// level_code, every RPC, and every reader are keyed on these three strings.
//
// The display labels below are not a Serve-invented vocabulary -- they are
// AxisCare's own Client Profile Triage Level picklist values. AxisCare
// relabeled this picklist at some point after the original 2026-08-22
// confirmation (which found "PRIORITY 1 — HIGH CONTINUITY NEED" / "PRIORITY 2
// — MODERATE CONTINUITY NEED" / "PRIORITY 3 — LOW CONTINUITY NEED", ids
// 4/5/6). A 2026-09-18 production diagnostic across the 7 residents affected
// by the canonical-source gap confirmed the account now uses "Enhanced
// Support" / "Moderate Support" / "Lower Support / Independent" instead --
// the values below. lib/integrations/axiscare/triageMapping.ts recognizes
// BOTH vocabularies, so a not-yet-re-synced snapshot or historical evidence
// row using the old strings is never treated as unrecognized.
//
// Preserving these exactly (byte-for-byte against whatever AxisCare
// currently returns) is deliberate: it's what lets Serve's recorded value be
// compared directly against AxisCare's without a lossy/approximate
// translation, and it's what a future write-back phase would push back to
// AxisCare unchanged.
export const TRIAGE_LEVEL_CODES = ["P1", "P2", "P3"] as const;

export type TriageLevelCode = (typeof TRIAGE_LEVEL_CODES)[number];

export const TRIAGE_LEVEL_LABELS: Record<TriageLevelCode, string> = {
  P1: "Enhanced Support",
  P2: "Moderate Support",
  P3: "Lower Support / Independent",
};

// Longer, human-facing rationale for each level -- Serve's own governance
// language (not AxisCare's), used as explanatory helper text where a staff
// member is choosing a classification (TriageClassificationControl.tsx),
// never as the exact-match string against AxisCare (that's
// TRIAGE_LEVEL_LABELS above, which must stay byte-identical to AxisCare's
// picklist). Approved 2026-09-18 alongside the Enhanced/Moderate/Lower
// Support baseline-classification standardization; deliberately distinct
// from Incident Response Priority (Immediate Response / Prompt Response /
// Routine Monitoring-Deferred Service), which is a separate EPRP concept
// that can vary independently of a client's baseline support classification.
export const TRIAGE_LEVEL_DESCRIPTIONS: Record<TriageLevelCode, string> = {
  P1: "Interruption of PAS may materially affect safety or essential daily functioning, especially when reliable alternate support is limited.",
  P2: "PAS is important, but temporary disruption can often be managed through the client or reliable alternate support.",
  P3: "Services can generally be deferred for a limited period without an immediate significant safety concern, or reliable alternate support is readily available.",
};

export function isTriageLevelCode(value: string | null | undefined): value is TriageLevelCode {
  return value !== null && value !== undefined && (TRIAGE_LEVEL_CODES as readonly string[]).includes(value);
}

// Rejection provenance — Office Staff Client Readiness UX v0.2 (2026-09-19
// production-acceptance follow-up, refined 2026-09-19). rejectPersonEvidence()
// (lib/data/personEvidence.ts, shared with Workforce) writes whatever
// string it's given straight into person_evidence.notes, overwriting the
// prior value — correct plumbing, but every existing caller passed only
// the reviewer's reason, silently destroying the original contributor's
// own notes. This module is the smallest backward-compatible fix: compose
// one string that preserves both, using the EXISTING single notes column —
// no schema change, no new table, no parallel provenance model (that's
// Priority 4's job). rejectPersonEvidence() itself is untouched; only this
// file's caller (lib/actions/clientReadiness.ts's
// rejectResidentEvidenceAction) uses it, so Workforce's own reject flow is
// unaffected.
//
// Reviewer identity/time are NOT embedded in this text — rejectPersonEvidence()
// already supports verifiedBy/verifiedAt (added for Human Attestation,
// previously never populated by this call site even though the caller
// already computed an actor label); the caller now passes them there,
// using the EXISTING verified_by/verified_at structured columns. Those
// columns are the authoritative record of who/when reviewed — this
// function's only job is to keep the contributor's original free-text
// notes from being destroyed, with the reviewer's reason clearly
// delimited from it ("Review feedback: ..."), never restating who/when in
// free text where it could drift from (or be mistaken for) the structured
// fields.
export function composeRejectionNotes(input: { originalNotes: string | null; reason: string }): string {
  const feedbackLine = `Review feedback: ${input.reason}`;
  const original = input.originalNotes?.trim();
  return original ? `${original}\n\n${feedbackLine}` : feedbackLine;
}

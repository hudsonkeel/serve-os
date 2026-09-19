// Canonical contact normalization (Slice C.2, 2026-09-19) — ONE explicit, documented
// normalization rule for the new contacts domain, written fresh rather than reused.
//
// This repo already has THREE mutually inconsistent phone-normalization
// implementations (lib/residents/roster/normalization.ts: keep every digit found, no
// length check; lib/integrations/axiscare/clientIdentityMatching.ts: require exactly
// 10 digits after optionally stripping a leading US "1", else null;
// lib/workforce/identityDuplicateDetection.ts: keep only the last 10 digits if longer,
// else whatever digits exist) and at least two inconsistent name-stripping rules. See
// the Slice C.1 investigation report. None of them is imported or reused here — each
// was tuned to its own subsystem's data quality, and importing one for contacts would
// silently inherit assumptions nobody has verified hold for assessment-derived contact
// mentions. This module is deliberately its own, narrow, single source of truth for
// contact-identity comparison only — it is not a repo-wide normalization cleanup.

/** trim + lowercase; empty/whitespace-only -> null. This is the one normalization rule
 * every existing subsystem in this repo already agrees on for email. */
export function normalizeContactEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Strips every non-digit character, then strips a single leading US/Canada country code
 * "1" ONLY when doing so leaves exactly 10 digits behind. The final result must be
 * exactly 10 digits to be considered a comparable phone number at all — anything
 * shorter, longer, or otherwise non-US-shaped normalizes to null rather than being
 * compared.
 *
 * Chosen deliberately as the strictest of the repo's three existing rules
 * (clientIdentityMatching.ts's, which this most closely resembles) rather than the more
 * permissive "keep whatever digits exist" rules used by roster import and workforce
 * dedup: those two subsystems ingest data already known to be a phone number from a
 * structured source. Contacts here are frequently mentioned in unstructured assessment
 * conversation transcripts, where treating a short/garbled digit string as a real,
 * comparable phone number risks two unrelated contacts colliding on a false match. A
 * phone this function returns null for is simply treated as "no phone signal" for
 * identity-matching purposes — never coerced into a wrong comparison. */
export function normalizeContactPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const withoutCountryCode = /^1\d{10}$/.test(digits) ? digits.slice(1) : digits;
  return withoutCountryCode.length === 10 ? withoutCountryCode : null;
}

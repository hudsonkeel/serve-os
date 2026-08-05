// apploi.application_exists — a composite, gated observation. Per the
// approved decision, it may normalize to "true" ONLY when every one of the
// following is independently confirmed:
//   1. the selected tab's URL contains a valid applicationID
//   2. the selected tab's URL contains the confirmed candidateID
//   3. exactly one active candidate dialog exists
//   4. the candidate identity gate succeeded (human-confirmed name match)
//   5. the dialog contains exactly one application section associated
//      with the observed position (a single "application" h4 heading,
//      combined with a successfully observed position)
//
// It must NEVER be inferred from candidate name, vendor identity, position,
// application-status text, resume status, or general candidate existence
// alone — those are separate observations with their own separate meaning.
// Inability to confirm any condition produces "not_visible"/"ambiguous"/
// "unknown" — never a fabricated "false".
import type { Locator, Page } from "playwright";
import type { RawObservation } from "../../../collectors/types.ts";

export const APPLICATION_EXISTS_OBSERVATION_KEY = "apploi.application_exists";

// Counts the dialog's "application" section heading — the same h4 anchor
// noted (but not yet used) in the first reconnaissance session. Exact,
// case-insensitive text match only — never a partial/contains match, which
// could silently pick up an unrelated heading.
export async function countApplicationSections(dialog: Page | Locator): Promise<number> {
  return dialog.locator("h4").filter({ hasText: /^application$/i }).count();
}

export interface ApplicationExistsContext {
  readonly applicationIdFromUrl: string | null;
  readonly candidateIdFromUrl: string | null;
  readonly confirmedCandidateId: string;
  readonly dialogCount: number;
  readonly identityConfirmed: boolean;
  readonly applicationSectionCount: number;
  readonly positionObserved: boolean;
}

export function evaluateApplicationExists(
  ctx: ApplicationExistsContext,
  extractorVersion: string,
  observedAt: string
): RawObservation {
  const base = {
    observationKey: APPLICATION_EXISTS_OBSERVATION_KEY,
    rawLabel: null,
    normalizedValue: null,
    sourceLocation: "candidate dialog > application section (h4 'application')",
    extractorVersion,
    extractionConfidence: null,
    matchMethod: null,
    sensitivity: "standard" as const,
    collectionMethod: "automatic_dom" as const,
    observedAt,
  };

  if (!ctx.applicationIdFromUrl || !ctx.candidateIdFromUrl) {
    return { ...base, outcome: "not_visible", failureReason: "url_missing_application_or_candidate_id" };
  }

  if (ctx.candidateIdFromUrl !== ctx.confirmedCandidateId) {
    // Defense in depth only — the vendor-identity resolution step already
    // hard-stops the whole run before this point on a real mismatch.
    return { ...base, outcome: "not_visible", failureReason: "candidate_id_not_confirmed" };
  }

  if (ctx.dialogCount !== 1) {
    return { ...base, outcome: "not_visible", failureReason: `dialog_count_${ctx.dialogCount}` };
  }

  if (!ctx.identityConfirmed) {
    return { ...base, outcome: "not_visible", failureReason: "identity_not_confirmed" };
  }

  if (ctx.applicationSectionCount === 0) {
    return { ...base, outcome: "not_visible", failureReason: "no_application_section_found" };
  }

  if (ctx.applicationSectionCount > 1) {
    return { ...base, outcome: "ambiguous", failureReason: `multiple_application_sections (${ctx.applicationSectionCount})` };
  }

  if (!ctx.positionObserved) {
    // A single application section was found, but it can't be confirmed
    // as associated with the observed position — something was found,
    // just not confidently classified. This is 'unknown', not 'not_visible'.
    return { ...base, outcome: "unknown", failureReason: "position_not_confirmed" };
  }

  return {
    ...base,
    outcome: "observed",
    rawLabel: "true",
    normalizedValue: "true",
    extractionConfidence: "high",
    matchMethod: "text_content",
    failureReason: null,
  };
}

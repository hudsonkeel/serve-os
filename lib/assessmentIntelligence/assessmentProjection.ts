// Renders the current review state (assessment-derived facts + live resolutions + canonical
// profile facts) into the "Assessment" tab's domain-grouped, human-readable structure —
// AssessmentReviewPanel.tsx's professional preview of what Approve will actually produce.
// Deliberately a pure projection over data already computed elsewhere (buildApprovedFactsForReview()
// in reviewExceptions.ts, and the same canonical profile values coverage.ts's
// buildCanonicalCoverageFacts() is built from) — never a second extraction/inference pass, and
// never the source of truth itself. See docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md
// §11 for why this stays a projection rather than becoming a document-as-data-model.

import { FIELD_REGISTRY, DOMAIN_LABELS, type AssessmentDomain } from "./domainRegistry.ts";
import type { AssertionState } from "./factTypes.ts";
import type { CanonicalResidentProfileFacts } from "./coverage.ts";
import type { ApprovedFactInput } from "./reviewExceptions.ts";

// serve_relationship_intelligence deliberately excluded -- domainRegistry.ts's own comment marks
// it Serve-internal sales/relationship-pipeline material, never part of the client-facing
// proposed assessment.
const CLIENT_FACING_DOMAIN_ORDER: readonly AssessmentDomain[] = [
  "identity",
  "residence",
  "important_people",
  "what_why",
  "daily_life",
  "mobility_safety",
  "vision_hearing",
  "cognition",
  "health",
  "advance_planning",
  "when",
];

export type EffectiveFactSource = "assessment" | "profile";

/** One field's current effective value, already merged from whichever source established it.
 * assessment always wins when both exist for the same field_path -- a profile fact only fills a
 * genuine gap, it never overrides something this conversation actually said (see
 * mergeEffectiveFacts() below). */
export interface EffectiveFact {
  readonly fieldPath: string;
  readonly value: unknown;
  readonly assertionState: AssertionState;
  readonly source: EffectiveFactSource;
}

/** The one shared translation from "what got approved" (ApprovedFactInput, reviewExceptions.ts's
 * shape for the approval payload) to "what the projection renders" (EffectiveFact) -- used by
 * both AssessmentReviewPanel.tsx's live pre-approval preview and, at approval time,
 * assessmentSnapshot.ts's buildApprovedAssessmentSnapshot(). Extracted so the two can never
 * render a different picture of "what this assessment established" than what was actually
 * submitted -- one transform, two callers, never two independently-maintained copies.
 *
 * Typed as a Pick, not the full ApprovedFactInput, so the same transform also serves a THIRD
 * caller with a structurally-compatible but distinct shape: ApprovedFactRow, the row already
 * durably written to assessment_approved_facts, which reconcileApprovedAssessmentArtifacts()
 * reads back when reconstructing a snapshot without a fresh approval payload in hand. */
export function approvedFactInputsToEffectiveFacts(
  facts: readonly Pick<ApprovedFactInput, "field_path" | "value" | "assertion_state">[]
): EffectiveFact[] {
  return facts.map((f) => ({
    fieldPath: f.field_path,
    value: f.value,
    assertionState: f.assertion_state as AssertionState,
    source: "assessment" as const,
  }));
}

/** Combines this assessment's own effective facts with canonical profile facts, assessment
 * facts always taking priority for a given field_path. A profile fact satisfying a field must
 * never be represented as though the resident said it during this conversation -- it keeps its
 * own "profile" source tag all the way to display, never silently relabeled "assessment". */
export function mergeEffectiveFacts(
  assessmentFacts: readonly EffectiveFact[],
  profileFacts: readonly EffectiveFact[]
): EffectiveFact[] {
  const byFieldPath = new Map<string, EffectiveFact>();
  for (const fact of profileFacts) byFieldPath.set(fact.fieldPath, fact);
  for (const fact of assessmentFacts) byFieldPath.set(fact.fieldPath, fact); // assessment overwrites profile, never the reverse
  return [...byFieldPath.values()];
}

/** Same resident-profile input coverage.ts's buildCanonicalCoverageFacts() takes -- turned into
 * displayable EffectiveFacts (source "profile") instead of bare presence markers, for the
 * Assessment tab's "From Serve profile" indicator. residence.community is deliberately NOT
 * projected here: for coverage purposes it only needs to answer "is a partner community known
 * at all" (buildCanonicalCoverageFacts() handles that), and the community's actual name is
 * already shown elsewhere on the resident's page -- there's no natural single value to render as
 * a field row here. assertionState "confirmed_yes" is a type formality for these non-boolean
 * values; projectField() below always renders a non-boolean confirmed value as state "value"
 * (the real text), never forced into yes/no. */
export function buildCanonicalProfileEffectiveFacts(resident: CanonicalResidentProfileFacts): EffectiveFact[] {
  const facts: EffectiveFact[] = [];
  const add = (fieldPath: string, value: string | null) => {
    if (value && value.trim()) facts.push({ fieldPath, value, assertionState: "confirmed_yes", source: "profile" });
  };
  add("identity.date_of_birth", resident.dateOfBirth);
  add("identity.phone", resident.phone);
  add("residence.address_line1", resident.addressLine1);
  add("residence.city", resident.city);
  add("residence.state", resident.state);
  add("residence.postal_code", resident.postalCode);
  add("important_people.physician_name", resident.physicianName);
  add("important_people.physician_phone", resident.physicianPhone);
  add("important_people.primary_contact_name", resident.primaryContactName);
  return facts;
}

export type FieldDisplayState = "yes" | "no" | "value" | "uncertain" | "needs_follow_up" | "not_discussed";

export interface ProjectedField {
  readonly fieldPath: string;
  readonly label: string;
  readonly state: FieldDisplayState;
  /** Only meaningful for state "value" or "uncertain" -- the actual text/value to show. Null for
   * "yes"/"no", "needs_follow_up", and "not_discussed" (nothing to show). */
  readonly displayValue: string | null;
  /** Null for "not_discussed" and "needs_follow_up" -- neither has an approved/profile fact
   * backing it. "needs_follow_up" exists only because a reviewer explicitly dispositioned a
   * conflicting/uncertain exception as "Neither / needs follow-up" or "Leave Unknown"
   * (reviewExceptions.ts's isExceptionDispositioned()) -- a deliberate human decision not to
   * assert a value, never a fact establishing one. */
  readonly source: EffectiveFactSource | null;
}

export interface ProjectedDomainSection {
  readonly domain: AssessmentDomain;
  readonly label: string;
  readonly fields: readonly ProjectedField[];
}

function projectField(
  fieldPath: string,
  label: string,
  fact: EffectiveFact | undefined,
  needsFollowUp: boolean
): ProjectedField {
  if (!fact) {
    // No approved/profile fact means either the topic was genuinely never raised, or it WAS
    // raised (possibly with real, conflicting evidence) and a human reviewer explicitly chose
    // not to assert a definitive value for it. Collapsing those two into one "Not discussed"
    // state would erase that a review actually happened -- see needsFollowUp's caller
    // (buildAssessmentProjection) for where that distinction comes from.
    const state = needsFollowUp ? "needs_follow_up" : "not_discussed";
    return { fieldPath, label, state, displayValue: null, source: null };
  }

  if (fact.assertionState === "uncertain") {
    const displayValue = fact.value === null || fact.value === undefined ? null : String(fact.value);
    return { fieldPath, label, state: "uncertain", displayValue, source: fact.source };
  }

  if (typeof fact.value === "boolean" && fact.assertionState === "confirmed_yes") {
    return { fieldPath, label, state: "yes", displayValue: null, source: fact.source };
  }
  if (typeof fact.value === "boolean" && fact.assertionState === "confirmed_no") {
    return { fieldPath, label, state: "no", displayValue: null, source: fact.source };
  }

  // not_applicable, or a non-boolean confirmed/claimed value (e.g. a name, a date, free text) --
  // render the actual text rather than forcing it into yes/no.
  if (fact.assertionState === "not_applicable") {
    return { fieldPath, label, state: "value", displayValue: "Not applicable", source: fact.source };
  }
  const displayValue = fact.value === null || fact.value === undefined ? null : String(fact.value);
  return { fieldPath, label, state: "value", displayValue, source: fact.source };
}

/** A domain section is included only if at least one of its fields has real content -- a domain
 * genuinely never touched (e.g. Advance Planning, often skipped entirely in a routine
 * assessment) collapses away rather than showing a wall of "not discussed" rows. Within an
 * included section, individual "not discussed" fields still show -- that's one of the six
 * states this view is required to distinguish, and it's useful to see what's still open within
 * an otherwise-substantive domain.
 *
 * needsFollowUpFieldPaths -- field paths for a conflicting/uncertain exception the reviewer
 * explicitly dispositioned "Neither / needs follow-up" or "Leave Unknown" (reviewExceptions.ts's
 * isExceptionDispositioned()). These never produce an EffectiveFact (buildApprovedFactsForReview()
 * still contributes nothing for them, unchanged), so without this they'd be indistinguishable
 * from a field genuinely never discussed. Defaults to empty for every existing caller that has
 * no notion of reviewer disposition (e.g. rendering a resident's plain canonical profile facts). */
export function buildAssessmentProjection(
  effectiveFacts: readonly EffectiveFact[],
  needsFollowUpFieldPaths: ReadonlySet<string> = new Set()
): ProjectedDomainSection[] {
  const byFieldPath = new Map<string, EffectiveFact>();
  for (const fact of effectiveFacts) byFieldPath.set(fact.fieldPath, fact);

  const sections: ProjectedDomainSection[] = [];
  for (const domain of CLIENT_FACING_DOMAIN_ORDER) {
    const fields = FIELD_REGISTRY.filter((f) => f.domain === domain).map((f) =>
      projectField(f.fieldPath, f.label, byFieldPath.get(f.fieldPath), needsFollowUpFieldPaths.has(f.fieldPath))
    );
    if (fields.some((field) => field.state !== "not_discussed")) {
      sections.push({ domain, label: DOMAIN_LABELS[domain], fields });
    }
  }
  return sections;
}

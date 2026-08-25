// Approved-fact -> AxisCare candidate mapping (Phase 3/4/5 of the AxisCare end-to-end scope).
// DRY-RUN / PREVIEW ONLY: builds a sanitized candidate payload and a per-field state report.
// Nothing here sends an HTTP request — lib/integrations/axiscare/client.ts remains GET-only by
// construction (see docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md, still authoritative
// during this build phase). Consumes AssessmentExtractionProvider's canonical fact shape and
// reassessmentComparison.ts's classified change rows — never AI draft output directly, and
// never anything below a human-approved fact (see extractionProvider.ts's provider-neutral
// contract and the "AI draft only, human approves" architecture rule this whole system enforces).

import type { AssertionState } from "../../assessmentIntelligence/factTypes.ts";
import type { AxisCareClientClass } from "./types.ts";
import type { AxisCareClientCreateBody, AxisCareClientUpdateBody, AxisCareAddressWrite } from "./clientWritePayloadTypes.ts";
import { findClientClassByLabel } from "./clientClasses.ts";
import type { ReassessmentComparisonRow } from "../../assessmentIntelligence/reassessmentComparison.ts";
import type { AxisCareIdentityLinkState } from "../../assessmentIntelligence/axiscareReadiness.ts";

export type FieldMappingState =
  | "READY"
  | "MISSING_OPTIONAL"
  | "BLOCKING"
  | "UNSUPPORTED"
  | "MANUAL"
  | "UNCHANGED"
  | "REQUIRES_REVIEW";

export interface MappedField {
  axisCareField: string;
  state: FieldMappingState;
  serveFieldPath: string | null;
  value: unknown;
  note: string;
}

export interface ApprovedFactForMapping {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

/** The resident's own canonical Serve identity (first/last name, Serve's own resident ID) —
 * comes from the residents table itself (lib/residents/), NOT from an assessment fact.
 * identity.preferred_name (an assessment fact) maps to AxisCare's `goesBy`, never firstName/
 * lastName — those are already known before an assessment ever happens. */
export interface ResidentIdentityForMapping {
  residentId: string;
  firstName: string;
  lastName: string;
}

// ─── Duplicate-refusal (Phase 4, "refuse creation if an AxisCare identity already exists" /
// "refuse ambiguous duplicate creation") ────────────────────────────────────────────────────
//
// Deliberately reuses computeAxisCareReadiness's existing identity-link routing rather than
// re-implementing it — that function already encodes exactly this policy (a confirmed link ->
// update, not create; a low/medium-confidence proposed link -> blocked pending human
// reconciliation; only an absent or deferred link is safe to create against).

export type CreateEligibility =
  | { eligible: true }
  | { eligible: false; reason: "confirmed_identity_exists"; existingAxisCareClientId: string }
  | { eligible: false; reason: "possible_duplicate_requires_reconciliation" };

export function resolveCreateEligibility(identityLink: AxisCareIdentityLinkState): CreateEligibility {
  if (identityLink.status === "confirmed" && identityLink.axiscareClientId) {
    return { eligible: false, reason: "confirmed_identity_exists", existingAxisCareClientId: identityLink.axiscareClientId };
  }
  if (identityLink.status === "proposed" && identityLink.matchConfidence !== "high") {
    return { eligible: false, reason: "possible_duplicate_requires_reconciliation" };
  }
  if (identityLink.status === "rejected") {
    // A human already looked and said "not a match" — safe to create fresh.
    return { eligible: true };
  }
  if (identityLink.status === "proposed" && identityLink.matchConfidence === "high") {
    // High-confidence proposed-but-unconfirmed match still needs a human decision before
    // either creating (risking a duplicate) or treating it as confirmed.
    return { eligible: false, reason: "possible_duplicate_requires_reconciliation" };
  }
  return { eligible: true }; // no link at all, or deferred
}

// ─── New client candidate (Phase 4) ────────────────────────────────────────────────────────

export interface NewClientCandidateInput {
  residentIdentity: ResidentIdentityForMapping;
  approvedFacts: ApprovedFactForMapping[];
  /** Real, live-fetched classes (GET /api/classes/client) — never hardcoded. */
  availableClasses: AxisCareClientClass[];
  assessmentDate: string; // YYYY-MM-DD
}

export interface ClientCandidate {
  action: "create" | "update";
  payload: AxisCareClientCreateBody | AxisCareClientUpdateBody;
  fieldStates: MappedField[];
  blocking: MappedField[];
  readyToPreview: boolean;
}

function confirmedValue(facts: ApprovedFactForMapping[], fieldPath: string): unknown | undefined {
  const fact = facts.find((f) => f.fieldPath === fieldPath && (f.assertionState === "confirmed_yes" || f.assertionState === "confirmed_no"));
  return fact ? fact.value : undefined;
}

const PROSPECT_CLASS_LABEL_SEARCH = "WAF Prospect";
const PROSPECT_STATUS = "Inactive"; // Serve operating rule: a new prospect must NOT default Active.

export function buildNewClientCandidate(input: NewClientCandidateInput): ClientCandidate {
  const fieldStates: MappedField[] = [];
  const payload: AxisCareClientCreateBody = {
    firstName: input.residentIdentity.firstName,
    lastName: input.residentIdentity.lastName,
  };

  // firstName / lastName — BLOCKING if either is empty. Sourced from Serve's own resident
  // record, never from an assessment fact (see ResidentIdentityForMapping's comment).
  fieldStates.push({
    axisCareField: "firstName",
    state: input.residentIdentity.firstName ? "READY" : "BLOCKING",
    serveFieldPath: null,
    value: input.residentIdentity.firstName || null,
    note: "Sourced from the resident's own canonical Serve record, not an assessment fact.",
  });
  fieldStates.push({
    axisCareField: "lastName",
    state: input.residentIdentity.lastName ? "READY" : "BLOCKING",
    serveFieldPath: null,
    value: input.residentIdentity.lastName || null,
    note: "Sourced from the resident's own canonical Serve record, not an assessment fact.",
  });

  // status — fixed business rule for a new prospect, never derived from a fact, never Active by
  // API default (explicit Phase 4 requirement).
  payload.status = PROSPECT_STATUS;
  fieldStates.push({
    axisCareField: "status",
    state: "READY",
    serveFieldPath: null,
    value: PROSPECT_STATUS,
    note: "Fixed Serve operating rule for new prospects — never left to an API default.",
  });

  // classes — resolved against the REAL configured class list, never a hardcoded code.
  const prospectClass = findClientClassByLabel(input.availableClasses, PROSPECT_CLASS_LABEL_SEARCH);
  if (prospectClass) {
    payload.classes = [{ code: prospectClass.code, label: prospectClass.label }];
    fieldStates.push({
      axisCareField: "classes",
      state: "READY",
      serveFieldPath: null,
      value: [prospectClass],
      note: `Resolved against the live AxisCare class catalog (code: "${prospectClass.code}").`,
    });
  } else {
    fieldStates.push({
      axisCareField: "classes",
      state: "BLOCKING",
      serveFieldPath: null,
      value: null,
      note: `No configured AxisCare class matched "${PROSPECT_CLASS_LABEL_SEARCH}" in the supplied class list — refusing to invent a class code. Re-fetch GET /api/classes/client and confirm the agency's real prospect class label.`,
    });
  }

  // dateOfBirth — optional
  const dob = confirmedValue(input.approvedFacts, "identity.date_of_birth");
  if (dob) {
    payload.dateOfBirth = String(dob);
    fieldStates.push({ axisCareField: "dateOfBirth", state: "READY", serveFieldPath: "identity.date_of_birth", value: dob, note: "" });
  } else {
    fieldStates.push({ axisCareField: "dateOfBirth", state: "MISSING_OPTIONAL", serveFieldPath: "identity.date_of_birth", value: null, note: "Not captured in this assessment." });
  }

  // goesBy — identity.preferred_name maps HERE, never to firstName/lastName.
  const preferredName = confirmedValue(input.approvedFacts, "identity.preferred_name");
  if (preferredName) {
    payload.goesBy = String(preferredName);
    fieldStates.push({ axisCareField: "goesBy", state: "READY", serveFieldPath: "identity.preferred_name", value: preferredName, note: "" });
  } else {
    fieldStates.push({ axisCareField: "goesBy", state: "MISSING_OPTIONAL", serveFieldPath: "identity.preferred_name", value: null, note: "" });
  }

  // personalEmail
  const email = confirmedValue(input.approvedFacts, "identity.email");
  if (email) {
    payload.personalEmail = String(email);
    fieldStates.push({ axisCareField: "personalEmail", state: "READY", serveFieldPath: "identity.email", value: email, note: "" });
  } else {
    fieldStates.push({ axisCareField: "personalEmail", state: "MISSING_OPTIONAL", serveFieldPath: "identity.email", value: null, note: "" });
  }

  // homePhone — Serve captures a single identity.phone field; AxisCare distinguishes home vs
  // mobile. Documented assumption: mapped to homePhone by convention, never guessed as mobile.
  const phone = confirmedValue(input.approvedFacts, "identity.phone");
  if (phone) {
    payload.homePhone = String(phone);
    fieldStates.push({ axisCareField: "homePhone", state: "READY", serveFieldPath: "identity.phone", value: phone, note: "Serve captures one phone field; mapped to homePhone by convention, not asserted as the resident's actual home line." });
  } else {
    fieldStates.push({ axisCareField: "homePhone", state: "MISSING_OPTIONAL", serveFieldPath: "identity.phone", value: null, note: "" });
  }
  fieldStates.push({
    axisCareField: "mobilePhone",
    state: "UNSUPPORTED",
    serveFieldPath: null,
    value: null,
    note: "Serve's domain registry has no distinct mobile-phone field — only one identity.phone field exists.",
  });

  // residentialAddress / billingAddress — AxisCare requires the ENTIRE object (streetAddress1,
  // city, state, postalCode) if specified at all. Serve's domain registry only has
  // residence.address_line1/apartment_unit/community/residence_type — no separate city/state/
  // postalCode fields exist anywhere in the assessment field registry. Building a partial
  // address object would violate AxisCare's "entire object" requirement, and inventing
  // city/state/zip is exactly the kind of fabrication this system forbids. Real gap — MANUAL.
  const addressLine1 = confirmedValue(input.approvedFacts, "residence.address_line1");
  fieldStates.push({
    axisCareField: "residentialAddress",
    state: "MANUAL",
    serveFieldPath: "residence.address_line1",
    value: addressLine1 ?? null,
    note: "AxisCare requires the complete address object (city/state/postalCode included) if sent at all. Serve's domain registry does not currently capture city/state/postal code as separate fields — this must be entered manually in AxisCare, or the domain registry must be extended first, not guessed here.",
  });
  fieldStates.push({
    axisCareField: "billingAddress",
    state: "MANUAL",
    serveFieldPath: null,
    value: null,
    note: "Same structural gap as residentialAddress; Serve has no billing-address concept in the assessment domain at all.",
  });

  // externalId — Serve's own resident ID, so AxisCare's record can be traced back to Serve's
  // canonical record. Deterministic, not fact-derived.
  payload.externalId = input.residentIdentity.residentId;
  fieldStates.push({ axisCareField: "externalId", state: "READY", serveFieldPath: null, value: input.residentIdentity.residentId, note: "Serve's own resident ID, for vendor-side traceability back to the canonical Serve record." });

  // assessmentDate
  payload.assessmentDate = input.assessmentDate;
  fieldStates.push({ axisCareField: "assessmentDate", state: "READY", serveFieldPath: null, value: input.assessmentDate, note: "" });

  // Fields with no Serve counterpart at all — explicitly UNSUPPORTED, never silently omitted
  // without a reason.
  for (const [axisCareField, note] of [
    ["ssn", "Deliberately never mapped, per explicit instruction — Serve does not send SSN to AxisCare."],
    ["medicaidNumber", "No corresponding Serve assessment field exists today."],
    ["region", "No corresponding Serve assessment field exists today; AxisCare region assignment is an operational/administrative concern, not a captured assessment fact."],
    ["referredBy", "No corresponding Serve assessment field exists today."],
    ["preferredCaregiver", "No corresponding Serve assessment field exists today; caregiver assignment happens after intake, not during assessment."],
    ["billingEmail", "No corresponding Serve assessment field exists today (only one email field is captured)."],
    ["otherPhone", "No corresponding Serve assessment field exists today (only one phone field is captured)."],
    ["priorityNote", "No corresponding Serve assessment field exists today."],
    ["startDate", "Service start date is an operational scheduling decision made after AxisCare client creation, not an assessment fact."],
  ] as const) {
    fieldStates.push({ axisCareField, state: "UNSUPPORTED", serveFieldPath: null, value: null, note });
  }

  const blocking = fieldStates.filter((f) => f.state === "BLOCKING");
  return { action: "create", payload, fieldStates, blocking, readyToPreview: blocking.length === 0 };
}

// ─── Update (reassessment) candidate (Phase 5) ─────────────────────────────────────────────
//
// Consumes ONLY human-approved changed/new fields — the caller is responsible for filtering
// reassessmentComparison.ts's output down to what a reviewer actually approved (Phase 5 rule
// 9/10: human approval required, only approved changed fields go downstream). This function
// never reads CHANGED_FACT/NEW_FACT rows that weren't explicitly passed in, and any row whose
// classification is UNCHANGED/NOT_DISCUSSED/CONFLICTING_FACT/REQUIRES_REVIEW is rejected with a
// thrown error rather than silently ignored — a caller passing one of those in is a bug, not a
// normal case.

// Maps a Serve field_path to the exact AxisCare field it feeds, reusing the same mapping table
// shape as the create candidate above (kept intentionally small/explicit — extend deliberately,
// never infer a mapping from name similarity alone).
const SERVE_FIELD_TO_AXISCARE_FIELD: Record<string, keyof AxisCareClientUpdateBody> = {
  "identity.date_of_birth": "dateOfBirth",
  "identity.preferred_name": "goesBy",
  "identity.email": "personalEmail",
  "identity.phone": "homePhone",
};

export function buildUpdateClientCandidate(
  existingAxisCareClientId: string,
  approvedChangeRows: ReassessmentComparisonRow[]
): ClientCandidate & { existingAxisCareClientId: string } {
  const fieldStates: MappedField[] = [];
  const payload: AxisCareClientUpdateBody = {};

  for (const row of approvedChangeRows) {
    if (row.classification !== "CHANGED_FACT" && row.classification !== "NEW_FACT") {
      throw new Error(
        `buildUpdateClientCandidate received a "${row.classification}" row for ${row.fieldPath} — only human-approved CHANGED_FACT/NEW_FACT rows may be passed here. This is a caller bug, not a normal input.`
      );
    }

    const axisCareField = SERVE_FIELD_TO_AXISCARE_FIELD[row.fieldPath];
    if (!axisCareField) {
      fieldStates.push({
        axisCareField: "(none)",
        state: "UNSUPPORTED",
        serveFieldPath: row.fieldPath,
        value: row.proposedNewValue,
        note: "Approved change has no corresponding AxisCare client field — nothing to PATCH for this fact (e.g. a care-need field with no client-record counterpart; may still be relevant to ADL mapping, see adlMapping.ts).",
      });
      continue;
    }

    (payload as Record<string, unknown>)[axisCareField] = row.proposedNewValue;
    fieldStates.push({
      axisCareField,
      state: "READY",
      serveFieldPath: row.fieldPath,
      value: row.proposedNewValue,
      note: `Approved ${row.classification === "NEW_FACT" ? "new fact" : "change"}, included in PATCH.`,
    });
  }

  return {
    action: "update",
    payload,
    fieldStates,
    blocking: [],
    readyToPreview: true,
    existingAxisCareClientId,
  };
}

// Small helper for callers building a UI summary — every non-READY-and-non-UNSUPPORTED field
// worth surfacing prominently ("what did we omit and why").
export function summarizeCandidate(candidate: ClientCandidate) {
  return {
    ready: candidate.fieldStates.filter((f) => f.state === "READY"),
    missingOptional: candidate.fieldStates.filter((f) => f.state === "MISSING_OPTIONAL"),
    blocking: candidate.fieldStates.filter((f) => f.state === "BLOCKING"),
    manual: candidate.fieldStates.filter((f) => f.state === "MANUAL"),
    unsupported: candidate.fieldStates.filter((f) => f.state === "UNSUPPORTED"),
    requiresReview: candidate.fieldStates.filter((f) => f.state === "REQUIRES_REVIEW"),
  };
}

export type { AxisCareAddressWrite };

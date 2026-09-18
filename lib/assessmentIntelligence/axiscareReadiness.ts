// AxisCare client-create readiness + payload builder (Slice B.1, 2026-09-18) — reuses the
// EXISTING governed identity-resolution mechanism (person_vendor_identity_links,
// subject_type='resident') rather than inventing a parallel one. No write path exists here or
// anywhere this module touches — AxisCare's integration remains structurally read-only
// (lib/integrations/axiscare/client.ts hardcodes GET). This module only computes what a proposed
// CREATE/UPDATE payload would look like, and whether it's safe to even propose one.
//
// Four distinct, never-collapsed concepts (Slice B.1 investigation finding: the prior single
// "missing_required_fields" enum conflated all of these into one vague label):
//   API HARD BLOCKERS      — a field AxisCare's own POST /api/clients contract actually requires
//                             is missing. Traced against the checked-in OpenAPI spec
//                             (docs/integrations/axiscare/AxisCare-Customer-API-OpenAPI.yaml):
//                             only firstName/lastName are in that contract's own `required` list.
//   PROCESS HARD BLOCKERS  — Serve's own duplicate-prevention safety gate (identity-link
//                             ambiguity/rejection). Independent of any field's presence; never
//                             relaxed by anything about field completeness.
//   RECOMMENDED MISSING    — useful-but-non-blocking Serve data (date of birth, primary contact
//                             phone). Neither is an AxisCare technical requirement (verified
//                             against the spec) nor a documented current Serve business/
//                             regulatory mandate — kept visible, never blocking.
//   INTEGRATION GAPS       — known gaps between what Serve could inform and what AxisCare's
//                             create-client contract actually supports today (Responsible Party
//                             has no create-time field at all; Serve's partner-community concept
//                             has no confirmed equivalent). Informational only.
//
// See lib/integrations/axiscare/clientCreateRequest.ts for the real AxisCare-shaped request
// contract this module maps into, and its own header comment for the spec citations and
// ambiguities behind every mapping decision below.

import { getFieldDefinition, recommendedForAxisCareFields } from "./domainRegistry.ts";
import type { AssertionState } from "./factTypes.ts";
import type { CanonicalResidentProfileFacts } from "./coverage.ts";
import {
  AxisCareClientCreateRequestSchema,
  AXISCARE_INACTIVE_STATUS,
  type AxisCareAddress,
  type AxisCareClientCreateRequest,
} from "../integrations/axiscare/clientCreateRequest.ts";

export interface ApprovedFactForReadiness {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

export interface AxisCareIdentityLinkState {
  status: "proposed" | "confirmed" | "rejected" | "deferred" | null;
  axiscareClientId: string | null;
  matchConfidence: "high" | "medium" | "low" | null;
}

/** Serve's own identity fields for this resident — a resident's legal first/last name lives on
 * the canonical resident record itself (residents.first_name/last_name), never as an assessment
 * fact (the assessment's own `identity.preferred_name` is a distinct, informal concept — see
 * `goesBy` in the payload mapping below). Passed in by the caller (already fetched), keeping this
 * module free of any database dependency. */
export interface ResidentIdentityForAxisCare {
  readonly firstName: string | null;
  readonly lastName: string | null;
}

export interface MissingFieldSummary {
  readonly fieldPath: string;
  readonly label: string;
}

export interface AxisCareClientCreateEvaluationInput {
  readonly residentId: string;
  readonly resident: ResidentIdentityForAxisCare;
  readonly approvedFacts: readonly ApprovedFactForReadiness[];
  /** Reliable canonical resident/profile facts, same shape/source as the rest of the assessment
   * intelligence layer (coverage.ts, assessmentProjection.ts) — null when no resident row was
   * available to build one from. */
  readonly canonicalProfileFacts: CanonicalResidentProfileFacts | null;
  readonly identityLink: AxisCareIdentityLinkState;
  /** The assessment's own date (session.finished_at ?? session.started_at) — maps to AxisCare's
   * documented `assessmentDate` field. Optional: omitted from the payload entirely if not given. */
  readonly assessmentDate?: string | null;
}

export interface AxisCareClientCreateEvaluation {
  /** Whether AxisCare's own contract could accept this payload right now — independent of
   * Serve's separate identity-duplicate safety gate and independent of anything merely
   * recommended. `payload` is non-null exactly when this is true. */
  readonly technicallyReady: boolean;
  readonly apiHardBlockers: readonly MissingFieldSummary[];
  readonly processHardBlockers: readonly string[];
  readonly recommendedMissing: readonly MissingFieldSummary[];
  readonly integrationGaps: readonly string[];
  readonly proposedAction: "create" | "update" | null;
  readonly existingAxisCareClientId: string | null;
  /** The exact AxisCare client-create request this evaluation would submit — the literal object
   * a future Send-to-AxisCare action would POST, subject only to transport/auth wrapping. Never
   * re-derived or re-interpreted downstream of this. Null whenever technicallyReady is false. */
  readonly payload: AxisCareClientCreateRequest | null;
}

function confirmedFactValue(facts: readonly ApprovedFactForReadiness[], fieldPath: string): unknown {
  const fact = facts.find(
    (f) => f.fieldPath === fieldPath && (f.assertionState === "confirmed_yes" || f.assertionState === "confirmed_no")
  );
  return fact ? fact.value : null;
}

function confirmedStringFact(facts: readonly ApprovedFactForReadiness[], fieldPath: string): string | null {
  const value = confirmedFactValue(facts, fieldPath);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/** DOB and the resident's own address may be established either by this assessment conversation
 * or already known from the resident's canonical profile — assessment wins, profile fills a
 * genuine gap, exactly the same precedence rule assessmentProjection.ts's mergeEffectiveFacts()
 * already applies everywhere else in this layer. `important_people.primary_contact_phone`
 * deliberately has NO canonical-profile fallback here: the existing canonical-profile-facts
 * architecture (coverage.ts's buildCanonicalCoverageFacts()) has never recognized a family-
 * contact phone as canonical, only the family contact's name — this module doesn't invent a new
 * canonical source that architecture doesn't already establish. */
function resolveResidentialAddress(
  facts: readonly ApprovedFactForReadiness[],
  canonical: CanonicalResidentProfileFacts | null
): AxisCareAddress | null {
  const streetAddress1 = firstNonEmpty(confirmedStringFact(facts, "residence.address_line1"), canonical?.addressLine1);
  const city = firstNonEmpty(confirmedStringFact(facts, "residence.city"), canonical?.city);
  const state = firstNonEmpty(confirmedStringFact(facts, "residence.state"), canonical?.state);
  const postalCode = firstNonEmpty(confirmedStringFact(facts, "residence.postal_code"), canonical?.postalCode);
  // AxisCare's own spec: "if specified, must provide the entire object" — the four fields above
  // are exactly the ones the spec itself types as non-nullable strings within the object (see
  // clientCreateRequest.ts's PROPERTY NOTES); apartment/unit is real but optional detail, same
  // rule coverage.ts's own full_address topic already applies.
  if (!streetAddress1 || !city || !state || !postalCode) return null;
  const streetAddress2 = confirmedStringFact(facts, "residence.apartment_unit");
  return { streetAddress1, streetAddress2, city, state, postalCode };
}

/** Which recommended fields (domainRegistry.ts's `recommendedForAxisCare`) are actually
 * satisfied — an explicit per-field resolver, not a generic "any confirmed fact" fallback, so a
 * future addition to that registry flag can't silently be reported "present" without anyone
 * having decided what satisfies it. */
function isRecommendedFieldSatisfied(
  fieldPath: string,
  facts: readonly ApprovedFactForReadiness[],
  canonical: CanonicalResidentProfileFacts | null
): boolean {
  if (fieldPath === "identity.date_of_birth") {
    return firstNonEmpty(confirmedStringFact(facts, fieldPath), canonical?.dateOfBirth) !== null;
  }
  if (fieldPath === "important_people.primary_contact_phone") {
    return confirmedStringFact(facts, fieldPath) !== null; // no canonical fallback — see resolveResidentialAddress's comment
  }
  // Any future recommendedForAxisCare field without an explicit resolver above is intentionally
  // treated as satisfied-by-presence-of-a-confirmed-fact only — the safest default (never reports
  // a field "missing" it doesn't actually know how to check), but whoever adds one should add a
  // real branch here.
  return confirmedFactValue(facts, fieldPath) !== null;
}

/** The exact AxisCare client-create request this Serve data maps to. Callers must check
 * `apiHardBlockers` (via evaluateAxisCareClientCreate) before calling this directly — it throws
 * if firstName/lastName aren't both present, since there is no safe payload to build otherwise. */
export function buildAxisCareClientCreatePayload(input: {
  readonly residentId: string;
  readonly resident: ResidentIdentityForAxisCare;
  readonly approvedFacts: readonly ApprovedFactForReadiness[];
  readonly canonicalProfileFacts: CanonicalResidentProfileFacts | null;
  readonly assessmentDate?: string | null;
}): AxisCareClientCreateRequest {
  if (!input.resident.firstName || !input.resident.lastName) {
    throw new Error("buildAxisCareClientCreatePayload requires a resident with both firstName and lastName present.");
  }

  const dateOfBirth = firstNonEmpty(
    confirmedStringFact(input.approvedFacts, "identity.date_of_birth"),
    input.canonicalProfileFacts?.dateOfBirth
  );
  // Serve does not currently distinguish phone TYPE (home/mobile/other) anywhere in its data
  // model — `identity.phone` is a single generic number. Mapped to AxisCare's `homePhone` as the
  // more conservative default for a resident's own general contact number; this is a mapping
  // judgment call over a real, confirmed value, not an invented value. Revisit if Serve later
  // captures phone type.
  const homePhone = firstNonEmpty(confirmedStringFact(input.approvedFacts, "identity.phone"), input.canonicalProfileFacts?.phone);
  const personalEmail = confirmedStringFact(input.approvedFacts, "identity.email");
  const goesBy = confirmedStringFact(input.approvedFacts, "identity.preferred_name");
  const residentialAddress = resolveResidentialAddress(input.approvedFacts, input.canonicalProfileFacts);

  const candidate = {
    firstName: input.resident.firstName,
    lastName: input.resident.lastName,
    // Serve's inactive-before-active policy — see AXISCARE_INACTIVE_STATUS's own doc comment for
    // why this is never omitted: AxisCare's own endpoint description states a new client is
    // created Active by default if `status` isn't sent explicitly.
    status: AXISCARE_INACTIVE_STATUS,
    // Serve's own canonical resident id — AxisCare's documented `externalId` field exists exactly
    // for this purpose (a caller-supplied back-reference), letting a future reconciliation read
    // find this client by Serve's own id rather than re-matching on name/DOB.
    externalId: input.residentId,
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(homePhone ? { homePhone } : {}),
    ...(personalEmail ? { personalEmail } : {}),
    ...(goesBy ? { goesBy } : {}),
    ...(residentialAddress ? { residentialAddress } : {}),
    ...(input.assessmentDate ? { assessmentDate: input.assessmentDate } : {}),
  };

  // Defense in depth: even though every field above was constructed to already match the
  // contract, this proves the actual object handed back really does conform to AxisCare's real
  // schema before anything downstream could treat it as trustworthy.
  return AxisCareClientCreateRequestSchema.parse(candidate);
}

/** The single entry point this module exposes for "is this resident ready for an AxisCare
 * client-create proposal, and if so, what would it be" — never collapsed into one boolean or one
 * enum string. See this module's own header comment for what each of the four output categories
 * means and why they're kept separate. */
export function evaluateAxisCareClientCreate(input: AxisCareClientCreateEvaluationInput): AxisCareClientCreateEvaluation {
  const apiHardBlockers: MissingFieldSummary[] = [];
  // Serve's own resident-creation flow already requires a name before a resident record can
  // exist at all, so these two are realistically always satisfied in practice — but this module
  // never assumes that; it checks the actual values it was given, exactly like every other field
  // here.
  if (!input.resident.firstName) apiHardBlockers.push({ fieldPath: "resident.first_name", label: "First name" });
  if (!input.resident.lastName) apiHardBlockers.push({ fieldPath: "resident.last_name", label: "Last name" });

  const processHardBlockers: string[] = [];
  let proposedAction: "create" | "update" | null = null;
  let existingAxisCareClientId: string | null = null;

  // A "candidate"/"needs_identity_review" match is exactly the ambiguous case — route to
  // Reconciliation, never resolve it here. Only a genuinely absent link or a fully confirmed one
  // are safe to act on automatically. Deliberately independent of apiHardBlockers/
  // recommendedMissing — a duplicate-risk resident is still a duplicate risk even with a
  // complete profile, and a complete profile never overrides this gate.
  if (input.identityLink.status === "proposed" && input.identityLink.matchConfidence !== "high") {
    processHardBlockers.push(
      "A possible existing AxisCare match was found with insufficient confidence — requires human reconciliation before a client can be created or updated."
    );
  } else if (input.identityLink.status === "confirmed" && input.identityLink.axiscareClientId) {
    proposedAction = "update";
    existingAxisCareClientId = input.identityLink.axiscareClientId;
  } else if (!input.identityLink.status || input.identityLink.status === "deferred") {
    proposedAction = "create";
  } else {
    // rejected, or a proposed-but-high-confidence link with no confirmed id yet — still requires
    // a human decision before anything is proposed.
    processHardBlockers.push(
      "A prior identity match was rejected, or remains unconfirmed — requires human reconciliation before a client can be created."
    );
  }

  const recommendedMissing: MissingFieldSummary[] = [];
  for (const fieldDef of recommendedForAxisCareFields()) {
    if (!isRecommendedFieldSatisfied(fieldDef.fieldPath, input.approvedFacts, input.canonicalProfileFacts)) {
      recommendedMissing.push({ fieldPath: fieldDef.fieldPath, label: fieldDef.label });
    }
  }

  const integrationGaps: string[] = [
    "Responsible Party (primary contact) has no create-time field in AxisCare's client-create contract — it can only be attached after the client exists, via a separate Update Responsible Party call not built in this slice.",
  ];
  if (input.canonicalProfileFacts?.communityId) {
    integrationGaps.push(
      "Serve's partner-community affiliation has no confirmed equivalent field in AxisCare's client-create contract (only an unconfirmed-equivalent free-text 'region' field exists there) — not included in this payload."
    );
  }

  const technicallyReady = apiHardBlockers.length === 0 && processHardBlockers.length === 0;

  const payload = technicallyReady
    ? buildAxisCareClientCreatePayload({
        residentId: input.residentId,
        resident: input.resident,
        approvedFacts: input.approvedFacts,
        canonicalProfileFacts: input.canonicalProfileFacts,
        assessmentDate: input.assessmentDate,
      })
    : null;

  return {
    technicallyReady,
    apiHardBlockers,
    processHardBlockers,
    recommendedMissing,
    integrationGaps,
    proposedAction,
    existingAxisCareClientId,
    payload,
  };
}

// Re-exported so existing callers/tests can resolve a field's display label without importing
// domainRegistry.ts directly for this one purpose.
export { getFieldDefinition };

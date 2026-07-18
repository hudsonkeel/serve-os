import { confidenceBandForScore, scoreIntakeSubmission } from "./confidence.ts";
import type {
  IntakeClassificationResult,
  IntakeEnvelope,
  IntakeReasonCode,
  ResidentMatchResult,
} from "./types.ts";

// Deterministic classification engine — see docs/design/
// SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Classification rules." Pure: no
// database access, no randomness. Given the same envelope, resident-match
// result, and duplicate flag, this always returns the same classification.

export interface ClassifyIntakeInput {
  envelope: IntakeEnvelope;
  // Only meaningful when the envelope's location signal indicates a
  // supported-community context — null when resident matching was never
  // attempted (e.g. an External Prospect submission).
  residentMatch: ResidentMatchResult | null;
  hasPossibleDuplicateRelationship: boolean;
}

const KNOWN_INTAKE_TYPES = new Set([
  "family_care_inquiry",
  "professional_referral",
  "employment_interest",
  "outside_service_area",
]);

function hasContactMethod(envelope: IntakeEnvelope): boolean {
  return !!(envelope.primaryContact.phone || envelope.primaryContact.email);
}

// The current family-consultation form's `location` select is the only
// deterministic Watermere-vs-external signal available (see the field-
// mapping inventory) — matched by keyword, never fuzzy-matched against a
// resident/community name.
type LocationContext = "community" | "external" | "unknown";

function classifyLocationContext(label: string | null): LocationContext {
  if (!label) return "unknown";
  const normalized = label.toLowerCase();
  if (/(communit|assisted|independent living|nursing|facility)/.test(normalized)) return "community";
  if (/(private home|own home|residence)/.test(normalized)) return "external";
  return "unknown";
}

function buildResult(
  classification: IntakeClassificationResult["classification"],
  reasonCodes: IntakeReasonCode[],
  explanation: string,
  requiredReviewActions: string[]
): IntakeClassificationResult {
  const confidenceScore = scoreIntakeSubmission(reasonCodes);
  const confidenceBand = confidenceBandForScore(confidenceScore);

  // A score-driven demotion is a safety net, not the primary mechanism:
  // classification logic below already routes to 'needs_review' whenever
  // a required identity/location/duplicate check fails. This only catches
  // the case where every individual check passed marginally but the
  // combined picture still isn't confident enough to act on automatically.
  const effectiveClassification =
    confidenceBand === "needs_review" && classification !== "not_qualified" && classification !== "needs_review"
      ? "needs_review"
      : classification;

  return {
    classification: effectiveClassification,
    confidenceScore,
    confidenceBand,
    reasonCodes,
    explanation,
    requiredReviewActions: effectiveClassification === "needs_review" ? requiredReviewActions : [],
  };
}

export function classifyIntakeSubmission(input: ClassifyIntakeInput): IntakeClassificationResult {
  const { envelope } = input;

  if (envelope.metadata.honeypotTriggered) {
    return buildResult(
      "not_qualified",
      ["HONEYPOT_TRIGGERED"],
      "Submission triggered the spam honeypot field.",
      []
    );
  }

  if (!KNOWN_INTAKE_TYPES.has(envelope.intakeType)) {
    return buildResult(
      "needs_review",
      ["UNSUPPORTED_INTAKE_TYPE"],
      `Intake type "${envelope.intakeType}" is not a currently supported classification.`,
      ["Reclassify manually"]
    );
  }

  if (!hasContactMethod(envelope)) {
    return buildResult(
      "not_qualified",
      ["NO_CONTACT_INFORMATION"],
      "Submission has no phone number or email address — cannot be followed up on.",
      []
    );
  }

  if (envelope.intakeType === "employment_interest") {
    return classifyEmployment(envelope);
  }

  if (envelope.intakeType === "professional_referral") {
    return classifyProfessionalReferral(envelope, input.hasPossibleDuplicateRelationship);
  }

  // family_care_inquiry and outside_service_area both represent a care
  // inquiry — outside_service_area is a known-external-area variant, so
  // it always takes the external-prospect branch.
  const locationContext =
    envelope.intakeType === "outside_service_area"
      ? "external"
      : classifyLocationContext(envelope.serviceLocation.communityOrLocationLabel);

  if (locationContext === "community") {
    return classifyResidentProspect(envelope, input.residentMatch, input.hasPossibleDuplicateRelationship);
  }

  if (locationContext === "external") {
    return classifyExternalProspect(envelope, input.hasPossibleDuplicateRelationship);
  }

  return buildResult(
    "needs_review",
    ["UNKNOWN_SCHEMA"],
    "Could not determine whether this inquiry is for a supported community or an external service location.",
    ["Reclassify as Resident Prospect", "Reclassify as External Prospect"]
  );
}

function classifyResidentProspect(
  envelope: IntakeEnvelope,
  residentMatch: ResidentMatchResult | null,
  hasPossibleDuplicate: boolean
): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = ["WATERMERE_SELECTED"];
  if (hasContactMethod(envelope)) reasonCodes.push("CONTACT_METHOD_PRESENT");
  if (envelope.careContext.message) reasonCodes.push("SERVICE_NEED_PRESENT");

  if (hasPossibleDuplicate) reasonCodes.push("POSSIBLE_DUPLICATE_RELATIONSHIP");

  if (!residentMatch || residentMatch.reasonCode !== "RESIDENT_EXACT_MATCH" && residentMatch.reasonCode !== "RESIDENT_NAME_UNIT_MATCH") {
    const matchReason = residentMatch?.reasonCode ?? "INSUFFICIENT_RESIDENT_IDENTITY";
    reasonCodes.push(matchReason);
    const actions =
      matchReason === "MULTIPLE_RESIDENT_MATCHES"
        ? ["Select the correct Resident from multiple matches"]
        : ["Link Existing Resident", "Create New Resident Prospect", "Reclassify as External Prospect"];
    return buildResult(
      "needs_review",
      reasonCodes,
      "Submission indicates a supported-community context, but no confident Resident match was found.",
      actions
    );
  }

  reasonCodes.push(residentMatch.reasonCode);

  if (hasPossibleDuplicate) {
    return buildResult(
      "needs_review",
      reasonCodes,
      "A Resident match was found, but a possible duplicate active Relationship already exists.",
      ["Open Existing Relationship", "Confirm New Relationship"]
    );
  }

  return buildResult(
    "resident_prospect",
    reasonCodes,
    "Existing Watermere resident matched; submission classified as a Resident Prospect.",
    []
  );
}

function classifyExternalProspect(
  envelope: IntakeEnvelope,
  hasPossibleDuplicate: boolean
): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = ["EXTERNAL_LOCATION_SELECTED"];
  if (hasContactMethod(envelope)) reasonCodes.push("CONTACT_METHOD_PRESENT");
  if (envelope.careContext.message) reasonCodes.push("SERVICE_NEED_PRESENT");
  if (hasPossibleDuplicate) reasonCodes.push("POSSIBLE_DUPLICATE_RELATIONSHIP");

  const hasProspectiveClientName = !!(envelope.prospectiveClient.firstName && envelope.prospectiveClient.lastName);
  reasonCodes.push(
    hasProspectiveClientName ? "PROSPECTIVE_CLIENT_IDENTITY_COMPLETE" : "PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED"
  );

  // A full postal address (not just a ZIP) is required to create an
  // External Prospect under the current business rules (see
  // docs/design/RELATIONSHIPS.md, "External Prospect domain model") — the
  // current website form only collects a ZIP code, so this branch almost
  // always routes to Needs Review today. That is a documented, honest
  // reflection of the current form's field set, not a bug in this rule.
  const hasCompleteAddress = !!(
    envelope.serviceLocation.addressLine1 &&
    envelope.serviceLocation.city &&
    envelope.serviceLocation.state &&
    envelope.serviceLocation.zip
  );
  reasonCodes.push(hasCompleteAddress ? "SERVICE_LOCATION_COMPLETE" : "SERVICE_LOCATION_INCOMPLETE");

  if (!hasProspectiveClientName || !hasCompleteAddress || hasPossibleDuplicate) {
    const actions: string[] = [];
    if (!hasProspectiveClientName) actions.push("Confirm prospective client name");
    if (!hasCompleteAddress) actions.push("Complete Expected Service Location");
    if (hasPossibleDuplicate) actions.push("Open Existing Relationship", "Confirm New Relationship");

    return buildResult(
      "needs_review",
      reasonCodes,
      "Submission indicates an external service location, but required information is incomplete.",
      actions
    );
  }

  return buildResult(
    "external_prospect",
    reasonCodes,
    "External service location and prospective client identity are both complete.",
    []
  );
}

function classifyProfessionalReferral(
  envelope: IntakeEnvelope,
  hasPossibleDuplicate: boolean
): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = [];
  if (hasContactMethod(envelope)) reasonCodes.push("CONTACT_METHOD_PRESENT");
  if (hasPossibleDuplicate) reasonCodes.push("POSSIBLE_DUPLICATE_RELATIONSHIP");

  const hasReferrerIdentity = !!(envelope.primaryContact.firstName || envelope.primaryContact.fullName);
  const hasOrganization = !!envelope.referralContext.organization;

  if (hasOrganization) reasonCodes.push("REFERRAL_ORGANIZATION_COMPLETE");
  if (!hasReferrerIdentity) reasonCodes.push("REFERRAL_IDENTITY_INCOMPLETE");

  if (!hasReferrerIdentity || hasPossibleDuplicate) {
    const actions: string[] = [];
    if (!hasReferrerIdentity) actions.push("Confirm referring professional's name");
    if (hasPossibleDuplicate) actions.push("Open Existing Relationship", "Confirm New Relationship");
    return buildResult(
      "needs_review",
      reasonCodes,
      "Professional referral is missing information required to create or reuse a Professional Relationship.",
      actions
    );
  }

  return buildResult(
    "professional_relationship",
    reasonCodes,
    "Referring professional identity is complete; classified as a Professional Relationship.",
    []
  );
}

function classifyEmployment(envelope: IntakeEnvelope): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = [];
  if (hasContactMethod(envelope)) reasonCodes.push("CONTACT_METHOD_PRESENT");

  const hasRole = !!envelope.employmentContext.roleInterest;
  const hasIdentity = !!(envelope.primaryContact.firstName || envelope.primaryContact.fullName);

  if (hasRole) reasonCodes.push("EMPLOYMENT_ROLE_IDENTIFIED");
  if (!hasIdentity) reasonCodes.push("EMPLOYMENT_IDENTITY_INCOMPLETE");

  if (!hasIdentity) {
    return buildResult(
      "needs_review",
      reasonCodes,
      "Employment inquiry is missing an applicant name.",
      ["Confirm applicant name"]
    );
  }

  // Employment inquiries never enter the care pipeline or Residents/
  // External Clients — classified as Recruiting (Part 9). When the role
  // couldn't be determined, the confidence score naturally falls below
  // the automatic threshold and this gets demoted to needs_review by the
  // shared safety net in buildResult() (still inside the Intake Queue,
  // never Not Qualified — Part 9: "Do not misclassify employment
  // inquiries as Not Qualified").
  return buildResult(
    "recruiting",
    reasonCodes,
    hasRole
      ? "Employment inquiry with an identified role; routed to Recruiting."
      : "Employment inquiry without a clearly identified role; routed to Recruiting for review.",
    []
  );
}

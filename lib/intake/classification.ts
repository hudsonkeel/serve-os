import { computeContactReadiness, reasonCodesToMissingFieldLabels } from "./contactReadiness.ts";
import { confidenceBandForScore, scoreIntakeSubmission } from "./confidence.ts";
import type {
  IntakeClassificationResult,
  IntakeEnvelope,
  IntakeReasonCode,
  OperationalReadiness,
  ResidentMatchResult,
} from "./types.ts";

// Deterministic classification engine — see docs/design/
// SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Classification rules" and "Contact-Ready
// Principle." Pure: no database access, no randomness. Given the same envelope,
// resident-match result, and duplicate flag, this always returns the same result.
//
// Classification (what kind of thing is this?) and operational readiness (do we know who
// to contact and how?) are deliberately separate axes — a submission can be classified
// `external_prospect` while still being incomplete, as long as it's Contact Ready. Only
// genuine blockers (no name, no contact method, multiple possible resident matches,
// contradictory location signals, unresolved duplicate ambiguity) route to `needs_review`.

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
  operationalReadiness: OperationalReadiness,
  reasonCodes: IntakeReasonCode[],
  explanation: string,
  requiredReviewActions: string[]
): IntakeClassificationResult {
  const confidenceScore = scoreIntakeSubmission(reasonCodes);
  const confidenceBand = confidenceBandForScore(confidenceScore);

  // Confidence is informational only (Part 13) — a completeness/rule-certainty score
  // shown to staff, never a second gate that can override the classification rules below.
  // Whether a genuinely contact-ready inquiry gets a Relationship is decided entirely by
  // `operationalReadiness`, not by this score.
  const missingFields = operationalReadiness === "contact_ready" ? reasonCodesToMissingFieldLabels(reasonCodes) : [];

  return {
    classification,
    operationalReadiness,
    confidenceScore,
    confidenceBand,
    reasonCodes,
    explanation,
    requiredReviewActions: operationalReadiness === "needs_resolution" ? requiredReviewActions : [],
    missingFields,
  };
}

export function classifyIntakeSubmission(input: ClassifyIntakeInput): IntakeClassificationResult {
  const { envelope } = input;

  if (envelope.metadata.honeypotTriggered) {
    return buildResult(
      "not_qualified",
      "not_actionable",
      ["HONEYPOT_TRIGGERED"],
      "Submission triggered the spam honeypot field.",
      []
    );
  }

  if (!KNOWN_INTAKE_TYPES.has(envelope.intakeType)) {
    return buildResult(
      "needs_review",
      "needs_resolution",
      ["UNSUPPORTED_INTAKE_TYPE"],
      `Intake type "${envelope.intakeType}" is not a currently supported classification.`,
      ["Reclassify manually"]
    );
  }

  const contactReadiness = computeContactReadiness(envelope);

  if (contactReadiness.status === "not_actionable") {
    return buildResult(
      "not_qualified",
      "not_actionable",
      contactReadiness.reasonCodes,
      "Submission has no contact name and no phone number or email address — nothing usable to act on.",
      []
    );
  }

  if (contactReadiness.status === "needs_resolution") {
    const missingName = contactReadiness.reasonCodes.includes("MISSING_CONTACT_NAME");
    return buildResult(
      "needs_review",
      "needs_resolution",
      contactReadiness.reasonCodes,
      missingName
        ? "Submission has a phone number or email address, but no contact name — Serve cannot safely determine who to contact."
        : "Submission has a contact name, but no phone number or email address — Serve cannot safely determine how to contact them.",
      missingName ? ["Confirm contact name"] : ["Confirm phone or email"]
    );
  }

  // contact_ready from here on — every branch below decides classification, but never
  // withholds Relationship creation for missing information alone.
  if (envelope.intakeType === "employment_interest") {
    return classifyEmployment(envelope, contactReadiness.reasonCodes);
  }

  if (envelope.intakeType === "professional_referral") {
    return classifyProfessionalReferral(envelope, contactReadiness.reasonCodes, input.hasPossibleDuplicateRelationship);
  }

  // family_care_inquiry and outside_service_area both represent a care inquiry —
  // outside_service_area is a known-external-area variant, so it always takes the
  // external-prospect branch.
  const locationContext =
    envelope.intakeType === "outside_service_area"
      ? "external"
      : classifyLocationContext(envelope.serviceLocation.communityOrLocationLabel);

  // Contradictory routing information (Part 11/PART 3: "conflicting community/location
  // signals") is the one location-related case that stays a hard blocker — everything else
  // about location is "learn during follow-up," not a prerequisite.
  if (locationContext === "community" && envelope.serviceLocation.outsideServiceArea) {
    return buildResult(
      "needs_review",
      "needs_resolution",
      [...contactReadiness.reasonCodes, "CONFLICTING_LOCATION_SIGNALS"],
      "Submission indicates both a supported-community location and an outside-service-area flag — Serve cannot safely determine which workflow applies.",
      ["Reclassify as Resident Prospect", "Reclassify as External Prospect"]
    );
  }

  if (locationContext === "community") {
    return classifyResidentProspect(envelope, contactReadiness.reasonCodes, input.residentMatch, input.hasPossibleDuplicateRelationship);
  }

  // "external" and "unknown" location context both default to External Prospect when
  // contact-ready — an unrecognized location label is missing information to confirm
  // during the first call ("Watermere or external location"), not a blocker (Part 7's own
  // agenda example).
  return classifyExternalProspect(envelope, contactReadiness.reasonCodes, input.hasPossibleDuplicateRelationship);
}

function classifyResidentProspect(
  envelope: IntakeEnvelope,
  contactReasonCodes: IntakeReasonCode[],
  residentMatch: ResidentMatchResult | null,
  hasPossibleDuplicate: boolean
): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = [...contactReasonCodes, "WATERMERE_SELECTED"];
  if (envelope.careContext.message) reasonCodes.push("SERVICE_NEED_PRESENT");
  else reasonCodes.push("INCOMPLETE_CARE_CONTEXT");
  if (envelope.timing.startTiming) reasonCodes.push("TIMING_PRESENT");

  if (hasPossibleDuplicate) {
    return buildResult(
      "needs_review",
      "needs_resolution",
      [...reasonCodes, "POSSIBLE_DUPLICATE_RELATIONSHIP"],
      "A possible duplicate active Relationship already exists for this contact — Serve cannot safely determine whether this is a new inquiry.",
      ["Open Existing Relationship", "Confirm New Relationship"]
    );
  }

  if (residentMatch?.reasonCode === "MULTIPLE_RESIDENT_MATCHES") {
    return buildResult(
      "needs_review",
      "needs_resolution",
      [...reasonCodes, "MULTIPLE_RESIDENT_MATCHES"],
      "Multiple possible Resident matches were found — creating an unlinked Relationship risks operational confusion.",
      ["Select the correct Resident from multiple matches"]
    );
  }

  if (residentMatch?.reasonCode === "RESIDENT_EXACT_MATCH" || residentMatch?.reasonCode === "RESIDENT_NAME_UNIT_MATCH") {
    return buildResult(
      "resident_prospect",
      "contact_ready",
      [...reasonCodes, residentMatch.reasonCode],
      "Existing Watermere resident matched; submission classified as a Resident Prospect.",
      []
    );
  }

  // No confident match (or none attempted) — never guess, but also never withhold
  // follow-up: create an unlinked, contact-ready Relationship and flag resident identity
  // to be confirmed during the call (Part 5).
  return buildResult(
    "resident_prospect",
    "contact_ready",
    [...reasonCodes, residentMatch?.reasonCode ?? "INSUFFICIENT_RESIDENT_IDENTITY", "RESIDENT_LINK_UNRESOLVED"],
    "Submission indicates a supported-community context, but no confident Resident match was found. Classified as an unlinked Resident Prospect pending confirmation.",
    []
  );
}

function classifyExternalProspect(
  envelope: IntakeEnvelope,
  contactReasonCodes: IntakeReasonCode[],
  hasPossibleDuplicate: boolean
): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = [...contactReasonCodes, "EXTERNAL_LOCATION_SELECTED"];
  if (envelope.careContext.message) reasonCodes.push("SERVICE_NEED_PRESENT");
  else reasonCodes.push("INCOMPLETE_CARE_CONTEXT");
  if (envelope.timing.startTiming) reasonCodes.push("TIMING_PRESENT");

  if (hasPossibleDuplicate) {
    return buildResult(
      "needs_review",
      "needs_resolution",
      [...reasonCodes, "POSSIBLE_DUPLICATE_RELATIONSHIP"],
      "A possible duplicate active Relationship already exists for this contact — Serve cannot safely determine whether this is a new inquiry.",
      ["Open Existing Relationship", "Confirm New Relationship"]
    );
  }

  const hasProspectiveClientName = !!(envelope.prospectiveClient.firstName && envelope.prospectiveClient.lastName);
  reasonCodes.push(hasProspectiveClientName ? "PROSPECTIVE_CLIENT_IDENTITY_COMPLETE" : "INCOMPLETE_PROSPECTIVE_CLIENT");

  const hasCompleteAddress = !!(
    envelope.serviceLocation.addressLine1 &&
    envelope.serviceLocation.city &&
    envelope.serviceLocation.state &&
    envelope.serviceLocation.zip
  );
  reasonCodes.push(hasCompleteAddress ? "SERVICE_LOCATION_COMPLETE" : "INCOMPLETE_SERVICE_LOCATION");

  // Missing prospective-client identity and/or a complete postal address are helpful
  // context, not prerequisites (Part 3/4) — the current website form only ever collects a
  // ZIP, so this is the common case, not an exception.
  return buildResult(
    "external_prospect",
    "contact_ready",
    reasonCodes,
    "External service inquiry with a usable contact — classified as an External Prospect.",
    []
  );
}

function classifyProfessionalReferral(
  envelope: IntakeEnvelope,
  contactReasonCodes: IntakeReasonCode[],
  hasPossibleDuplicate: boolean
): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = [...contactReasonCodes];
  // Referrer identity is already confirmed contact-ready by the top-level gate — a missing
  // organization is helpful context only, so its absence adds no "incomplete identity" code.
  if (envelope.referralContext.organization) reasonCodes.push("REFERRAL_ORGANIZATION_COMPLETE");

  if (hasPossibleDuplicate) {
    return buildResult(
      "needs_review",
      "needs_resolution",
      [...reasonCodes, "POSSIBLE_DUPLICATE_RELATIONSHIP"],
      "A possible duplicate active Relationship already exists for this referrer — Serve cannot safely determine whether this is a new referral.",
      ["Open Existing Relationship", "Confirm New Relationship"]
    );
  }

  // Referrer identity is already confirmed contact-ready by the top-level gate — a missing
  // organization is helpful context to collect during follow-up, not a blocker.
  return buildResult(
    "professional_relationship",
    "contact_ready",
    reasonCodes,
    "Referring professional has a usable contact — classified as a Professional Relationship.",
    []
  );
}

function classifyEmployment(envelope: IntakeEnvelope, contactReasonCodes: IntakeReasonCode[]): IntakeClassificationResult {
  const reasonCodes: IntakeReasonCode[] = [...contactReasonCodes];
  const hasRole = !!envelope.employmentContext.roleInterest;
  // Applicant identity is already confirmed contact-ready by the top-level gate — an
  // unidentified role is helpful context only, so its absence adds no reason code (nothing
  // to flag as "incomplete identity," since identity was never in question here).
  if (hasRole) reasonCodes.push("EMPLOYMENT_ROLE_IDENTIFIED");

  // Employment inquiries never enter the care pipeline or Residents/External Clients —
  // classified as Recruiting (Part 9). Applicant identity is already confirmed
  // contact-ready by the top-level gate; an unidentified role is helpful context only.
  return buildResult(
    "recruiting",
    "contact_ready",
    reasonCodes,
    hasRole
      ? "Employment inquiry with an identified role; routed to Recruiting."
      : "Employment inquiry without a clearly identified role; routed to Recruiting.",
    []
  );
}

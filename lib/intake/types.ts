// Canonical Intake Envelope — see docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md.
// The one normalized shape every intake adapter (website today; phone,
// partner referral, hospital API, voice agent, community portal, internal
// forms later) must translate its raw payload into before the core
// processor ever sees it. The core processor (classification, confidence,
// matching, mapping) depends only on this shape — never on
// website-specific field names like "care-for" or "resident_first_name".

export type IntakeSource = "website";

export interface IntakePersonIdentity {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
}

export interface IntakePrimaryContact extends IntakePersonIdentity {
  relationshipToProspectiveClient: string | null;
  // True when the deterministic source rule (e.g. "care-for" === "myself")
  // establishes the primary contact IS the prospective client — mirrors
  // relationships.primary_contact_is_prospective_client from the External
  // Prospect domain-model correction (see docs/design/RELATIONSHIPS.md).
  isProspectiveClient: boolean;
}

export interface IntakeCareContext {
  careFor: string | null;
  message: string | null;
}

export interface IntakeServiceLocation {
  zip: string | null;
  city: string | null;
  state: string | null;
  addressLine1: string | null;
  // Raw location/community select value, e.g. "Assisted or independent
  // living community" or "Private home in Frisco or surrounding area" —
  // the primary Watermere-vs-external signal from the current website
  // form. Never treated as a postal address by itself.
  communityOrLocationLabel: string | null;
  outsideServiceArea: boolean;
}

export interface IntakeServiceNeeds {
  supportType: string | null;
  careNeeds: string | null;
}

export interface IntakeTiming {
  startTiming: string | null;
}

export interface IntakeReferralContext {
  organization: string | null;
  title: string | null;
  reason: string | null;
  referralDetails: string | null;
}

export interface IntakeEmploymentContext {
  roleInterest: string | null;
  linkedin: string | null;
  cityState: string | null;
  resumeFilename: string | null;
  leadershipInterest: string | null;
}

export interface IntakeEnvelope {
  source: IntakeSource;
  sourceSubmissionId: string;
  sourceFormType: string | null;
  sourceSchemaVersion: string;
  intakeType: string;
  receivedAt: string;
  rawSubmissionReference: string;
  prospectiveClient: IntakePersonIdentity;
  primaryContact: IntakePrimaryContact;
  careContext: IntakeCareContext;
  serviceLocation: IntakeServiceLocation;
  serviceNeeds: IntakeServiceNeeds;
  timing: IntakeTiming;
  referralContext: IntakeReferralContext;
  employmentContext: IntakeEmploymentContext;
  metadata: {
    formPayloadKeys: string[];
    honeypotTriggered: boolean;
  };
}

// ─── Classification ─────────────────────────────────────────────────────

export type IntakeClassification =
  | "resident_prospect"
  | "external_prospect"
  | "professional_relationship"
  | "recruiting"
  | "needs_review"
  | "not_qualified";

export type IntakeConfidenceBand =
  | "automatic"
  | "high_confidence"
  | "review_recommended"
  | "needs_review";

export type IntakeReasonCode =
  | "WATERMERE_SELECTED"
  | "EXTERNAL_LOCATION_SELECTED"
  | "RESIDENT_EXACT_MATCH"
  | "RESIDENT_NAME_UNIT_MATCH"
  | "RESIDENT_MATCH_REQUIRED"
  | "MULTIPLE_RESIDENT_MATCHES"
  | "INSUFFICIENT_RESIDENT_IDENTITY"
  | "PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED"
  | "PROSPECTIVE_CLIENT_IDENTITY_COMPLETE"
  | "PRIMARY_CONTACT_IDENTITY_COMPLETE"
  | "PRIMARY_CONTACT_IDENTITY_INCOMPLETE"
  | "SERVICE_LOCATION_COMPLETE"
  | "SERVICE_LOCATION_INCOMPLETE"
  | "CONTACT_METHOD_PRESENT"
  | "CONTACT_METHOD_MISSING"
  | "SERVICE_NEED_PRESENT"
  | "TIMING_PRESENT"
  | "POSSIBLE_DUPLICATE_RELATIONSHIP"
  | "REFERRAL_ORGANIZATION_COMPLETE"
  | "REFERRAL_IDENTITY_INCOMPLETE"
  | "EMPLOYMENT_ROLE_IDENTIFIED"
  | "EMPLOYMENT_IDENTITY_INCOMPLETE"
  | "HONEYPOT_TRIGGERED"
  | "NO_CONTACT_INFORMATION"
  | "DUPLICATE_SUBMISSION_NO_NEW_INFO"
  | "UNSUPPORTED_INTAKE_TYPE"
  | "UNKNOWN_SCHEMA";

export interface IntakeClassificationResult {
  classification: IntakeClassification;
  confidenceScore: number;
  confidenceBand: IntakeConfidenceBand;
  reasonCodes: IntakeReasonCode[];
  explanation: string;
  requiredReviewActions: string[];
}

// Deterministic candidate resident, as returned by the (impure) resident
// search — the matching function itself is pure and takes this shape.
export interface ResidentMatchCandidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  unitNumber: string | null;
  communityName: string | null;
  externalSourceKey: string | null;
}

export type ResidentMatchReasonCode =
  | "RESIDENT_EXACT_MATCH"
  | "RESIDENT_NAME_UNIT_MATCH"
  | "RESIDENT_MATCH_REQUIRED"
  | "MULTIPLE_RESIDENT_MATCHES"
  | "INSUFFICIENT_RESIDENT_IDENTITY";

export interface ResidentMatchResult {
  residentId: string | null;
  reasonCode: ResidentMatchReasonCode;
}

// Pure-function tests for lib/intake/classification.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { classifyIntakeSubmission } from "../classification.ts";
import type { IntakeEnvelope, ResidentMatchResult } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeEnvelope(overrides: Partial<IntakeEnvelope> = {}): IntakeEnvelope {
  return {
    source: "website",
    sourceSubmissionId: "sub-1",
    sourceFormType: "family-consultation",
    sourceSchemaVersion: "website-intake-v1",
    intakeType: "family_care_inquiry",
    receivedAt: "2026-07-17T12:00:00.000Z",
    rawSubmissionReference: "sub-1",
    prospectiveClient: { firstName: null, lastName: null, fullName: null, phone: null, email: null },
    primaryContact: {
      firstName: "Jennifer",
      lastName: "Smith",
      fullName: "Jennifer Smith",
      phone: "5551234567",
      email: "jen@example.com",
      relationshipToProspectiveClient: null,
      isProspectiveClient: false,
    },
    careContext: { careFor: null, message: null },
    serviceLocation: {
      zip: null,
      city: null,
      state: null,
      addressLine1: null,
      communityOrLocationLabel: null,
      outsideServiceArea: false,
    },
    serviceNeeds: { supportType: null, careNeeds: null },
    timing: { startTiming: null },
    referralContext: { organization: null, title: null, reason: null, referralDetails: null },
    employmentContext: {
      roleInterest: null,
      linkedin: null,
      cityState: null,
      resumeFilename: null,
      leadershipInterest: null,
    },
    metadata: { formPayloadKeys: [], honeypotTriggered: false },
    ...overrides,
  };
}

const EXACT_MATCH: ResidentMatchResult = { residentId: "res-1", reasonCode: "RESIDENT_EXACT_MATCH" };
const NO_MATCH: ResidentMatchResult = { residentId: null, reasonCode: "RESIDENT_MATCH_REQUIRED" };
const MULTIPLE_MATCH: ResidentMatchResult = { residentId: null, reasonCode: "MULTIPLE_RESIDENT_MATCHES" };

// ─── Contact Ready — Resident Prospect ──────────────────────────────────

test("1. community context + exact resident match -> resident_prospect, contact_ready", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted or independent living community" },
    careContext: { careFor: "A parent or family member", message: "Needs help" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "resident_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
});

test("2. community context + no resident match -> resident_prospect, unlinked, still contact_ready (Part 5)", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted or independent living community" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: NO_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "resident_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
  assert.ok(result.reasonCodes.includes("RESIDENT_LINK_UNRESOLVED"));
});

// ─── Needs Resolution — genuine ambiguity ───────────────────────────────

test("16. community context + multiple resident matches -> needs_review, needs_resolution (ambiguity, not incompleteness)", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Independent Living" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: MULTIPLE_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.deepEqual(result.requiredReviewActions, ["Select the correct Resident from multiple matches"]);
});

test("17. duplicate ambiguity — resident match found but a possible duplicate Relationship exists -> needs_resolution, never silently reused", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted living" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: true });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.ok(result.reasonCodes.includes("POSSIBLE_DUPLICATE_RELATIONSHIP"));
});

// ─── Contact Ready — External Prospect ──────────────────────────────────

test("3. external location + complete identity/address -> external_prospect, contact_ready", () => {
  const envelope = makeEnvelope({
    prospectiveClient: { firstName: "Margaret", lastName: "Smith", fullName: "Margaret Smith", phone: "5551234567", email: null },
    serviceLocation: {
      zip: "78735",
      city: "Austin",
      state: "TX",
      addressLine1: "123 Oak Lane",
      communityOrLocationLabel: "Private home in Frisco or surrounding area",
      outsideServiceArea: false,
    },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "external_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
});

test("6. external location, ZIP-only service location -> still external_prospect, contact_ready (Part 4: no longer blocks)", () => {
  const envelope = makeEnvelope({
    prospectiveClient: { firstName: "Jennifer", lastName: "Smith", fullName: "Jennifer Smith", phone: "5551234567", email: null },
    serviceLocation: { ...makeEnvelope().serviceLocation, zip: "78735", communityOrLocationLabel: "Private home in Frisco or surrounding area" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "external_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
  assert.ok(result.reasonCodes.includes("INCOMPLETE_SERVICE_LOCATION"));
  assert.ok(result.missingFields.includes("Where care would be provided"));
});

test("7. external location, care-for someone else with no separate name field -> still external_prospect, contact_ready", () => {
  const envelope = makeEnvelope({
    careContext: { careFor: "A parent or family member", message: null },
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Private home in Frisco or surrounding area" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "external_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
  assert.ok(result.reasonCodes.includes("INCOMPLETE_PROSPECTIVE_CLIENT"));
  assert.ok(result.missingFields.includes("Who needs care"));
});

test("9. unknown/unrecognized location label -> defaults to external_prospect, contact_ready (Part 7: learn during follow-up)", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Not sure yet" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "external_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
});

test("18. duplicate ambiguity on an external inquiry -> needs_resolution", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Private home" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: true });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
});

test("19. conflicting community/location signals -> needs_review, needs_resolution", () => {
  const envelope = makeEnvelope({
    serviceLocation: {
      ...makeEnvelope().serviceLocation,
      communityOrLocationLabel: "Assisted living community",
      outsideServiceArea: true,
    },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.ok(result.reasonCodes.includes("CONFLICTING_LOCATION_SIGNALS"));
});

// ─── Contact Ready — Professional Relationship ──────────────────────────

test("8. professional referral with full identity -> professional_relationship, contact_ready", () => {
  const envelope = makeEnvelope({
    intakeType: "professional_referral",
    referralContext: { organization: "Test SNF", title: "Discharge Planner", reason: "Patient / client referral", referralDetails: "John needs help" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "professional_relationship");
  assert.equal(result.operationalReadiness, "contact_ready");
});

test("12. professional referral with usable contact but no organization -> still professional_relationship, contact_ready", () => {
  const envelope = makeEnvelope({
    intakeType: "professional_referral",
    referralContext: { organization: null, title: null, reason: null, referralDetails: "Referring a resident's family." },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "professional_relationship");
  assert.equal(result.operationalReadiness, "contact_ready");
});

test("20. professional referral, possible duplicate referral source -> needs_resolution", () => {
  const envelope = makeEnvelope({
    intakeType: "professional_referral",
    referralContext: { organization: "Test SNF", title: null, reason: null, referralDetails: null },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: true });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
});

// ─── Contact Ready — Recruiting ──────────────────────────────────────────

test("11. employment interest with role and identity -> recruiting, contact_ready", () => {
  const envelope = makeEnvelope({
    intakeType: "employment_interest",
    employmentContext: { roleInterest: "managing_director", linkedin: null, cityState: null, resumeFilename: "resume.pdf", leadershipInterest: null },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "recruiting");
  assert.equal(result.operationalReadiness, "contact_ready");
});

test("10. employment interest never becomes not_qualified even with an unidentified role", () => {
  const envelope = makeEnvelope({ intakeType: "employment_interest" });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.notEqual(result.classification, "not_qualified");
  assert.equal(result.classification, "recruiting");
});

// ─── Needs Resolution — missing name or contact method ──────────────────

test("13. phone but no contact name -> needs_review, needs_resolution, MISSING_CONTACT_NAME", () => {
  const envelope = makeEnvelope({
    primaryContact: { firstName: null, lastName: null, fullName: null, phone: "5551234567", email: null, relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.ok(result.reasonCodes.includes("MISSING_CONTACT_NAME"));
});

test("14. email but no contact name -> needs_review, needs_resolution, MISSING_CONTACT_NAME", () => {
  const envelope = makeEnvelope({
    primaryContact: { firstName: null, lastName: null, fullName: null, phone: null, email: "test@example.com", relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.ok(result.reasonCodes.includes("MISSING_CONTACT_NAME"));
});

test("15. name with no phone or email -> needs_review, needs_resolution, MISSING_CONTACT_METHOD (not not_qualified)", () => {
  const envelope = makeEnvelope({
    primaryContact: { firstName: "A", lastName: "B", fullName: "A B", phone: null, email: null, relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.ok(result.reasonCodes.includes("MISSING_CONTACT_METHOD"));
});

// ─── Not Qualified ────────────────────────────────────────────────────

test("21. honeypot triggered -> not_qualified, regardless of everything else", () => {
  const envelope = makeEnvelope({ metadata: { formPayloadKeys: [], honeypotTriggered: true } });
  const result = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "not_qualified");
  assert.equal(result.operationalReadiness, "not_actionable");
  assert.deepEqual(result.reasonCodes, ["HONEYPOT_TRIGGERED"]);
});

test("23. total absence of usable contact data (no name, no phone, no email) -> not_qualified", () => {
  const envelope = makeEnvelope({
    primaryContact: { firstName: null, lastName: null, fullName: null, phone: null, email: null, relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "not_qualified");
  assert.equal(result.operationalReadiness, "not_actionable");
  assert.ok(result.reasonCodes.includes("NO_CONTACT_INFORMATION"));
});

// ─── Ambiguity / unsupported schema ───────────────────────────────────

test("4. unsupported intake type -> needs_review, needs_resolution, never silently dropped or guessed", () => {
  const envelope = makeEnvelope({ intakeType: "some_future_intake_type" });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.equal(result.operationalReadiness, "needs_resolution");
  assert.ok(result.reasonCodes.includes("UNSUPPORTED_INTAKE_TYPE"));
});

// ─── Confidence is informational only (Part 13) ──────────────────────────

test("5. a low completeness score never demotes a contact-ready classification", () => {
  // Minimal external inquiry: contact-ready, but almost every completeness signal is
  // absent (no address, no prospective-client identity, no message, no timing) — the old
  // "score below 70 -> needs_review" safety net would have wrongly demoted this.
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Private home" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.ok(result.confidenceScore < 70, "expected a low completeness score for this test to be meaningful");
  assert.equal(result.classification, "external_prospect");
  assert.equal(result.operationalReadiness, "contact_ready");
});

// ─── Determinism ────────────────────────────────────────────────────────

test("22. identical inputs always produce an identical result", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted living community" },
  });
  const a = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: false });
  const b = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: false });
  assert.deepEqual(a, b);
});

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();

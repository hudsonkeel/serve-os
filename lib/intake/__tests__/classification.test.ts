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

// ─── Resident Prospect ────────────────────────────────────────────────

test("1. community context + exact resident match -> resident_prospect, automatic-tier confidence", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted or independent living community" },
    careContext: { careFor: "A parent or family member", message: "Needs help" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "resident_prospect");
  assert.ok(result.confidenceScore >= 90);
});

test("2. community context + no resident match -> needs_review with RESIDENT_MATCH_REQUIRED", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted or independent living community" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: NO_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.ok(result.reasonCodes.includes("RESIDENT_MATCH_REQUIRED"));
  assert.ok(result.requiredReviewActions.includes("Link Existing Resident"));
});

test("3. community context + multiple resident matches -> needs_review, distinct action set", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Independent Living" },
  });
  const result = classifyIntakeSubmission({
    envelope,
    residentMatch: { residentId: null, reasonCode: "MULTIPLE_RESIDENT_MATCHES" },
    hasPossibleDuplicateRelationship: false,
  });
  assert.equal(result.classification, "needs_review");
  assert.deepEqual(result.requiredReviewActions, ["Select the correct Resident from multiple matches"]);
});

test("4. resident match found but a possible duplicate Relationship exists -> needs_review, never silently reused", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Assisted living" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: true });
  assert.equal(result.classification, "needs_review");
  assert.ok(result.reasonCodes.includes("POSSIBLE_DUPLICATE_RELATIONSHIP"));
});

// ─── External Prospect ──────────────────────────────────────────────────

test("5. external location + complete identity/address -> external_prospect", () => {
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
});

test("6. external location but only a ZIP (current website form's real limitation) -> needs_review, Complete Expected Service Location", () => {
  const envelope = makeEnvelope({
    prospectiveClient: { firstName: "Jennifer", lastName: "Smith", fullName: "Jennifer Smith", phone: "5551234567", email: null },
    serviceLocation: { ...makeEnvelope().serviceLocation, zip: "78735", communityOrLocationLabel: "Private home in Frisco or surrounding area" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.ok(result.requiredReviewActions.includes("Complete Expected Service Location"));
});

test("7. external location, care-for someone else, no separate name field -> needs_review, PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED", () => {
  const envelope = makeEnvelope({
    careContext: { careFor: "A parent or family member", message: null },
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Private home in Frisco or surrounding area" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.ok(result.reasonCodes.includes("PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED"));
});

// ─── Professional Relationship ───────────────────────────────────────────

test("8. professional referral with full identity -> professional_relationship", () => {
  const envelope = makeEnvelope({
    intakeType: "professional_referral",
    referralContext: { organization: "Test SNF", title: "Discharge Planner", reason: "Patient / client referral", referralDetails: "John needs help" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "professional_relationship");
});

test("9. professional referral missing referrer identity -> needs_review", () => {
  const envelope = makeEnvelope({
    intakeType: "professional_referral",
    primaryContact: { firstName: null, lastName: null, fullName: null, phone: "5551234567", email: null, relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
});

test("10. professional referral, possible duplicate referral source -> needs_review", () => {
  const envelope = makeEnvelope({
    intakeType: "professional_referral",
    referralContext: { organization: "Test SNF", title: null, reason: null, referralDetails: null },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: true });
  assert.equal(result.classification, "needs_review");
});

// ─── Recruiting ───────────────────────────────────────────────────────

test("11. employment interest with role and identity -> recruiting", () => {
  const envelope = makeEnvelope({
    intakeType: "employment_interest",
    employmentContext: { roleInterest: "managing_director", linkedin: null, cityState: null, resumeFilename: "resume.pdf", leadershipInterest: null },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "recruiting");
});

test("12. employment interest never becomes not_qualified even with an unidentified role", () => {
  const envelope = makeEnvelope({ intakeType: "employment_interest" });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.notEqual(result.classification, "not_qualified");
});

test("13. employment interest missing applicant name -> needs_review", () => {
  const envelope = makeEnvelope({
    intakeType: "employment_interest",
    primaryContact: { firstName: null, lastName: null, fullName: null, phone: null, email: "test@example.com", relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
});

// ─── Not Qualified ────────────────────────────────────────────────────

test("14. honeypot triggered -> not_qualified, regardless of everything else", () => {
  const envelope = makeEnvelope({ metadata: { formPayloadKeys: [], honeypotTriggered: true } });
  const result = classifyIntakeSubmission({ envelope, residentMatch: EXACT_MATCH, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "not_qualified");
  assert.deepEqual(result.reasonCodes, ["HONEYPOT_TRIGGERED"]);
});

test("15. no phone and no email at all -> not_qualified (cannot be followed up on)", () => {
  const envelope = makeEnvelope({
    primaryContact: { firstName: "A", lastName: "B", fullName: "A B", phone: null, email: null, relationshipToProspectiveClient: null, isProspectiveClient: false },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "not_qualified");
  assert.ok(result.reasonCodes.includes("NO_CONTACT_INFORMATION"));
});

// ─── Ambiguity / unsupported schema ───────────────────────────────────

test("16. unsupported intake type -> needs_review, never silently dropped or guessed", () => {
  const envelope = makeEnvelope({ intakeType: "some_future_intake_type" });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.ok(result.reasonCodes.includes("UNSUPPORTED_INTAKE_TYPE"));
});

test("17. family_care_inquiry with an unrecognized/ambiguous location label -> needs_review, offers both reclassification actions", () => {
  const envelope = makeEnvelope({
    serviceLocation: { ...makeEnvelope().serviceLocation, communityOrLocationLabel: "Not sure yet" },
  });
  const result = classifyIntakeSubmission({ envelope, residentMatch: null, hasPossibleDuplicateRelationship: false });
  assert.equal(result.classification, "needs_review");
  assert.deepEqual(result.requiredReviewActions, ["Reclassify as Resident Prospect", "Reclassify as External Prospect"]);
});

// ─── Determinism ────────────────────────────────────────────────────────

test("18. identical inputs always produce an identical result", () => {
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

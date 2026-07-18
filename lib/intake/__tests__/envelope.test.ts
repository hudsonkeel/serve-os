// Pure-function tests for lib/intake/envelope.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { normalizeIntakeSubmission } from "../envelope.ts";
import type { IntakeSubmission } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeRow(overrides: Partial<IntakeSubmission> = {}): IntakeSubmission {
  return {
    id: "sub-1",
    created_at: "2026-07-17T12:00:00.000Z",
    intake_type: "family_care_inquiry",
    source: "website",
    status: "new",
    name: null,
    phone: null,
    email: null,
    zip: null,
    community: null,
    city: null,
    form_payload: null,
    outside_service_area: false,
    client_submission_id: null,
    ...overrides,
  };
}

test("1. family_care_inquiry with care-for=myself: submitter becomes prospective client", () => {
  const row = makeRow({
    name: "Jennifer Smith",
    phone: "5551234567",
    email: "jen@example.com",
    zip: "78735",
    community: "Private home in Frisco or surrounding area",
    form_payload: { "care-for": "myself", message: "Need help", "form-name": "family-consultation" },
  });
  const envelope = normalizeIntakeSubmission(row);
  assert.deepEqual(envelope.prospectiveClient, {
    firstName: "Jennifer",
    lastName: "Smith",
    fullName: "Jennifer Smith",
    phone: "5551234567",
    email: "jen@example.com",
  });
  assert.equal(envelope.primaryContact.isProspectiveClient, true);
});

test("2. family_care_inquiry with care-for=someone else: prospective client identity is empty, not guessed", () => {
  const row = makeRow({
    name: "Jennifer Smith",
    phone: "5551234567",
    form_payload: { "care-for": "A parent or family member" },
  });
  const envelope = normalizeIntakeSubmission(row);
  assert.deepEqual(envelope.prospectiveClient, {
    firstName: null,
    lastName: null,
    fullName: null,
    phone: null,
    email: null,
  });
  assert.equal(envelope.primaryContact.isProspectiveClient, false);
  assert.equal(envelope.primaryContact.fullName, "Jennifer Smith");
});

test("2b. (Scope J) care-for=someone else, with an explicit care_recipient name -> used, not discarded", () => {
  const row = makeRow({
    name: "Jennifer Smith",
    phone: "5551234567",
    form_payload: {
      "care-for": "A parent or family member",
      care_recipient_first_name: "Margaret",
      care_recipient_last_name: "Smith",
    },
  });
  const envelope = normalizeIntakeSubmission(row);
  assert.deepEqual(envelope.prospectiveClient, {
    firstName: "Margaret",
    lastName: "Smith",
    fullName: "Margaret Smith",
    phone: null,
    email: null,
  });
  assert.equal(envelope.primaryContact.isProspectiveClient, false);
});

test("3. professional_referral: organization/title/reason/referral-details mapped", () => {
  const row = makeRow({
    intake_type: "professional_referral",
    name: "Test Professional",
    phone: "1234567890",
    form_payload: {
      title: "Discharge Planner",
      organization: "Test SNF",
      reason: "Patient / client referral",
      "referral-details": "John needs help",
    },
  });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.referralContext.organization, "Test SNF");
  assert.equal(envelope.referralContext.title, "Discharge Planner");
  assert.equal(envelope.referralContext.reason, "Patient / client referral");
  assert.equal(envelope.referralContext.referralDetails, "John needs help");
});

test("4. employment_interest: full-name split, resume filename, role interest", () => {
  const row = makeRow({
    intake_type: "employment_interest",
    email: "md@example.com",
    form_payload: {
      "full-name": "Test MD",
      role_interest: "managing_director",
      linkedin: "https://linkedin.com/in/testmd",
      "city-state": "Frisco, TX",
      resume: { filename: "RESUME.pdf", size: 100, type: "application/pdf" },
    },
  });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.primaryContact.firstName, "Test");
  assert.equal(envelope.primaryContact.lastName, "MD");
  assert.equal(envelope.employmentContext.roleInterest, "managing_director");
  assert.equal(envelope.employmentContext.resumeFilename, "RESUME.pdf");
  assert.equal(envelope.employmentContext.cityState, "Frisco, TX");
});

test("5. honeypot field triggers metadata flag", () => {
  const row = makeRow({ form_payload: { "bot-field": "spammer-filled-this" } });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.metadata.honeypotTriggered, true);
});

test("6. empty honeypot does not trigger metadata flag", () => {
  const row = makeRow({ form_payload: { "bot-field": "" } });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.metadata.honeypotTriggered, false);
});

test("7. missing form_payload does not throw (malformed/legacy row)", () => {
  const row = makeRow({ form_payload: null });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.careContext.message, null);
  assert.deepEqual(envelope.metadata.formPayloadKeys, []);
});

test("8. unknown/unexpected form_payload keys are preserved in metadata, not dropped silently", () => {
  const row = makeRow({ form_payload: { "some-future-field": "value", message: "hi" } });
  const envelope = normalizeIntakeSubmission(row);
  assert.ok(envelope.metadata.formPayloadKeys.includes("some-future-field"));
});

test("9. sourceSubmissionId and rawSubmissionReference both point at the immutable row id", () => {
  const row = makeRow({ id: "abc-123" });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.sourceSubmissionId, "abc-123");
  assert.equal(envelope.rawSubmissionReference, "abc-123");
});

test("10. outside_service_area flag is carried into serviceLocation", () => {
  const row = makeRow({ outside_service_area: true });
  const envelope = normalizeIntakeSubmission(row);
  assert.equal(envelope.serviceLocation.outsideServiceArea, true);
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

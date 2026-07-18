// Pure-function tests for lib/intake/contactReadiness.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { buildFollowUpAgenda, computeContactReadiness, reasonCodesToMissingFieldLabels } from "../contactReadiness.ts";
import type { IntakeEnvelope } from "../types.ts";

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

function contactOnly(overrides: Partial<IntakeEnvelope["primaryContact"]>) {
  return makeEnvelope({
    primaryContact: {
      firstName: null,
      lastName: null,
      fullName: null,
      phone: null,
      email: null,
      relationshipToProspectiveClient: null,
      isProspectiveClient: false,
      ...overrides,
    },
  });
}

// ─── Contact Ready ────────────────────────────────────────────────────

test("1. name + phone only -> contact_ready", () => {
  const result = computeContactReadiness(contactOnly({ fullName: "A B", phone: "5550000000" }));
  assert.equal(result.status, "contact_ready");
});

test("2. name + email only -> contact_ready", () => {
  const result = computeContactReadiness(contactOnly({ fullName: "A B", email: "a@example.com" }));
  assert.equal(result.status, "contact_ready");
});

test("3. name + phone + email -> contact_ready", () => {
  const result = computeContactReadiness(
    contactOnly({ fullName: "A B", phone: "5550000000", email: "a@example.com" })
  );
  assert.equal(result.status, "contact_ready");
  assert.ok(result.reasonCodes.includes("CONTACT_READY"));
});

// ─── Needs Resolution ─────────────────────────────────────────────────

test("4. phone but no contact name -> needs_resolution, MISSING_CONTACT_NAME", () => {
  const result = computeContactReadiness(contactOnly({ phone: "5550000000" }));
  assert.equal(result.status, "needs_resolution");
  assert.ok(result.reasonCodes.includes("MISSING_CONTACT_NAME"));
});

test("5. email but no contact name -> needs_resolution, MISSING_CONTACT_NAME", () => {
  const result = computeContactReadiness(contactOnly({ email: "a@example.com" }));
  assert.equal(result.status, "needs_resolution");
  assert.ok(result.reasonCodes.includes("MISSING_CONTACT_NAME"));
});

test("6. name with no phone or email -> needs_resolution, MISSING_CONTACT_METHOD", () => {
  const result = computeContactReadiness(contactOnly({ fullName: "A B" }));
  assert.equal(result.status, "needs_resolution");
  assert.ok(result.reasonCodes.includes("MISSING_CONTACT_METHOD"));
});

// ─── Not Actionable ─────────────────────────────────────────────────

test("7. no name, no phone, no email -> not_actionable, NO_CONTACT_INFORMATION", () => {
  const result = computeContactReadiness(contactOnly({}));
  assert.equal(result.status, "not_actionable");
  assert.deepEqual(result.reasonCodes, ["NO_CONTACT_INFORMATION"]);
});

// ─── Missing-field labels ─────────────────────────────────────────────

test("8. reasonCodesToMissingFieldLabels reflects incomplete prospective client, location, and timing", () => {
  const labels = reasonCodesToMissingFieldLabels(["INCOMPLETE_PROSPECTIVE_CLIENT", "INCOMPLETE_SERVICE_LOCATION"]);
  assert.ok(labels.includes("Who needs care"));
  assert.ok(labels.includes("Where care would be provided"));
  assert.ok(labels.includes("When help may be needed"));
});

test("9. reasonCodesToMissingFieldLabels omits timing when TIMING_PRESENT is set", () => {
  const labels = reasonCodesToMissingFieldLabels(["TIMING_PRESENT"]);
  assert.ok(!labels.includes("When help may be needed"));
});

test("10. reasonCodesToMissingFieldLabels flags unresolved resident identity", () => {
  const labels = reasonCodesToMissingFieldLabels(["RESIDENT_LINK_UNRESOLVED"]);
  assert.ok(labels.includes("Which resident this is (confirm identity)"));
});

// ─── Follow-up agenda ─────────────────────────────────────────────────

test("11. buildFollowUpAgenda with no missing fields is just the contact line", () => {
  const agenda = buildFollowUpAgenda("Jennifer Smith", []);
  assert.equal(agenda, "Contact Jennifer Smith.");
});

test("12. buildFollowUpAgenda lists missing fields under 'Learn during follow-up'", () => {
  const agenda = buildFollowUpAgenda("Jennifer Smith", ["Who needs care", "When help may be needed"]);
  assert.ok(agenda.startsWith("Contact Jennifer Smith."));
  assert.ok(agenda.includes("Learn during follow-up:"));
  assert.ok(agenda.includes("- Who needs care"));
  assert.ok(agenda.includes("- When help may be needed"));
});

// ─── Determinism ────────────────────────────────────────────────────────

test("13. identical inputs always produce an identical result", () => {
  const envelope = makeEnvelope();
  assert.deepEqual(computeContactReadiness(envelope), computeContactReadiness(envelope));
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

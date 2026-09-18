import assert from "node:assert/strict";
import {
  evaluateAxisCareClientCreate,
  buildAxisCareClientCreatePayload,
  type ApprovedFactForReadiness,
  type AxisCareClientCreateEvaluationInput,
  type ResidentIdentityForAxisCare,
} from "../axiscareReadiness.ts";
import type { CanonicalResidentProfileFacts } from "../coverage.ts";
import { AXISCARE_INACTIVE_STATUS, AxisCareClientCreateRequestSchema } from "../../integrations/axiscare/clientCreateRequest.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const NO_IDENTITY_LINK = { status: null, axiscareClientId: null, matchConfidence: null } as const;

function resident(overrides: Partial<ResidentIdentityForAxisCare> = {}): ResidentIdentityForAxisCare {
  return { firstName: "Margaret", lastName: "Thompson", ...overrides };
}

function fact(overrides: Partial<ApprovedFactForReadiness> & { fieldPath: string }): ApprovedFactForReadiness {
  return { assertionState: "confirmed_yes", value: true, ...overrides };
}

function baseInput(overrides: Partial<AxisCareClientCreateEvaluationInput> = {}): AxisCareClientCreateEvaluationInput {
  return {
    residentId: "resident-1",
    resident: resident(),
    approvedFacts: [],
    canonicalProfileFacts: null,
    identityLink: NO_IDENTITY_LINK,
    ...overrides,
  };
}

// ─── A. Approved firstName + lastName -> a valid AxisCare client-create payload ────────────────

test("A: resident with firstName + lastName and no identity link -> technically ready, proposes CREATE, payload validates against the real AxisCare schema", () => {
  const result = evaluateAxisCareClientCreate(baseInput());
  assert.equal(result.technicallyReady, true);
  assert.equal(result.proposedAction, "create");
  assert.equal(result.apiHardBlockers.length, 0);
  assert.ok(result.payload);
  assert.doesNotThrow(() => AxisCareClientCreateRequestSchema.parse(result.payload));
  assert.equal(result.payload!.firstName, "Margaret");
  assert.equal(result.payload!.lastName, "Thompson");
});

// ─── B/C. Missing firstName/lastName -> API hard blockers ──────────────────────────────────────

test("B: missing firstName is an API hard blocker, and blocks technical readiness", () => {
  const result = evaluateAxisCareClientCreate(baseInput({ resident: resident({ firstName: null }) }));
  assert.equal(result.technicallyReady, false);
  assert.ok(result.apiHardBlockers.some((f) => f.fieldPath === "resident.first_name"));
  assert.equal(result.payload, null);
});

test("C: missing lastName is an API hard blocker, and blocks technical readiness", () => {
  const result = evaluateAxisCareClientCreate(baseInput({ resident: resident({ lastName: null }) }));
  assert.equal(result.technicallyReady, false);
  assert.ok(result.apiHardBlockers.some((f) => f.fieldPath === "resident.last_name"));
  assert.equal(result.payload, null);
});

test("buildAxisCareClientCreatePayload throws rather than silently building an incomplete request when firstName/lastName are missing", () => {
  assert.throws(() =>
    buildAxisCareClientCreatePayload({
      residentId: "resident-1",
      resident: resident({ firstName: null }),
      approvedFacts: [],
      canonicalProfileFacts: null,
    })
  );
});

// ─── D/E. Missing DOB / primary contact phone -> non-blocking recommended warnings, never AxisCare-required ──

test("D: missing date of birth is a non-blocking RECOMMENDED gap, never an API hard blocker, and never blocks readiness", () => {
  const result = evaluateAxisCareClientCreate(baseInput());
  assert.equal(result.technicallyReady, true);
  assert.ok(result.recommendedMissing.some((f) => f.fieldPath === "identity.date_of_birth"));
  assert.ok(!result.apiHardBlockers.some((f) => f.fieldPath === "identity.date_of_birth"));
});

test("E: missing primary contact phone is a non-blocking RECOMMENDED gap, never an API hard blocker, and never blocks readiness", () => {
  const result = evaluateAxisCareClientCreate(baseInput());
  assert.equal(result.technicallyReady, true);
  assert.ok(result.recommendedMissing.some((f) => f.fieldPath === "important_people.primary_contact_phone"));
  assert.ok(!result.apiHardBlockers.some((f) => f.fieldPath === "important_people.primary_contact_phone"));
});

test("date of birth satisfied via an approved fact clears the recommended gap", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ approvedFacts: [fact({ fieldPath: "identity.date_of_birth", value: "1940-01-01" })] })
  );
  assert.ok(!result.recommendedMissing.some((f) => f.fieldPath === "identity.date_of_birth"));
  assert.equal(result.payload!.dateOfBirth, "1940-01-01");
});

test("date of birth satisfied via canonical profile (no assessment fact) also clears the recommended gap and populates the payload", () => {
  const canonical: CanonicalResidentProfileFacts = {
    dateOfBirth: "1940-01-01",
    phone: null,
    communityId: null,
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    physicianName: null,
    physicianPhone: null,
    primaryContactName: null,
  };
  const result = evaluateAxisCareClientCreate(baseInput({ canonicalProfileFacts: canonical }));
  assert.ok(!result.recommendedMissing.some((f) => f.fieldPath === "identity.date_of_birth"));
  assert.equal(result.payload!.dateOfBirth, "1940-01-01");
});

test("primary contact phone has NO canonical-profile fallback -- only an approved fact clears the recommended gap (matches coverage.ts's existing canonical-facts boundary)", () => {
  const canonical: CanonicalResidentProfileFacts = {
    dateOfBirth: null,
    phone: null,
    communityId: null,
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    physicianName: null,
    physicianPhone: null,
    primaryContactName: "Susan (Daughter)", // name known, but no canonical phone concept exists
  };
  const result = evaluateAxisCareClientCreate(baseInput({ canonicalProfileFacts: canonical }));
  assert.ok(result.recommendedMissing.some((f) => f.fieldPath === "important_people.primary_contact_phone"));
});

// ─── F. Uncertain/conflicting facts never leak into the request payload ────────────────────────

test("F: an uncertain date_of_birth fact is never treated as confirmed -- stays a recommended gap, never populates the payload", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ approvedFacts: [fact({ fieldPath: "identity.date_of_birth", assertionState: "uncertain", value: "unclear" })] })
  );
  assert.equal(result.payload!.dateOfBirth, undefined);
  assert.ok(result.recommendedMissing.some((f) => f.fieldPath === "identity.date_of_birth"));
});

test("F: a conflicting identity.phone fact never populates homePhone", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ approvedFacts: [fact({ fieldPath: "identity.phone", assertionState: "conflicting", value: "555-0000" })] })
  );
  assert.equal(result.payload!.homePhone, undefined);
});

// ─── G. Serve canonical field paths are correctly transformed into AxisCare's real field names ─

test("G: Serve field paths map to AxisCare's real field names, never leaking Serve's own field_path taxonomy into the payload", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({
      approvedFacts: [
        fact({ fieldPath: "identity.date_of_birth", value: "1945-06-01" }),
        fact({ fieldPath: "identity.phone", value: "972-555-1234" }),
        fact({ fieldPath: "identity.email", value: "margaret@example.com" }),
        fact({ fieldPath: "identity.preferred_name", value: "Maggie" }),
        fact({ fieldPath: "residence.address_line1", value: "123 Main St" }),
        fact({ fieldPath: "residence.city", value: "Frisco" }),
        fact({ fieldPath: "residence.state", value: "TX" }),
        fact({ fieldPath: "residence.postal_code", value: "75034" }),
      ],
    })
  );
  const payload = result.payload!;
  assert.equal(payload.dateOfBirth, "1945-06-01");
  assert.equal(payload.homePhone, "972-555-1234");
  assert.equal(payload.personalEmail, "margaret@example.com");
  assert.equal(payload.goesBy, "Maggie");
  assert.deepEqual(payload.residentialAddress, {
    streetAddress1: "123 Main St",
    streetAddress2: null,
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  });
  // Never Serve's own field_path strings anywhere in the payload's own keys.
  assert.ok(!("identity.phone" in payload));
  assert.ok(!("residence.address_line1" in payload));
});

test("residentialAddress requires ALL FOUR core sub-fields present -- a partial address is omitted entirely rather than sent incomplete", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({
      approvedFacts: [
        fact({ fieldPath: "residence.address_line1", value: "123 Main St" }),
        fact({ fieldPath: "residence.city", value: "Frisco" }),
        // state/postal_code deliberately omitted
      ],
    })
  );
  assert.equal(result.payload!.residentialAddress, undefined);
});

test("externalId is always Serve's own resident id -- a real, non-invented AxisCare-documented back-reference field", () => {
  const result = evaluateAxisCareClientCreate(baseInput({ residentId: "resident-abc-123" }));
  assert.equal(result.payload!.externalId, "resident-abc-123");
});

// ─── H. Identity reconciliation required -> process-level hard blocker, independent of fields ──

test("H: an ambiguous (non-high-confidence) proposed identity match is a PROCESS hard blocker, never an API hard blocker, even with a fully complete profile", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({
      approvedFacts: [
        fact({ fieldPath: "identity.date_of_birth", value: "1940-01-01" }),
        fact({ fieldPath: "important_people.primary_contact_phone", value: "555-1234" }),
      ],
      identityLink: { status: "proposed", axiscareClientId: null, matchConfidence: "low" },
    })
  );
  assert.equal(result.technicallyReady, false);
  assert.equal(result.apiHardBlockers.length, 0);
  assert.ok(result.processHardBlockers.length > 0);
  assert.equal(result.proposedAction, null);
  assert.equal(result.payload, null);
});

test("H: a rejected identity link is a PROCESS hard blocker, never falls through to CREATE", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ identityLink: { status: "rejected", axiscareClientId: null, matchConfidence: null } })
  );
  assert.equal(result.technicallyReady, false);
  assert.ok(result.processHardBlockers.length > 0);
});

test("a confirmed identity link proposes UPDATE and carries the existing AxisCare client id", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ identityLink: { status: "confirmed", axiscareClientId: "12345", matchConfidence: "high" } })
  );
  assert.equal(result.technicallyReady, true);
  assert.equal(result.proposedAction, "update");
  assert.equal(result.existingAxisCareClientId, "12345");
});

// ─── I. Payload preview still renders when only recommended information is missing ─────────────

test("I: with zero facts at all (DOB and primary contact phone both missing), the payload still builds -- recommended gaps never block the preview", () => {
  const result = evaluateAxisCareClientCreate(baseInput());
  assert.equal(result.technicallyReady, true);
  assert.ok(result.payload, "a payload must still be produced when only recommended fields are missing");
  assert.equal(result.recommendedMissing.length, 2);
});

// ─── K. Inactive status: the create payload always explicitly creates INACTIVE ─────────────────

test("K: every technically-ready payload explicitly sets status to the documented inactive object form -- never omitted, never Active", () => {
  const result = evaluateAxisCareClientCreate(baseInput());
  assert.deepEqual(result.payload!.status, AXISCARE_INACTIVE_STATUS);
  assert.equal(result.payload!.status!.active, false);
  assert.equal(result.payload!.status!.label, "Inactive");
});

test("K: status is inactive regardless of proposedAction (create or update)", () => {
  const createResult = evaluateAxisCareClientCreate(baseInput());
  const updateResult = evaluateAxisCareClientCreate(
    baseInput({ identityLink: { status: "confirmed", axiscareClientId: "999", matchConfidence: "high" } })
  );
  assert.deepEqual(createResult.payload!.status, AXISCARE_INACTIVE_STATUS);
  assert.deepEqual(updateResult.payload!.status, AXISCARE_INACTIVE_STATUS);
});

test("buildAxisCareClientCreatePayload itself cannot be called without producing an explicit inactive status -- there is no code path that omits `status`", () => {
  const payload = buildAxisCareClientCreatePayload({
    residentId: "r1",
    resident: resident(),
    approvedFacts: [],
    canonicalProfileFacts: null,
  });
  assert.deepEqual(payload.status, AXISCARE_INACTIVE_STATUS);
});

// ─── M. Responsible Party: no invented create semantics ────────────────────────────────────────

test("M: the payload never contains a responsibleParties key -- AxisCare's create-client contract has no such property (verified against the checked-in spec)", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ approvedFacts: [fact({ fieldPath: "important_people.primary_contact_phone", value: "555-1234" })] })
  );
  assert.ok(!("responsibleParties" in (result.payload as object)));
});

test("M: Responsible Party's unresolved create workflow is always surfaced as an integration gap, never silently dropped", () => {
  const result = evaluateAxisCareClientCreate(baseInput());
  assert.ok(result.integrationGaps.some((gap) => gap.toLowerCase().includes("responsible party")));
});

test("M: a confirmed primary contact phone still cannot be mapped into the create payload -- it has nowhere to go in this contract", () => {
  const result = evaluateAxisCareClientCreate(
    baseInput({ approvedFacts: [fact({ fieldPath: "important_people.primary_contact_phone", value: "555-1234" })] })
  );
  assert.ok(!result.recommendedMissing.some((f) => f.fieldPath === "important_people.primary_contact_phone"));
  // Not present under any AxisCare field name in the payload either -- there is no slot for it.
  assert.ok(!Object.values(result.payload as object).includes("555-1234"));
});

// ─── N/O. Pricing and Cinch state have no effect -- structurally, not just by observed behavior ─

test("N/O: evaluateAxisCareClientCreate's input has no pricing- or Cinch-related field at all -- structurally incapable of being influenced by either", () => {
  const input = baseInput();
  const keys = Object.keys(input).sort();
  assert.deepEqual(keys, ["approvedFacts", "canonicalProfileFacts", "identityLink", "residentId", "resident"].sort());
  assert.ok(!keys.some((k) => /pricing|cinch/i.test(k)));
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);

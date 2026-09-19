// Pure-function tests for ../boardPresentation.ts (Office Staff Client
// Readiness UX v0.2, Priority 2 production-acceptance slice). Run with:
//   node --experimental-strip-types --conditions=react-server lib/clientReadiness/__tests__/boardPresentation.test.ts
import assert from "node:assert/strict";
import {
  ATTESTATION_NEXT_STEP_COPY,
  canActOnRequirement,
  resolveAttestationGuidance,
  resolveClientReadinessCta,
  resolveDocumentActionLabel,
  resolveDocumentCtaState,
  resolveDocumentStatusBanner,
  type BoardItemForPresentation,
  type ClientReadinessCareContacts,
} from "../boardPresentation.ts";
import {
  CR_CARE_DOCUMENTATION_CURRENT,
  CR_CLIENT_PROFILE_ON_FILE,
  CR_ISP_ON_FILE_AND_CURRENT,
  CR_MEDICATION_LIST_ON_FILE,
  CR_SUPERVISORY_VISIT_RECORDED,
  EP_CLIENT_TRIAGE_CLASSIFIED,
} from "../constants.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function item(overrides: Partial<BoardItemForPresentation> = {}): BoardItemForPresentation {
  return {
    requirementCode: CR_ISP_ON_FILE_AND_CURRENT,
    status: "missing_evidence",
    verificationStatus: null,
    ...overrides,
  };
}

const NO_CARE_CONTACTS: ClientReadinessCareContacts = {
  physicianName: "Dr. Smith",
  physicianPhone: "5551234567",
  guardianName: "",
  guardianPhone: "",
  guardianConfirmedNone: true,
};

const defaultCta = (status: string) => `Review (${status})`;

// ─── resolveDocumentCtaState ──────────────────────────────────────────────

test("missing (no evidence) resolves to 'missing'", () => {
  assert.equal(resolveDocumentCtaState(item({ status: "missing_evidence", verificationStatus: null })), "missing");
});

test("REGRESSION: needs_review + unverified resolves to 'awaiting_verification', not 'missing'", () => {
  assert.equal(resolveDocumentCtaState(item({ status: "needs_review", verificationStatus: "unverified" })), "awaiting_verification");
});

test("REGRESSION: needs_review + rejected resolves to 'rejected', distinct from awaiting_verification", () => {
  assert.equal(resolveDocumentCtaState(item({ status: "needs_review", verificationStatus: "rejected" })), "rejected");
});

test("compliant status resolves to 'missing' (the ctaState is irrelevant once satisfied -- callers gate on isSatisfiedStatus first)", () => {
  assert.equal(resolveDocumentCtaState(item({ status: "compliant", verificationStatus: "verified" })), "missing");
});

// ─── canActOnRequirement ──────────────────────────────────────────────────

test("attestation-tier requirement requires canManageAttestations, not canManageDocuments", () => {
  assert.equal(canActOnRequirement(EP_CLIENT_TRIAGE_CLASSIFIED, true, false), false);
  assert.equal(canActOnRequirement(EP_CLIENT_TRIAGE_CLASSIFIED, false, true), true);
});

test("document-tier requirement requires canManageDocuments, not canManageAttestations", () => {
  assert.equal(canActOnRequirement(CR_ISP_ON_FILE_AND_CURRENT, true, false), true);
  assert.equal(canActOnRequirement(CR_ISP_ON_FILE_AND_CURRENT, false, true), false);
});

// ─── resolveClientReadinessCta ────────────────────────────────────────────

test("missing document, Office-Staff-equivalent capability -> the Upload CTA", () => {
  const cta = resolveClientReadinessCta(
    item({ requirementCode: CR_SUPERVISORY_VISIT_RECORDED, status: "missing_evidence", verificationStatus: null }),
    NO_CARE_CONTACTS,
    /* canManageDocuments */ true,
    /* canManageAttestations */ false,
    "Upload Supervisory Visit Documentation",
    defaultCta
  );
  assert.equal(cta, "Upload Supervisory Visit Documentation →");
});

test("REGRESSION: needs_review (awaiting first verification) never shows the ordinary Upload CTA", () => {
  const cta = resolveClientReadinessCta(
    item({ requirementCode: CR_SUPERVISORY_VISIT_RECORDED, status: "needs_review", verificationStatus: "unverified" }),
    NO_CARE_CONTACTS,
    true,
    false,
    "Upload Supervisory Visit Documentation",
    defaultCta
  );
  assert.equal(cta, "Awaiting Verification");
  assert.equal(cta.includes("Upload"), false);
});

test("REGRESSION: rejected evidence shows a distinct 'Action Needed' CTA, not 'Awaiting Verification' and not the ordinary Upload CTA", () => {
  const cta = resolveClientReadinessCta(
    item({ requirementCode: CR_SUPERVISORY_VISIT_RECORDED, status: "needs_review", verificationStatus: "rejected" }),
    NO_CARE_CONTACTS,
    true,
    false,
    "Upload Supervisory Visit Documentation",
    defaultCta
  );
  assert.equal(cta, "Action Needed →");
});

test("satisfied status always shows View Evidence, regardless of capability", () => {
  const cta = resolveClientReadinessCta(
    item({ requirementCode: CR_ISP_ON_FILE_AND_CURRENT, status: "compliant", verificationStatus: "verified" }),
    NO_CARE_CONTACTS,
    false,
    false,
    "Upload ISP",
    defaultCta
  );
  assert.equal(cta, "View Evidence →");
});

test("REGRESSION: a viewer who cannot act on this requirement sees 'View Requirement', never a resolvable-sounding verb, even at needs_review", () => {
  const cta = resolveClientReadinessCta(
    item({ requirementCode: EP_CLIENT_TRIAGE_CLASSIFIED, status: "needs_review", verificationStatus: "unverified" }),
    NO_CARE_CONTACTS,
    true /* canManageDocuments */,
    false /* canManageAttestations -- Office Staff */,
    "Record Triage Classification",
    defaultCta
  );
  assert.equal(cta, "View Requirement →");
});

// ─── resolveDocumentStatusBanner ──────────────────────────────────────────

test("missing document -> no banner", () => {
  assert.equal(resolveDocumentStatusBanner(item({ status: "missing_evidence", verificationStatus: null })), null);
});

test("REGRESSION: awaiting first verification -> 'Awaiting Verification' banner with the exact required copy", () => {
  const banner = resolveDocumentStatusBanner(item({ status: "needs_review", verificationStatus: "unverified" }));
  assert.equal(banner?.tone, "awaiting_verification");
  assert.equal(banner?.heading, "Awaiting Verification");
  assert.equal(banner?.body, "Documentation uploaded. Authorized review required.");
});

test("REGRESSION: rejected -> distinct 'Action Needed — Documentation Rejected' banner", () => {
  const banner = resolveDocumentStatusBanner(item({ status: "needs_review", verificationStatus: "rejected" }));
  assert.equal(banner?.tone, "rejected");
  assert.equal(banner?.heading, "Action Needed — Documentation Rejected");
});

// ─── resolveDocumentActionLabel ───────────────────────────────────────────

test("missing document keeps the base upload label unchanged", () => {
  assert.equal(resolveDocumentActionLabel("Upload ISP", item({ status: "missing_evidence", verificationStatus: null })), "Upload ISP");
});

test("REGRESSION: rejected offers 'Upload Replacement Documentation', not the original base label", () => {
  assert.equal(
    resolveDocumentActionLabel("Upload ISP", item({ status: "needs_review", verificationStatus: "rejected" })),
    "Upload Replacement Documentation"
  );
});

test("awaiting verification offers a secondary 'Replace Documentation' action, distinct from the rejected replacement label", () => {
  assert.equal(
    resolveDocumentActionLabel("Upload ISP", item({ status: "needs_review", verificationStatus: "unverified" })),
    "Replace Documentation"
  );
});

// ─── Attestation-tier next-step guidance ──────────────────────────────────

test("REGRESSION: every attestation-tier requirement has capability-oriented guidance, never a hard-coded role name", () => {
  for (const code of [CR_CLIENT_PROFILE_ON_FILE, EP_CLIENT_TRIAGE_CLASSIFIED, CR_MEDICATION_LIST_ON_FILE, CR_CARE_DOCUMENTATION_CURRENT]) {
    const guidance = resolveAttestationGuidance(code);
    assert.ok(guidance, `expected guidance for ${code}`);
    assert.equal(/\b(Admin|Manager|Executive)\b/i.test(guidance as string), false, `guidance for ${code} names a hard-coded role: ${guidance}`);
    assert.ok(/authorized/i.test(guidance as string), `guidance for ${code} should be capability-oriented: ${guidance}`);
  }
});

test("a document-tier requirement code has no attestation guidance (null, never a guessed fallback)", () => {
  assert.equal(resolveAttestationGuidance(CR_ISP_ON_FILE_AND_CURRENT), null);
});

test("exactly the four expected attestation-tier codes have guidance -- no more, no fewer", () => {
  assert.deepEqual(
    Object.keys(ATTESTATION_NEXT_STEP_COPY).sort(),
    [CR_CARE_DOCUMENTATION_CURRENT, CR_CLIENT_PROFILE_ON_FILE, CR_MEDICATION_LIST_ON_FILE, EP_CLIENT_TRIAGE_CLASSIFIED].sort()
  );
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

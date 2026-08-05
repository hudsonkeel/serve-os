import assert from "node:assert/strict";
import { parseApploiCandidateUrl, decideVendorIdentityAction, shortenVendorId } from "../vendorIdentity.ts";
import type { RecruitingLeadVendorIdentity } from "../../../../supabase/types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

function identity(overrides: Partial<RecruitingLeadVendorIdentity>): RecruitingLeadVendorIdentity {
  return {
    id: "vid-1",
    recruiting_lead_id: "lead-1",
    source_system: "apploi",
    vendor_record_id: "Q2FuZGlkYXRlOjc2MzY0MTEy",
    vendor_display_name: "Alma Dhora Owolabi",
    match_method: "vendor_id",
    match_confidence: "high",
    is_human_confirmed: true,
    linked_by: "Hud",
    linked_at: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

// ─── URL parsing ────────────────────────────────────────────────────────────
test("parses candidateID and applicationID from the confirmed Apploi URL", () => {
  const url =
    "https://hire.apploi.com/v2/candidates?applicationID=QXBwbGljYXRpb246MjgzNTc1OTE2&candidateID=Q2FuZGlkYXRlOjc2MzY0MTEy&openDrawer=candidate";
  const result = parseApploiCandidateUrl(url);
  assert.equal(result.candidateId, "Q2FuZGlkYXRlOjc2MzY0MTEy");
  assert.equal(result.applicationId, "QXBwbGljYXRpb246MjgzNTc1OTE2");
});

test("returns null candidateId/applicationId when the URL has neither param", () => {
  const result = parseApploiCandidateUrl("https://hire.apploi.com/v2/candidates");
  assert.equal(result.candidateId, null);
  assert.equal(result.applicationId, null);
});

test("returns null for both when the URL itself is malformed", () => {
  const result = parseApploiCandidateUrl("not a url");
  assert.equal(result.candidateId, null);
  assert.equal(result.applicationId, null);
});

// ─── Vendor identity decision ───────────────────────────────────────────────
test("hard stop when no candidateID was observed at all", () => {
  const decision = decideVendorIdentityAction(null, null);
  assert.equal(decision.action, "hard_stop_no_candidate_id");
});

test("first-time link requires explicit human confirmation when no identity exists yet", () => {
  const decision = decideVendorIdentityAction("Q2FuZGlkYXRlOjc2MzY0MTEy", null);
  assert.equal(decision.action, "requires_confirmation");
  assert.equal((decision as { candidateId: string }).candidateId, "Q2FuZGlkYXRlOjc2MzY0MTEy");
});

test("repeat run proceeds silently when the stored, human-confirmed vendor ID matches the observed one", () => {
  const existing = identity({ vendor_record_id: "Q2FuZGlkYXRlOjc2MzY0MTEy", is_human_confirmed: true });
  const decision = decideVendorIdentityAction("Q2FuZGlkYXRlOjc2MzY0MTEy", existing);
  assert.equal(decision.action, "proceed_confirmed");
});

test("a stored but never-confirmed match still proceeds, distinctly flagged", () => {
  const existing = identity({ vendor_record_id: "Q2FuZGlkYXRlOjc2MzY0MTEy", is_human_confirmed: false, linked_by: null });
  const decision = decideVendorIdentityAction("Q2FuZGlkYXRlOjc2MzY0MTEy", existing);
  assert.equal(decision.action, "proceed_unconfirmed");
});

test("mismatched stored vendor ID is a hard stop, never a silent overwrite", () => {
  const existing = identity({ vendor_record_id: "Q2FuZGlkYXRlOjc2MzY0MTEy" });
  const decision = decideVendorIdentityAction("Q2FuZGlkYXRlOjNPVEhFUklE", existing);
  assert.equal(decision.action, "hard_stop_mismatch");
  if (decision.action === "hard_stop_mismatch") {
    assert.equal(decision.storedCandidateId, "Q2FuZGlkYXRlOjc2MzY0MTEy");
    assert.equal(decision.observedCandidateId, "Q2FuZGlkYXRlOjNPVEhFUklE");
  }
});

// ─── Display shortening ─────────────────────────────────────────────────────
test("shortenVendorId truncates long vendor identifiers for prominent display", () => {
  const shortened = shortenVendorId("Q2FuZGlkYXRlOjc2MzY0MTEy");
  assert.ok(shortened.length < "Q2FuZGlkYXRlOjc2MzY0MTEy".length);
  assert.ok(shortened.includes("…"));
});

test("shortenVendorId leaves short identifiers unchanged", () => {
  assert.equal(shortenVendorId("short-id"), "short-id");
});

console.log(`\n${passed}/${passed} passed`);

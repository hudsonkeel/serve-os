// AxisCare Reconciliation + Multi-Source Identity Ingestion phase, section
// 21/22/23/24/32. Fixture-only, no live DB dependency — proves the
// GENERIC identity-ingestion CONTRACT (normalize -> search canonical
// people -> evaluate confident/probable/no-match) behaves correctly when
// a SECOND, non-AxisCare source reports evidence for a person who already
// has a confirmed AxisCare identity link. matchAxisCareClientToResident()
// itself is completely unmodified and source-agnostic already (it takes a
// plain candidate/query shape, never reads source_system) — this test
// exercises it exactly as a future community-roster source would, without
// building that importer.
import assert from "node:assert/strict";
import { matchAxisCareClientToResident, normalizeName, type NormalizedResidentCandidate } from "../clientIdentityMatching.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// Fixture canonical person — deliberately not the real Maria Matos (a real
// production person; no fixture may reuse her identity), constructed
// exactly as she is: a confirmed AxisCare link exists (represented here as
// a candidate row derivable from her resident record — the identity link
// itself lives in person_vendor_identity_links, tested at the schema/RPC
// level elsewhere, not re-modeled here), Firewheel community.
const FIXTURE_CANONICAL_PERSON: NormalizedResidentCandidate = {
  id: "fixture-resident-uuid",
  displayName: "Testina Fixtureperson",
  normalizedEmail: null,
  normalizedPhones: [],
  normalizedName: normalizeName("Testina", "Fixtureperson"),
  normalizedLastName: "fixtureperson",
  unitNumber: null,
  communityName: "Watermere at Firewheel",
};

test("a second (fixture, non-AxisCare) source's strong evidence for the SAME person finds the EXISTING canonical resident, not a new one — exact name + community match, no email/phone needed", () => {
  const secondSourceRecord = {
    normalizedEmail: null,
    normalizedPhones: [],
    normalizedName: normalizeName("Testina", "Fixtureperson"),
    normalizedLastName: "fixtureperson",
    unitNumber: null,
    communityName: "Watermere at Firewheel",
  };

  const result = matchAxisCareClientToResident(secondSourceRecord, [FIXTURE_CANONICAL_PERSON]);

  assert.equal(result.residentId, FIXTURE_CANONICAL_PERSON.id, "must resolve to the SAME existing canonical person, never a duplicate");
  assert.equal(result.basis, "name_and_community");
});

test("an AMBIGUOUS second-source record (surname + community match only, full name disagrees) is flagged for review, never silently auto-linked", () => {
  const ambiguousRecord = {
    normalizedEmail: null,
    normalizedPhones: [],
    // A nickname/spelling variant of the same person's first name — the
    // deterministic matcher must not guess these are the same person on
    // name alone; surname + community is a review-required tier, never
    // an auto-match.
    normalizedName: normalizeName("Tess", "Fixtureperson"),
    normalizedLastName: "fixtureperson",
    unitNumber: null,
    communityName: "Watermere at Firewheel",
  };

  const result = matchAxisCareClientToResident(ambiguousRecord, [FIXTURE_CANONICAL_PERSON]);

  assert.equal(result.residentId, FIXTURE_CANONICAL_PERSON.id, "surname+community still surfaces the candidate...");
  assert.equal(result.basis, "surname_and_community");
  assert.equal(result.requiresReview, true, "...but flagged for human review, never auto-confirmed — this is the 'new source reconciliation question,' not a reopening of the original AxisCare decision");
});

test("REGRESSION: a genuinely different person at the same community never matches the fixture canonical person", () => {
  const differentPerson = {
    normalizedEmail: null,
    normalizedPhones: [],
    normalizedName: normalizeName("Someone", "Else"),
    normalizedLastName: "else",
    unitNumber: null,
    communityName: "Watermere at Firewheel",
  };

  const result = matchAxisCareClientToResident(differentPerson, [FIXTURE_CANONICAL_PERSON]);

  assert.equal(result.residentId, null);
  assert.equal(result.basis, "none");
});

test("cross-community: the SAME normalized name at a DIFFERENT community does not auto-match — community is part of the matching evidence, not decorative", () => {
  const sameNameDifferentCommunity = {
    normalizedEmail: null,
    normalizedPhones: [],
    normalizedName: normalizeName("Testina", "Fixtureperson"),
    normalizedLastName: "fixtureperson",
    unitNumber: null,
    communityName: "Watermere at Frisco",
  };

  const result = matchAxisCareClientToResident(sameNameDifferentCommunity, [FIXTURE_CANONICAL_PERSON]);

  // Neither name_and_community nor surname_and_community fire (community
  // disagrees on both) — this is exactly the structural guarantee that a
  // cross-community candidate is never silently treated as the same
  // person merely because the name matches. A real cross-community MOVE
  // is handled by the operator explicitly opting into cross-community
  // search in Match to Existing Person (section 10/24), never by this
  // deterministic tier guessing on name alone.
  assert.equal(result.residentId, null);
  assert.equal(result.basis, "none");
});

console.log(`\n${passed}/${passed} passed`);

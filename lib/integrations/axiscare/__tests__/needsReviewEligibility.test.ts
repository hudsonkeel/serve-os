import assert from "node:assert/strict";
import { isEligibleForCommunityNeedsReview } from "../needsReviewEligibility.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const BASE = {
  resolvedCommunityId: "firewheel-uuid",
  matchedResidentId: null,
  isPlaceholderRecord: false,
  isNameDenylisted: false,
  disposition: null,
};

test("Maria's real shape (Firewheel, unmatched, prospect-computed, no disposition) is eligible", () => {
  assert.equal(isEligibleForCommunityNeedsReview(BASE), true);
});

test("no resolved community -> never eligible, even under 'All Communities'", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, resolvedCommunityId: null }), false);
});

test("already matched to a resident -> not unresolved work", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, matchedResidentId: "resident-uuid" }), false);
});

test("structural placeholder record -> excluded", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, isPlaceholderRecord: true }), false);
});

test("name-denylisted (related contact person) -> excluded", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, isNameDenylisted: true }), false);
});

test("disposition-excluded (administrative_record) -> excluded", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, disposition: "administrative_record" }), false);
});

test("disposition-excluded (test_placeholder) -> excluded", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, disposition: "test_placeholder" }), false);
});

test("disposition-excluded (non_client_related_person) -> excluded", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, disposition: "non_client_related_person" }), false);
});

test("a non-excluding disposition (real_client) does not exclude", () => {
  assert.equal(isEligibleForCommunityNeedsReview({ ...BASE, disposition: "real_client" }), true);
});

test("REGRESSION: AxisCare-computed 'needs_review' lifecycle is NOT excluded by this predicate — lifecycle bucket is never a filter criterion here, only the identity/noise conditions above are", () => {
  // This predicate takes no lifecycle field at all — the absence itself is
  // the proof. If a lifecycle-based exclusion were reintroduced, this test
  // would need to change to accommodate it, which is the point.
  assert.equal(isEligibleForCommunityNeedsReview(BASE), true);
});

console.log(`\n${passed}/${passed} passed`);

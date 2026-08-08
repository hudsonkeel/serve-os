import assert from "node:assert/strict";
import {
  resolveAxisCareClientOperationalBucket,
  resolveAxisCareIdentityStatus,
  resolveAxisCareResidentMatch,
} from "../clientOperationalStatus.ts";
import type { ClientMatchResult } from "../clientIdentityMatching.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("no disposition: computed lifecycle passes through unchanged, for every lifecycle value", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", null), "active_client");
  assert.equal(resolveAxisCareClientOperationalBucket("inactive_client", null), "inactive_client");
  assert.equal(resolveAxisCareClientOperationalBucket("prospect", null), "prospect");
  assert.equal(resolveAxisCareClientOperationalBucket("needs_review", null), "needs_review");
});

test("real_client, prospect, needs_review dispositions never override the computed lifecycle", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", "real_client"), "active_client");
  assert.equal(resolveAxisCareClientOperationalBucket("inactive_client", "prospect"), "inactive_client");
  assert.equal(resolveAxisCareClientOperationalBucket("needs_review", "needs_review"), "needs_review");
});

test("non_client_related_person disposition always excludes, regardless of computed lifecycle", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", "non_client_related_person"), "excluded");
  assert.equal(resolveAxisCareClientOperationalBucket("inactive_client", "non_client_related_person"), "excluded");
});

test("administrative_record and test_placeholder dispositions always exclude", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", "administrative_record"), "excluded");
  assert.equal(resolveAxisCareClientOperationalBucket("prospect", "test_placeholder"), "excluded");
});

test("confirmed link status always wins, regardless of residentId/requiresReview", () => {
  assert.equal(
    resolveAxisCareIdentityStatus({ residentId: "r1", requiresReview: false, confirmedLinkStatus: "confirmed" }),
    "confirmed"
  );
});

test("no resident match at all is unmatched", () => {
  assert.equal(
    resolveAxisCareIdentityStatus({ residentId: null, requiresReview: false, confirmedLinkStatus: null }),
    "unmatched"
  );
});

test("a resident match that requires review is needs_identity_review, not confirmed or unmatched", () => {
  assert.equal(
    resolveAxisCareIdentityStatus({ residentId: "r1", requiresReview: true, confirmedLinkStatus: null }),
    "needs_identity_review"
  );
});

test("a clean deterministic match with no confirmed link yet is a candidate", () => {
  assert.equal(
    resolveAxisCareIdentityStatus({ residentId: "r1", requiresReview: false, confirmedLinkStatus: null }),
    "candidate"
  );
});

const FRESH_MATCH: ClientMatchResult = { residentId: "fresh-resident", basis: "phone", requiresReview: false, reviewReason: null };

test("REGRESSION: a confirmed identity link always wins over a fresh deterministic recomputation, even if the fresh match now disagrees", () => {
  const conflictingFreshMatch: ClientMatchResult = { residentId: "someone-else", basis: "email", requiresReview: false, reviewReason: null };
  const result = resolveAxisCareResidentMatch(conflictingFreshMatch, { subject_id: "confirmed-resident", status: "confirmed" });
  assert.equal(result.residentId, "confirmed-resident");
  assert.equal(result.requiresReview, false);
});

test("REGRESSION: a rejected identity decision never resurfaces its rejected candidate as an open match", () => {
  const result = resolveAxisCareResidentMatch(FRESH_MATCH, { subject_id: "fresh-resident", status: "rejected" });
  assert.equal(result.residentId, null);
  assert.equal(result.basis, "none");
  assert.equal(result.requiresReview, false);
});

test("a proposed (not yet decided) link uses the fresh deterministic computation, not the originally-proposed candidate", () => {
  const result = resolveAxisCareResidentMatch(FRESH_MATCH, { subject_id: "originally-proposed-resident", status: "proposed" });
  assert.equal(result.residentId, "fresh-resident");
});

test("a deferred (review later) link uses the fresh deterministic computation — deferring is not a rejection", () => {
  const result = resolveAxisCareResidentMatch(FRESH_MATCH, { subject_id: "deferred-resident", status: "deferred" });
  assert.equal(result.residentId, "fresh-resident");
});

test("no existing link at all uses the fresh deterministic computation", () => {
  const result = resolveAxisCareResidentMatch(FRESH_MATCH, null);
  assert.equal(result.residentId, "fresh-resident");
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

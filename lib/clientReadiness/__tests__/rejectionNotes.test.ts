// Pure-function tests for ../rejectionNotes.ts (Office Staff Client
// Readiness UX v0.2, rejection provenance repair, refined 2026-09-19: no
// reviewer identity/time in free text -- verified_by/verified_at on the
// evidence row are authoritative for that). Run with:
//   node --experimental-strip-types --conditions=react-server lib/clientReadiness/__tests__/rejectionNotes.test.ts
import assert from "node:assert/strict";
import { composeRejectionNotes } from "../rejectionNotes.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("REGRESSION: the contributor's original notes are preserved, not overwritten, when review feedback is composed", () => {
  const composed = composeRejectionNotes({
    originalNotes: "Uploaded the annual visit summary from the 9/1 walkthrough.",
    reason: "Document is illegible -- please rescan.",
  });
  assert.ok(composed.includes("Uploaded the annual visit summary from the 9/1 walkthrough."), "original notes must survive");
  assert.ok(composed.includes("Document is illegible -- please rescan."), "review feedback must be present");
});

test("REGRESSION: review feedback is clearly delimited from the contributor's original notes ('Review feedback:' prefix), never merged indistinguishably", () => {
  const composed = composeRejectionNotes({
    originalNotes: "Original context from the contributor.",
    reason: "Wrong document type.",
  });
  assert.ok(composed.includes("Review feedback: Wrong document type."));
});

test("REGRESSION: reviewer identity/time are never embedded in the composed text -- verified_by/verified_at are authoritative for that, not free text", () => {
  const composed = composeRejectionNotes({
    originalNotes: "Some notes.",
    reason: "Needs a clearer scan.",
  });
  assert.equal(/rejected by/i.test(composed), false, "must not restate reviewer identity in free text");
});

test("review feedback stands alone (prefixed, not bare) when there are no original notes", () => {
  const composed = composeRejectionNotes({
    originalNotes: null,
    reason: "Wrong document type.",
  });
  assert.equal(composed, "Review feedback: Wrong document type.");
});

test("original notes that are empty/whitespace-only are treated the same as no notes at all", () => {
  const composed = composeRejectionNotes({
    originalNotes: "   ",
    reason: "Missing signature.",
  });
  assert.equal(composed, "Review feedback: Missing signature.");
});

test("REGRESSION: the composed string places original notes before the review-feedback line, never interleaved or reordered", () => {
  const composed = composeRejectionNotes({
    originalNotes: "Original contributor context.",
    reason: "Needs a clearer scan.",
  });
  const originalIndex = composed.indexOf("Original contributor context.");
  const feedbackIndex = composed.indexOf("Review feedback:");
  assert.ok(originalIndex >= 0 && feedbackIndex > originalIndex, "original notes must appear before the review-feedback line");
});

test("REGRESSION: rejecting a REPLACEMENT evidence row never concatenates a prior row's rejection history -- each row composes only from its OWN current notes, since evidence rows are never shared/edited across the supersession chain", () => {
  // Simulates: original row rejected (its own notes become "original\n\nReview feedback: first reason").
  // A brand-new replacement row is created independently with fresh notes
  // (never inheriting the original row's composed text -- see
  // createPersonEvidence()/recordDocumentEvidence(), which only ever write
  // input.notes from the NEW upload's own form, never read the prior row's
  // notes at all). Rejecting THAT replacement composes only from ITS OWN
  // notes.
  const replacementRowOwnNotes = "Rescanned copy attached."; // fresh notes on the new row, unrelated to the original's rejection text
  const composed = composeRejectionNotes({
    originalNotes: replacementRowOwnNotes,
    reason: "Still missing a signature page.",
  });
  assert.equal(composed.includes("Review feedback: first reason"), false, "must not carry forward a prior row's rejection history");
  assert.equal(composed, "Rescanned copy attached.\n\nReview feedback: Still missing a signature page.");
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

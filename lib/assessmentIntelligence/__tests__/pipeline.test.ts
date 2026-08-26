import assert from "node:assert/strict";
import { transcribeAndExtractAssessmentAudio, DEFAULT_DISPATCH_LIMIT } from "../pipeline.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("PHI GATE: the automatic audio pipeline refuses a real session id when the PHI flag is not confirmed, before ever touching the database", async () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  // A syntactically-real-looking but nonexistent session id — if this test ever reached the
  // database layer it would need real Supabase credentials configured; it must not get there.
  const result = await transcribeAndExtractAssessmentAudio("00000000-0000-0000-0000-000000000000");
  assert.equal(result.phiGateBlocked, true);
  assert.match(result.error ?? "", /PHI processing is not confirmed/);
  assert.equal(result.draftFactCount, undefined, "must not have attempted extraction");
});

test("SYNTHETIC OVERRIDE: requesting it without PHI_SYNTHETIC_TEST_MODE set still refuses a real session id, before ever touching the database — the override is not a blanket bypass", async () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  delete process.env.PHI_SYNTHETIC_TEST_MODE;
  const result = await transcribeAndExtractAssessmentAudio("00000000-0000-0000-0000-000000000000", { syntheticTestOverride: true });
  assert.equal(result.phiGateBlocked, true);
});

// REGRESSION (2026-08-25 synthetic acceptance test): the first manual dispatch tick left a
// clean, newly-finished synthetic session completely untouched — not because anything failed,
// but because getSessionsEligibleForProcessing() orders eligible sessions oldest-`finished_at`
// -first with no other filtering, and 8 real, permanently-PHI-gate-blocked sessions (predating
// this gate) sat ahead of the synthetic session in that FIFO queue. With the previous default
// limit of 5, no number of dispatch ticks could ever have reached a 9th-or-later session — those
// 8 sessions never leave status='processing', so they are always re-selected first. This asserts
// only that the exported default stays comfortably above that known 8-session backlog, so a
// regression back to a too-small default (e.g. someone "simplifying" it back to 5) would be
// caught here rather than silently starving the next session behind a backlog again. The
// dispatcher/eligibility query itself is I/O (Supabase) and is live-verified, not unit-mocked
// here — matching this file's own PHI-gate tests above.
test("DEFAULT_DISPATCH_LIMIT stays comfortably above the known permanently-blocked-session backlog (8, as of the 2026-08-25 incident) so a newer/synthetic session is never starved behind it", () => {
  assert.ok(
    DEFAULT_DISPATCH_LIMIT > 8,
    `DEFAULT_DISPATCH_LIMIT (${DEFAULT_DISPATCH_LIMIT}) must exceed the known blocked-session backlog (8) or newer sessions can be starved indefinitely`
  );
});

let passed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);

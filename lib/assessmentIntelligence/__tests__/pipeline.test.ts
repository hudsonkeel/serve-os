import assert from "node:assert/strict";
import { transcribeAndExtractAssessmentAudio } from "../pipeline.ts";

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

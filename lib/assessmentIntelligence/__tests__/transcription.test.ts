import assert from "node:assert/strict";
import { chunkIndexFromPath, transcribeAudioChunks } from "../transcription.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("chunkIndexFromPath parses the zero-padded chunk index from a storage path", () => {
  assert.equal(chunkIndexFromPath("abc-123/000000.webm"), 0);
  assert.equal(chunkIndexFromPath("abc-123/000007.webm"), 7);
  assert.equal(chunkIndexFromPath("abc-123/000042.webm"), 42);
});

test("chunkIndexFromPath defaults to 0 for an unrecognized path rather than throwing", () => {
  assert.equal(chunkIndexFromPath("not-a-chunk-path"), 0);
});

test("PHI GATE: transcribeAudioChunks refuses to run — even with zero chunks — when the PHI flag is not confirmed, never reaching the OpenAI client", async () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY; // if this test ever reached the OpenAI client, THIS would also throw — proving the gate fires first, not the missing-key guard
  await assert.rejects(() => transcribeAudioChunks([]), /PHI_OPENAI_PROCESSING_CONFIRMED/);
  if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
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

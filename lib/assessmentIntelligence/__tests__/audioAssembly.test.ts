import assert from "node:assert/strict";
import { assembleAudioChunks } from "../audioAssembly.ts";

// Narrow, deliberately: exercising the real ffmpeg concat path requires actual WebM/Opus bytes
// from a real MediaRecorder capture, which was not available to generate or fabricate safely in
// this session — see this scope's completion report for the explicit call-out that the ffmpeg
// remux path has not been exercised end-to-end. What IS safely testable: the guard that runs
// before ffmpeg is ever invoked.

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("assembleAudioChunks refuses an empty chunk list before ever touching ffmpeg", async () => {
  await assert.rejects(() => assembleAudioChunks([]), /zero chunks/);
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

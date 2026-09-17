import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression check for the 2026-09-17 background-safe core split (see ../dataAccess.ts's header
// comment for the full rationale). Two things must both be true:
//
// 1. Every module in backgroundCore/ -- the exact dependency graph
//    advanceQueuedAssessmentProcessing() needs -- loads cleanly in an ordinary Node process,
//    with no `import "server-only"` anywhere in the chain. This is what makes it safe for
//    netlify/functions/assessment-processing-stage-worker-background.mts to import directly.
//
// 2. The Next-facing originals it was extracted FROM (lib/data/assessmentIntelligence.ts,
//    lib/assessmentIntelligence/pipeline.ts) still throw outside the "react-server" condition --
//    proving the split didn't accidentally weaken the accidental-Client-Component-import
//    backstop those files exist to provide. Only the background-safe core lost the guard; the
//    Next-facing shims that re-export it did not.
//
// DELIBERATELY run without --conditions=react-server (see package.json's
// test:backgroundCoreNodeCompat script) -- the opposite of every other test in this repo, for
// the same reason netlify/functions/__tests__/noServerOnlyImports.test.ts is: it exists to prove
// behavior in the condition-less environment a real Netlify Function bundle runs in, not to
// route around it.

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const BACKGROUND_SAFE_MODULES = [
  "../dataAccess.ts",
  "../providerSelection.ts",
  "../extraction.ts",
  "../providers/bedrockClaudeProvider.ts",
  "../processingCore.ts",
];

for (const relPath of BACKGROUND_SAFE_MODULES) {
  test(`${relPath}: loads cleanly without the react-server condition`, async () => {
    await import(relPath);
  });
}

test("processingCore.ts: exports the real advanceQueuedAssessmentProcessing function (not a stub)", async () => {
  const mod = await import("../processingCore.ts");
  assert.equal(typeof mod.advanceQueuedAssessmentProcessing, "function");
  assert.equal(typeof mod.runExtractionPipelineForSession, "function");
});

// ─── The Next-facing guard is still intact on the ORIGINAL files ──────────────────────────────
// One dynamic-import proof (lib/data/assessmentIntelligence.ts) plus a static source check on
// both files -- not two dynamic-import proofs. Node's CJS/ESM interop for `server-only` (a CJS
// package) throws synchronously on its own module evaluation; triggering that same underlying
// throw a second time in one process, via a second, different ESM entry point that also
// transitively resolves to it (pipeline.ts re-exports from lib/data/assessmentIntelligence.ts),
// produces a stray uncaught exception after this file's own test loop has already finished and
// correctly recorded pass/fail -- a Node module-loader artifact, not a defect in the guard
// itself (confirmed: the single dynamic-import proof below demonstrates the guard is genuinely
// functional, not just textually present).

test("lib/data/assessmentIntelligence.ts: STILL throws outside the react-server condition -- the accidental-Client-Component-import guard was not weakened by the split", async () => {
  await assert.rejects(
    () => import("../../../data/assessmentIntelligence.ts"),
    /cannot be imported from a Client Component/
  );
});

test('lib/assessmentIntelligence/pipeline.ts: source still declares `import "server-only"` as its own first statement', () => {
  const source = readFileSync(fileURLToPath(new URL("../../pipeline.ts", import.meta.url)), "utf8");
  assert.match(source.trimStart(), /^import\s+["']server-only["'];/);
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

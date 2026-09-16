import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression check for the 2026-09-16/17 root cause and its fix: a standalone Netlify Function
// is bundled by Netlify's generic esbuild-based function bundler, which never sets the
// "react-server" export condition Next.js relies on for `server-only` to resolve to its no-op
// stub. Importing anything guarded by it from one of these files throws at MODULE LOAD TIME,
// before the handler function is ever created: invisible to a Background/Scheduled Function's
// caller, since Netlify's 202 acknowledgment already went out before the container tries to
// load the crashing code. See both files' own header comments for the live evidence and full
// architecture history.
//
// assessment-processing-dispatcher.mts stays a thin fetch()-only forwarder with ZERO lib/
// imports at all -- unchanged since the 2026-09-16 fix.
//
// assessment-processing-stage-worker-background.mts is different as of 2026-09-17: it now
// imports lib/assessmentIntelligence/backgroundCore/processingCore.ts directly and calls
// advanceQueuedAssessmentProcessing() in-process (no more same-site HTTP callback -- see that
// file's header comment for why that architecture was abandoned after three separate live
// tests). backgroundCore/ is a set of modules deliberately extracted to carry NO
// `import "server-only"` and no React/Next dependency, so importing FROM there is exactly what
// this fix is -- this test asserts the worker imports ONLY from backgroundCore/ (or a
// backgroundCore-free path), never from the original guarded modules (lib/data/
// assessmentIntelligence.ts, lib/assessmentIntelligence/pipeline.ts, providerSelection.ts,
// extraction.ts, providers/bedrockClaudeProvider.ts) and never a bare "server-only" import.
//
// DELIBERATELY run without --conditions=react-server (see package.json's
// test:netlifyFunctionEntrypoints script) -- every other test in this repo passes that flag
// because it needs server-only-guarded modules to be importable at all for testing. This is the
// one test that must NOT pass it: it exists specifically to prove these two files (and, for the
// worker, its backgroundCore/ dependency graph) load cleanly in the same condition-less
// environment Netlify's real function bundler provides, not to route around it.

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const DISPATCHER = { relPath: "../assessment-processing-dispatcher.mts", absPath: new URL("../assessment-processing-dispatcher.mts", import.meta.url) };
const WORKER = {
  relPath: "../assessment-processing-stage-worker-background.mts",
  absPath: new URL("../assessment-processing-stage-worker-background.mts", import.meta.url),
};

// A bare "server-only" import, or any lib/ import NOT routed through backgroundCore/ -- the
// negative lookahead lets `lib/assessmentIntelligence/backgroundCore/...` through while still
// catching `lib/data/assessmentIntelligence.ts`, `lib/assessmentIntelligence/pipeline.ts`, etc.
const DISALLOWED_OUTSIDE_BACKGROUND_CORE = /from\s+["'](?:(?:\.\.\/)*lib\/(?!(?:\.\.\/)*assessmentIntelligence\/backgroundCore\/)|server-only)/;

// The dispatcher must import nothing from lib/ at all -- unchanged, stricter check.
const DISALLOWED_ANY_LIB = /from\s+["'](?:(?:\.\.\/)+lib\/|server-only)/;

test(`${DISPATCHER.relPath}: source contains no import from lib/ or "server-only"`, () => {
  const source = readFileSync(fileURLToPath(DISPATCHER.absPath), "utf8");
  assert.doesNotMatch(source, DISALLOWED_ANY_LIB);
});

test(`${DISPATCHER.relPath}: loads cleanly without the react-server condition and exports a default handler`, async () => {
  const mod = await import(DISPATCHER.relPath);
  assert.equal(typeof mod.default, "function");
});

test(`${WORKER.relPath}: source imports only from lib/assessmentIntelligence/backgroundCore/ (never the original server-only-guarded modules, never a bare "server-only" import)`, () => {
  const source = readFileSync(fileURLToPath(WORKER.absPath), "utf8");
  assert.doesNotMatch(source, DISALLOWED_OUTSIDE_BACKGROUND_CORE);
  // Positive check too -- this file is supposed to import the real processing core now, not
  // stay lib/-import-free like the dispatcher. If this ever stops matching, the worker has
  // regressed back toward the same-site HTTP callback (or some other indirection) this fix
  // replaced.
  assert.match(source, /from\s+["'](?:\.\.\/)*lib\/assessmentIntelligence\/backgroundCore\//);
});

test(`${WORKER.relPath}: loads cleanly without the react-server condition and exports a default handler`, async () => {
  const mod = await import(WORKER.relPath);
  assert.equal(typeof mod.default, "function");
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

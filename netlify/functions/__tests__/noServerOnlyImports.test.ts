import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression check for the 2026-09-16 root cause: a standalone Netlify Function is bundled by
// Netlify's generic esbuild-based function bundler, which never sets the "react-server" export
// condition Next.js relies on for `server-only` (lib/data/assessmentIntelligence.ts's first
// import, pulled in transitively by lib/assessmentIntelligence/pipeline.ts) to resolve to its
// no-op stub. Importing pipeline.ts -- or anything under lib/data/* -- from one of these two
// files threw at MODULE LOAD TIME, before the handler function was ever created: invisible to a
// Background/Scheduled Function's caller, since Netlify's 202 acknowledgment already went out
// before the container tried to load the crashing code. See both files' own header comments for
// the live evidence (11/11 sessions stuck at processing_diagnostic_stage='invocation_accepted').
//
// DELIBERATELY run without --conditions=react-server (see package.json's
// test:netlifyFunctionEntrypoints script) -- every other test in this repo passes that flag
// because it needs server-only-guarded modules to be importable at all for testing. This is the
// one test that must NOT pass it: it exists specifically to prove these two files load cleanly in
// the same condition-less environment Netlify's real function bundler provides, not to route
// around it.

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ENTRYPOINTS = [
  { relPath: "../assessment-processing-dispatcher.mts", absPath: new URL("../assessment-processing-dispatcher.mts", import.meta.url) },
  {
    relPath: "../assessment-processing-stage-worker-background.mts",
    absPath: new URL("../assessment-processing-stage-worker-background.mts", import.meta.url),
  },
];

// Disallowed regardless of relative-path spelling (../../lib/..., ../../../lib/..., etc.) or a
// bare "server-only" import -- the two symptoms of the same underlying mistake this test guards
// against: pulling any server-only-guarded application module into a standalone Netlify Function.
const DISALLOWED_IMPORT_PATTERN = /from\s+["'](?:(?:\.\.\/)+lib\/|server-only)/;

for (const { relPath, absPath } of ENTRYPOINTS) {
  test(`${relPath}: source contains no import from lib/ or "server-only"`, () => {
    const source = readFileSync(fileURLToPath(absPath), "utf8");
    assert.doesNotMatch(source, DISALLOWED_IMPORT_PATTERN);
  });

  test(`${relPath}: loads cleanly without the react-server condition and exports a default handler`, async () => {
    const mod = await import(relPath);
    assert.equal(typeof mod.default, "function");
  });
}

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

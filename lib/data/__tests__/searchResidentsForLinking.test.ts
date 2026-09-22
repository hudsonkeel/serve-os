// Regression coverage for searchResidentsForLinking()'s is_active gate
// (lib/data/relationships.ts) — the shared "Link Existing Resident" picker
// behind New Incident, New Infection, roster reconciliation, AxisCare
// "Match to Existing Person", and several Relationships flows. Run with:
//   node --experimental-strip-types --conditions=react-server lib/data/__tests__/searchResidentsForLinking.test.ts
//
// searchResidentsForLinking performs a live Supabase call with no pure,
// injectable core, and this codebase has no existing convention for
// mocking Supabase (every other data-layer test in lib/*/__tests__/
// exercises a pure function, never a DB call). Reproducing Postgrest's
// ilike/eq/or filtering semantics in a parallel fake, or adding
// production-only dependency injection, was deliberately rejected as
// disproportionate to a one-clause fix — see the investigation and the
// two prior review passes on this change.
//
// So this asserts the fix at the level that's actually verifiable without
// either of those: a structural, source-level check that the shared query
// unconditionally requires is_active = true, positioned in the same
// unconditional part of the chain as the rest of the base query (not
// nested inside the `filter.mode === "single"` branch, which only some
// callers hit). This is deliberately not a claim that the query's
// end-to-end filtering behavior was independently reproduced — Postgrest's
// own eq()/ilike()/or() semantics are exercised constantly elsewhere in
// this app and are not what regressed here.
//
// The other half of the invariant — that a retired/merged duplicate
// actually has is_active = false and a redirect to its canonical resident
// — is already established by the existing Elliot/Elliott Goldberg
// fixture in lib/data/__tests__/axiscareClientOperationalSummary.test.ts
// and by merge_residents() in
// supabase/migrations/20260805000000_create_resident_identity_resolution.sql.
// Together, that merge invariant + this file's source-level assertion are
// the regression coverage for this fix; run both when validating it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELATIONSHIPS_SOURCE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../relationships.ts");

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function readSearchResidentsForLinkingSource(): string {
  const fullSource = fs.readFileSync(RELATIONSHIPS_SOURCE_PATH, "utf8");
  const start = fullSource.indexOf("export async function searchResidentsForLinking(");
  assert.ok(start !== -1, "searchResidentsForLinking was not found in lib/data/relationships.ts — has it been renamed or moved?");
  // Bounded by the next top-level export after the function start — good
  // enough for this one file's layout, and fails loudly (via the slice
  // being empty/short) rather than silently if that ever stops holding.
  const nextExportIndex = fullSource.indexOf("\nexport ", start + 1);
  const end = nextExportIndex === -1 ? fullSource.length : nextExportIndex;
  return fullSource.slice(start, end);
}

test("REGRESSION: searchResidentsForLinking's shared query unconditionally requires is_active = true", () => {
  const fnSource = readSearchResidentsForLinkingSource();
  assert.match(
    fnSource,
    /\.eq\(\s*["']is_active["']\s*,\s*true\s*\)/,
    "searchResidentsForLinking must filter on is_active = true — without it, a retired/merged duplicate " +
      "(e.g. Elliott Goldberg, redirected to canonical Elliot Goldberg) is independently selectable again " +
      "in every consumer of this shared search (New Incident, New Infection, roster reconciliation, " +
      "AxisCare 'Match to Existing Person', and the Relationships linking flows)."
  );
});

test("the is_active = true filter is unconditional, not nested inside the single-community branch", () => {
  const fnSource = readSearchResidentsForLinkingSource();
  const isActiveIndex = fnSource.search(/\.eq\(\s*["']is_active["']\s*,\s*true\s*\)/);
  const singleModeBranchIndex = fnSource.indexOf('filter.mode === "single"');
  assert.ok(isActiveIndex !== -1, "is_active filter must be present (see previous test)");
  assert.ok(
    singleModeBranchIndex === -1 || isActiveIndex < singleModeBranchIndex,
    "is_active = true must apply to every search (single-community, all-community, and any future mode) " +
      "— it must not be written inside the single-community-only branch, which cross-community and " +
      "'none'-scoped callers never reach."
  );
});

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();

// Structural guarantee: every database-mutating call in
// scripts/importResidentSourceNotes.ts is gated behind `if (APPLY)`, so a
// dry run (the default, no --apply flag) can never perform a write, and
// --apply only ever executes the writes the dry run already showed as
// "will_write". Same static-scan pattern as
// lib/recruiting/operationalUnderstanding/__tests__/noStatusMutation.test.ts.
//
// This is a source-text check, not a live-DB test, because the script
// talks to a real Supabase project with no dependency-injection seam —
// the actual "dry run writes nothing" / "apply writes only what the dry
// run approved" behavior is verified empirically by running the script
// itself (see the reconciliation report), not by mocking Supabase here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

const SCRIPT_PATH = join(import.meta.dirname, "..", "..", "importResidentSourceNotes.ts");
const source = readFileSync(SCRIPT_PATH, "utf8");

const WRITE_CALLS = [
  "saveCurrentNeeds(",
  "createResidentWorkingNote(",
  "createRelationshipWorkingNote(",
  "upsertRelationshipServiceOpportunity(",
];

test("every write call site is preceded by an `if (APPLY)` guard within a few lines", () => {
  const lines = source.split("\n");
  const unguarded: string[] = [];

  for (const call of WRITE_CALLS) {
    lines.forEach((line, index) => {
      if (!line.includes(call)) return;
      const precedingWindow = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
      if (!/if\s*\(\s*APPLY\s*\)/.test(precedingWindow)) {
        unguarded.push(`${call} at line ${index + 1}`);
      }
    });
  }

  assert.deepEqual(unguarded, [], `Unguarded write call(s):\n${unguarded.join("\n")}`);
});

test("the script never calls a write RPC unconditionally at module scope", () => {
  assert.ok(!/^(saveCurrentNeeds|createResidentWorkingNote|createRelationshipWorkingNote|upsertRelationshipServiceOpportunity)\(/m.test(source));
});

test("APPLY is derived only from an explicit --apply flag, never defaulted to true", () => {
  assert.ok(/const APPLY = process\.argv\.includes\(\s*["']--apply["']\s*\)/.test(source));
});

console.log(`\n${passed}/${passed} passed`);

// Structural guarantee: no file in the Operational Understanding engine
// (or its persistence layer) ever references the recruiting_leads table
// directly — it only ever reads/writes recruiting_lead_desired_state_* and
// consumes an already-fetched RecruitingLead as a plain value where needed.
// Same static-scan pattern as lib/collectors/__tests__/contractBoundaries.test.ts.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

const SCAN_ROOTS = [
  join(import.meta.dirname, ".."),
  join(import.meta.dirname, "..", "..", "..", "data", "recruitingLeadOperationalUnderstanding.ts"),
];

const TABLE_REFERENCE_PATTERN = /from\(\s*["']recruiting_leads["']\s*\)/;
const UPDATE_PATTERN = /\.update\s*\(/;

function listTsFiles(pathEntry: string): string[] {
  let stat;
  try {
    stat = statSync(pathEntry);
  } catch {
    return [];
  }

  if (stat.isFile()) {
    return pathEntry.endsWith(".ts") && !pathEntry.endsWith(".test.ts") ? [pathEntry] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(pathEntry)) {
    const fullPath = join(pathEntry, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("no Operational Understanding file references the recruiting_leads table directly", () => {
  const violations: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of listTsFiles(root)) {
      if (TABLE_REFERENCE_PATTERN.test(readFileSync(file, "utf8"))) violations.push(file);
    }
  }
  assert.deepEqual(violations, [], `Direct recruiting_leads table reference found in:\n${violations.join("\n")}`);
});

test("no Operational Understanding file calls .update() at all — every write is a new, append-only insert", () => {
  const violations: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of listTsFiles(root)) {
      if (UPDATE_PATTERN.test(readFileSync(file, "utf8"))) violations.push(file);
    }
  }
  assert.deepEqual(violations, [], `.update() call found in:\n${violations.join("\n")}`);
});

console.log(`\n${passed}/${passed} passed`);

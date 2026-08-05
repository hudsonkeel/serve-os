// Structural boundary test: no collector or extractor source file may call
// a mutating Playwright method. This is a repo-wide scan, the same
// pattern lib/intelligence/core's own vendor-type-leak test already uses —
// a real, structural guarantee, not a convention that relies on every
// future contributor remembering the rule.
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
  join(import.meta.dirname, "..", "..", "recruiting", "extractors"),
  join(import.meta.dirname, ".."),
  join(import.meta.dirname, "..", "..", "..", "scripts", "collectors"),
];

// Mutating Playwright/DOM methods no collector or extractor may call,
// with exactly ONE narrow exception (see ALLOWED_CLICK_FILE below):
// .click() for approved read-only tab navigation. Every other mutating
// method is forbidden everywhere, no exceptions. Deliberately does NOT
// include read-only methods like textContent, getAttribute, isVisible,
// count, or innerText.
const ALWAYS_FORBIDDEN_PATTERNS = [
  /\.dblclick\s*\(/,
  /\.fill\s*\(/,
  /\.type\s*\(/,
  /\.press\s*\(/,
  /\.check\s*\(/,
  /\.uncheck\s*\(/,
  /\.selectOption\s*\(/,
  /\.setInputFiles\s*\(/,
  /\.dragTo\s*\(/,
  /\.goto\s*\(/,
  /\.reload\s*\(/,
  /\.goBack\s*\(/,
  /\.goForward\s*\(/,
];

const CLICK_PATTERN = /\.click\s*\(/;

// The ONE file permitted to call .click() — see its own module comment
// for the full set of conditions that make this an approved exception,
// not a general permission. Any other file matching CLICK_PATTERN is a
// review-blocking violation.
const ALLOWED_CLICK_FILE = "tabNavigation.ts";

function listTsFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("no collector or extractor source file calls an always-forbidden mutating Playwright method", () => {
  const violations: string[] = [];

  for (const root of SCAN_ROOTS) {
    for (const file of listTsFiles(root)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of ALWAYS_FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${file} matches forbidden pattern ${pattern}`);
        }
      }
    }
  }

  assert.deepEqual(violations, [], `Mutating Playwright calls found:\n${violations.join("\n")}`);
});

test("exactly one file (tabNavigation.ts) may call .click(), and no other file does", () => {
  const filesWithClick: string[] = [];

  for (const root of SCAN_ROOTS) {
    for (const file of listTsFiles(root)) {
      const content = readFileSync(file, "utf8");
      if (CLICK_PATTERN.test(content)) {
        filesWithClick.push(file);
      }
    }
  }

  const unexpected = filesWithClick.filter((f) => !f.endsWith(ALLOWED_CLICK_FILE));
  assert.deepEqual(unexpected, [], `.click() found outside the one approved file:\n${unexpected.join("\n")}`);
  assert.ok(
    filesWithClick.some((f) => f.endsWith(ALLOWED_CLICK_FILE)),
    "expected tabNavigation.ts to exist and contain the approved .click() call"
  );
});

// No collector or extractor script ever references the recruiting_leads
// table directly — they only ever read it through the data layer's
// read-only accessor (getRecruitingLeadById). This is the structural half
// of "no collector ever mutates recruiting_leads.status": if the table
// name never appears in a collector/extractor/script file at all, no write
// to it — status or otherwise — can exist there either.
const RECRUITING_LEADS_TABLE_PATTERN = /from\(\s*["']recruiting_leads["']\s*\)/;

test("no collector, extractor, or collector script references the recruiting_leads table directly", () => {
  const violations: string[] = [];

  for (const root of SCAN_ROOTS) {
    for (const file of listTsFiles(root)) {
      const content = readFileSync(file, "utf8");
      if (RECRUITING_LEADS_TABLE_PATTERN.test(content)) {
        violations.push(file);
      }
    }
  }

  assert.deepEqual(violations, [], `Direct recruiting_leads table reference found in:\n${violations.join("\n")}`);
});

test("ObservationOutcome never includes a negative-conclusion value", async () => {
  const { OBSERVATION_OUTCOMES } = await import("../types.ts");
  const forbidden = ["false", "incomplete", "not_done", "rejected", "true"];
  for (const value of forbidden) {
    assert.ok(
      !(OBSERVATION_OUTCOMES as readonly string[]).includes(value),
      `ObservationOutcome must never include "${value}" — that is a reasoning conclusion, not an extraction outcome`
    );
  }
  assert.deepEqual([...OBSERVATION_OUTCOMES].sort(), ["ambiguous", "not_visible", "observed", "unknown"].sort());
});

console.log(`\n${passed}/${passed} passed`);

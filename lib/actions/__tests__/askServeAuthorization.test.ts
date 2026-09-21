// Source-inspection regression proof that askServeQuestion() actually
// calls getCurrentAuthorizedUser() + canViewAskServe() before doing
// anything else (retrieval, model invocation) — not merely somewhere in
// the function body. Behavioral testing isn't possible here:
// getCurrentAuthorizedUser() reads next/headers cookies and throws
// outside a real Next.js request, matching this codebase's established
// convention (see lib/actions/__tests__/residentIdentityAuthorization.test.ts,
// which this file mirrors) — this is the closest proof this codebase's
// test conventions allow for an I/O-heavy "use server" file.
//
//   node --experimental-strip-types --conditions=react-server lib/actions/__tests__/askServeAuthorization.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, "../askServe.ts"), "utf8");

function extractFunctionBody(src: string, name: string): string {
  const startMarker = `export async function ${name}(`;
  const startIndex = src.indexOf(startMarker);
  assert.ok(startIndex !== -1, `could not find "export async function ${name}(" in source`);
  const nextExportIndex = src.indexOf("\nexport async function ", startIndex + startMarker.length);
  return nextExportIndex === -1 ? src.slice(startIndex) : src.slice(startIndex, nextExportIndex);
}

const body = extractFunctionBody(source, "askServeQuestion");

test("file is marked \"use server\"", () => {
  assert.match(source, /^"use server";/);
});

test("calls getCurrentAuthorizedUser() and rejects when no profile is present", () => {
  assert.match(body, /getCurrentAuthorizedUser\(\)/);
  assert.match(body, /if \(!profile\)/);
});

test("calls canViewAskServe(profile.role) and rejects when it returns false", () => {
  assert.match(body, /canViewAskServe\(profile\.role\)/);
  assert.match(body, /if \(!canViewAskServe\(profile\.role\)\)/);
});

test("the authorization gate runs before retrieval and before the model is ever invoked", () => {
  const authIndex = body.indexOf("getCurrentAuthorizedUser()");
  const retrievalIndex = body.indexOf("retrieveKnowledgeEvidence(");
  const synthesisIndex = body.indexOf("synthesizeAskServeAnswer(");
  assert.ok(authIndex !== -1 && retrievalIndex !== -1 && synthesisIndex !== -1, "expected all three calls to be present");
  assert.ok(authIndex < retrievalIndex, "auth check must run before retrieval");
  assert.ok(retrievalIndex < synthesisIndex, "retrieval must run before synthesis");
});

test("input is validated before retrieval is ever called", () => {
  const validateIndex = body.indexOf("validateAskServeQuestion(");
  const retrievalIndex = body.indexOf("retrieveKnowledgeEvidence(");
  assert.ok(validateIndex !== -1 && retrievalIndex !== -1);
  assert.ok(validateIndex < retrievalIndex);
});

test("a client-specific question short-circuits before retrieval is called", () => {
  const clientSpecificIndex = body.indexOf("looksClientSpecific(");
  const retrievalIndex = body.indexOf("retrieveKnowledgeEvidence(");
  assert.ok(clientSpecificIndex !== -1 && retrievalIndex !== -1);
  assert.ok(clientSpecificIndex < retrievalIndex);
});

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

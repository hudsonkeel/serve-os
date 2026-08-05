import assert from "node:assert/strict";
import { looksSensitive, redactSensitiveAnchors } from "../sensitiveDataFilter.ts";
import type { DialogStructuralCapture, StructuralAnchor } from "../../apploi/dialogReconnaissance.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

function anchor(overrides: Partial<StructuralAnchor>): StructuralAnchor {
  return {
    kind: "text",
    attribute: "",
    tag: "p",
    preview: "Independent Living Community Caregiver",
    nearestHeading: null,
    nearestLabeledContainer: null,
    occurrenceCount: 1,
    structuralPath: "div > p",
    ...overrides,
  };
}

test("looksSensitive flags a dashed SSN", () => {
  assert.equal(looksSensitive("123-45-6789"), true);
});

test("looksSensitive flags an undashed 9-digit number", () => {
  assert.equal(looksSensitive("123456789"), true);
});

test("looksSensitive flags a long bank-account-like digit run", () => {
  assert.equal(looksSensitive("00012345678"), true);
});

test("looksSensitive flags an ISO-shaped date (birth-date-like)", () => {
  assert.equal(looksSensitive("1990-04-12"), true);
});

test("looksSensitive flags a US-shaped date", () => {
  assert.equal(looksSensitive("04/12/1990"), true);
});

test("looksSensitive flags a street address", () => {
  assert.equal(looksSensitive("2425 Hampton Drive"), true);
});

test("looksSensitive does NOT flag an ordinary job title or name", () => {
  assert.equal(looksSensitive("Independent Living Community Caregiver"), false);
  assert.equal(looksSensitive("Alma Dhora Owolabi"), false);
});

test("looksSensitive does NOT flag a short label like a status word", () => {
  assert.equal(looksSensitive("Active"), false);
  assert.equal(looksSensitive("Completed"), false);
});

test("redactSensitiveAnchors redacts a matching preview, never drops the row silently", () => {
  const capture: DialogStructuralCapture = { tabLabel: "Viventium Employee Record", anchors: [anchor({ preview: "123-45-6789" })] };
  const result = redactSensitiveAnchors(capture);
  assert.equal(result.anchors.length, 1);
  assert.ok(result.anchors[0].preview.includes("redacted"));
});

test("redactSensitiveAnchors redacts based on nearby label context (e.g. an SSN heading) even if the value itself looks benign", () => {
  const capture: DialogStructuralCapture = {
    tabLabel: "Viventium Employee Record",
    anchors: [anchor({ preview: "on file", nearestHeading: "Social Security Number" })],
  };
  const result = redactSensitiveAnchors(capture);
  assert.ok(result.anchors[0].preview.includes("redacted"));
});

test("redactSensitiveAnchors leaves ordinary anchors untouched", () => {
  const capture: DialogStructuralCapture = { tabLabel: "Viventium Employee Record", anchors: [anchor({ preview: "Active" })] };
  const result = redactSensitiveAnchors(capture);
  assert.equal(result.anchors[0].preview, "Active");
});

console.log(`\n${passed}/${passed} passed`);

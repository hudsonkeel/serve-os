// Tests for ../parseWorkbook.ts against in-memory workbooks (no
// dependency on the real roster file, which could change) — exercises
// header-column detection, the "move in" note vs. real email
// distinction, and the Directory sheet's headerless parsing. Run with:
//   npm run test:residentRoster
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { parseBuildingSheets, parseDirectorySheet } from "../parseWorkbook.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function buildWorkbook(sheets: Record<string, (string | number | null)[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return wb;
}

test("1. parses a Building sheet's header row and data rows correctly", () => {
  const wb = buildWorkbook({
    "Building 1": [
      [null, null, null, "Building Representive Cheat Sheet : Building 1 (2 People)", null, null],
      [null, null, null, null, null, null],
      ["Apt. #", "Last Name", "First Name(s)", "Phone Number", "Alternate Phone", "Email Address"],
      [1201, "Reedy", "Carl", "972-679-9919", null, "carl@example.com"],
      [1210, "Witherspoon", "Patti Ann", "214-407-7729", null, null],
    ],
  });
  const rows = parseBuildingSheets(wb);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].apartmentRaw, "1201");
  assert.equal(rows[0].lastNameRaw, "Reedy");
  assert.equal(rows[0].firstNamesRaw, "Carl");
  assert.equal(rows[0].emailRaw, "carl@example.com");
});

test("2. a non-email value in the Email column becomes a note, never a fabricated email", () => {
  const wb = buildWorkbook({
    "Building 1": [
      ["Apt. #", "Last Name", "First Name(s)", "Phone Number", "Alternate Phone", "Email Address"],
      [1210, "Witherspoon", "Patti Ann", "940-498-2354", null, "6/8/26 Move In"],
    ],
  });
  const rows = parseBuildingSheets(wb);
  assert.equal(rows[0].emailRaw, null);
  assert.equal(rows[0].noteRaw, "6/8/26 Move In");
});

test("3. only sheets literally named 'Building N' are parsed — other sheets (e.g. a meal-plan list) are ignored", () => {
  const wb = buildWorkbook({
    "Building 1": [
      ["Apt. #", "Last Name", "First Name(s)", "Phone Number", "Alternate Phone", "Email Address"],
      [1201, "Reedy", "Carl", null, null, null],
    ],
    "Signature Lifestyle List": [
      ["Apartment", "Last Name", "First Name", "Phone Number", "Secondary", "Email Address", "Meal Plan"],
      [1201, "Reedy", "Carl", null, null, null, "SM Single"],
    ],
  });
  const rows = parseBuildingSheets(wb);
  assert.equal(rows.length, 1);
  assert.ok(rows.every((r) => r.sourceSheet === "Building 1"));
});

test("4. a blank trailing row does not produce a phantom source row", () => {
  const wb = buildWorkbook({
    "Building 1": [
      ["Apt. #", "Last Name", "First Name(s)", "Phone Number", "Alternate Phone", "Email Address"],
      [1201, "Reedy", "Carl", null, null, null],
      [null, null, null, null, null, null],
    ],
  });
  const rows = parseBuildingSheets(wb);
  assert.equal(rows.length, 1);
});

test("5. parseDirectorySheet reads headerless data starting at the first numeric-apartment row", () => {
  const wb = buildWorkbook({
    Directory: [
      [null, null, null, null, null, null],
      [null, null, null, 46220, null, null],
      [1201, "Reedy", "Carl", "972-679-9919", null, "carl@example.com"],
      [1210, "Witherspoon", "Patti Ann", "214-407-7729", null, null],
    ],
  });
  const rows = parseDirectorySheet(wb);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].apartmentRaw, "1201");
  assert.equal(rows[0].lastNameRaw, "Reedy");
});

test("6. header-column detection tolerates label variation ('Phone' vs 'Phone Number', 'Alternate' vs 'Alternate Phone')", () => {
  const wb = buildWorkbook({
    "Building 2": [
      ["Apt. #", "Last Name", "First Name(s)", "Phone", "Alternate", "Email Address"],
      [2201, "Smith", "Jane", "111-111-1111", null, null],
    ],
  });
  const rows = parseBuildingSheets(wb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phoneRaw, "111-111-1111");
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

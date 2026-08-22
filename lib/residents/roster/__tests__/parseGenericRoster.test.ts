import assert from "node:assert/strict";
import XLSX from "xlsx";
import { parseGenericRosterSheet } from "../parseGenericRoster.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

function workbookFromRows(rows: (string | number | null)[][]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return wb;
}

test("recognizes standard headers and parses rows", () => {
  const wb = workbookFromRows([
    ["Resident Last Name", "Resident First Name", "Apartment", "Phone", "Email"],
    ["Smith", "Jane", "204", "555-1234", "jane@example.com"],
    ["Doe", "John", "301", "555-5678", "not-an-email note"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].lastNameRaw, "Smith");
  assert.equal(result.rows[0].firstNamesRaw, "Jane");
  assert.equal(result.rows[0].apartmentRaw, "204");
  assert.equal(result.rows[0].emailRaw, "jane@example.com");
  assert.equal(result.rows[1].emailRaw, null);
  assert.equal(result.rows[1].noteRaw, "not-an-email note");
  assert.equal(result.invalidRows.length, 0);
});

test("a row with no name at all is reported invalid, not silently dropped", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name", "Apartment"],
    ["", "", "204"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows.length, 0);
  assert.equal(result.invalidRows.length, 1);
  assert.equal(result.invalidRows[0].sourceRowNumber, 2);
  assert.match(result.invalidRows[0].reason, /name/i);
});

test("blank rows are silently skipped, never reported as invalid", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name"],
    ["Smith", "Jane"],
    [null, null],
    ["Doe", "John"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows.length, 2);
  assert.equal(result.invalidRows.length, 0);
});

test("unmapped columns are reported, never silently reinterpreted", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name", "Newsletter Status", "Club Membership"],
    ["Smith", "Jane", "Yes", "Gold"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.deepEqual([...result.unmappedColumns].sort(), ["Club Membership", "Newsletter Status"]);
});

test("alternate phone claims its column before the generic phone pattern would", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name", "Phone", "Alt Phone"],
    ["Smith", "Jane", "555-1111", "555-2222"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows[0].phoneRaw, "555-1111");
  assert.equal(result.rows[0].alternatePhoneRaw, "555-2222");
});

test("DOB column is recognized and carried through, even though matching doesn't consume it yet", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name", "Date of Birth"],
    ["Smith", "Jane", "1/2/1940"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows[0].dobRaw, "1/2/1940");
});

// Community Roster Import + Reconciliation phase, Pass 3 — a genuine
// .xlsx file (unlike a CSV upload, which now reads with raw:true — see
// loadRosterWorkbookFromBuffer()'s own comment) can still carry a
// natively-typed date cell as a numeric Excel serial. This test proves
// the defensive numeric fallback in cellToDobString() converts a clean
// serial date back to a plain YYYY-MM-DD string. 36525 is independently
// verified against XLSX.SSF.parse_date_code(36525) => 1999-12-31, not
// assumed.
test("a numeric Excel serial date in the DOB cell (native .xlsx date-typed cell) converts to a plain YYYY-MM-DD string", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name", "DOB"],
    ["Smith", "Jane", 36525],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows[0].dobRaw, "1999-12-31");
});

test("first-name-only row (no last name) is still valid — name minimum is 'a' name, not specifically last name", () => {
  const wb = workbookFromRows([
    ["Last Name", "First Name"],
    ["", "Cher"],
  ]);
  const result = parseGenericRosterSheet(wb);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].firstNamesRaw, "Cher");
});

console.log(`\n${passed}/${passed} passed`);

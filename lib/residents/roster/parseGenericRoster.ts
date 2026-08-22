// Community Roster Import + Reconciliation phase — a lightweight, single-
// sheet CSV/XLSX column-mapper for roster formats other than Watermere's
// specific multi-sheet "Building N" workbook (see parseWorkbook.ts for
// that one, reused unchanged). Deliberately NOT a general ETL/mapping
// designer (section 34's own boundary) — a fixed, fuzzy-substring column
// recognizer, same style as parseWorkbook.ts's mapColumns(), just against
// a flat single-sheet shape instead of a known multi-sheet layout.
//
// Pure, no I/O — takes an already-parsed WorkBook (from
// loadRosterWorkbookFromBuffer()) and the sheet to read (defaults to the
// first sheet, since a CSV upload always produces exactly one).
// Default import only — see parseWorkbook.ts's own comment on why named
// imports and namespace imports both fail under raw Node's ESM loader
// for this package.
import XLSX from "xlsx";
import { looksLikeEmail } from "./normalization.ts";
import type { RawRosterRow } from "./types.ts";

type SheetRow = readonly (string | number | null)[];

type RecognizedField = "apartment" | "lastName" | "firstName" | "phone" | "alternatePhone" | "email" | "dob";

interface GenericColumnMap {
  apartment: number | null;
  lastName: number | null;
  firstName: number | null;
  phone: number | null;
  alternatePhone: number | null;
  email: number | null;
  dob: number | null;
}

// Order matters: more specific patterns first so e.g. "alternate phone"
// is claimed before the generic "phone" pattern would otherwise grab it.
const COLUMN_PATTERNS: readonly { field: RecognizedField; test: (header: string) => boolean }[] = [
  { field: "alternatePhone", test: (h) => h.includes("alt") && h.includes("phone") },
  { field: "phone", test: (h) => h.includes("phone") || h.includes("mobile") || h.includes("cell") },
  { field: "email", test: (h) => h.includes("email") || h.includes("e-mail") },
  { field: "apartment", test: (h) => h.includes("apt") || h.includes("apartment") || h.includes("unit") || h.includes("room") },
  { field: "dob", test: (h) => h.includes("dob") || h.includes("birth") },
  { field: "lastName", test: (h) => h.includes("last") && h.includes("name") },
  { field: "firstName", test: (h) => h.includes("first") && h.includes("name") },
];

function cellToString(cell: string | number | null | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  const str = String(cell).trim();
  return str.length > 0 ? str : null;
}

// DOB gets its own cell reader: XLSX's CSV type-inference recognizes a
// date-shaped string (e.g. "1999-12-31") and silently converts it to a
// numeric Excel serial date (with a stray fractional/time component the
// CSV inference sometimes attaches) rather than leaving it as text —
// confirmed live via the Pass 3 verify script, which caught a DOB
// surfacing as "36524.75" instead of the original date. Every OTHER
// field here is genuinely free-text and never hits this, so only DOB
// needs the numeric-serial round-trip back to a plain YYYY-MM-DD string,
// via XLSX's own official serial<->calendar conversion (SSF.parse_date_code)
// rather than hand-rolled epoch math. The read behavior of
// loadRosterWorkbookFromBuffer() itself is untouched — this is a
// field-level correction, not a parser-wide option change (which would
// also risk the unrelated, must-stay-unmodified Watermere Building-sheet
// path sharing that same function).
function cellToDobString(cell: string | number | null | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number") {
    const parsed = XLSX.SSF.parse_date_code(cell);
    if (!parsed) return null;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${mm}-${dd}`;
  }
  return cellToString(cell);
}

export interface GenericRosterParseResult {
  readonly rows: RawRosterRow[];
  readonly recognizedColumns: readonly { field: RecognizedField; header: string }[];
  readonly unmappedColumns: readonly string[];
  // Row-level failures, never silently dropped (section 33) — the row is
  // excluded from `rows`, but every exclusion is reported with a reason.
  readonly invalidRows: readonly { sourceRowNumber: number; reason: string }[];
}

export function parseGenericRosterSheet(workbook: XLSX.WorkBook, sheetName?: string): GenericRosterParseResult {
  const resolvedSheetName = sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[resolvedSheetName];
  if (!sheet) {
    return { rows: [], recognizedColumns: [], unmappedColumns: [], invalidRows: [] };
  }

  const sheetRows = sheetToRows(workbook, resolvedSheetName);
  if (sheetRows.length === 0) {
    return { rows: [], recognizedColumns: [], unmappedColumns: [], invalidRows: [] };
  }

  const headerRow = sheetRows[0];
  const columns: GenericColumnMap = { apartment: null, lastName: null, firstName: null, phone: null, alternatePhone: null, email: null, dob: null };
  const claimed = new Set<number>();
  const recognizedColumns: { field: RecognizedField; header: string }[] = [];

  headerRow.forEach((cell, idx) => {
    const header = cellToString(cell);
    if (!header) return;
    const lower = header.toLowerCase();
    const match = COLUMN_PATTERNS.find((p) => !claimed.has(idx) && p.test(lower));
    if (match && columns[match.field] === null) {
      columns[match.field] = idx;
      claimed.add(idx);
      recognizedColumns.push({ field: match.field, header });
    }
  });

  const unmappedColumns = headerRow
    .map((cell, idx) => ({ header: cellToString(cell), idx }))
    .filter((c): c is { header: string; idx: number } => c.header !== null && !claimed.has(c.idx))
    .map((c) => c.header);

  const rows: RawRosterRow[] = [];
  const invalidRows: { sourceRowNumber: number; reason: string }[] = [];

  for (let i = 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (row.every((cell) => cellToString(cell) === null)) continue; // blank row, silently skipped (not an error)

    const sourceRowNumber = i + 1; // 1-indexed, matches what a human sees in the file
    const lastNameRaw = columns.lastName !== null ? cellToString(row[columns.lastName]) : null;
    const firstNameRaw = columns.firstName !== null ? cellToString(row[columns.firstName]) : null;

    // Section 96: a person name is the required minimum identity — a row
    // with neither first nor last name never enters matching.
    if (!lastNameRaw && !firstNameRaw) {
      invalidRows.push({ sourceRowNumber, reason: "Missing resident name." });
      continue;
    }

    const emailCell = columns.email !== null ? cellToString(row[columns.email]) : null;
    const isEmail = looksLikeEmail(emailCell);

    rows.push({
      sourceSheet: resolvedSheetName,
      sourceRowNumber,
      apartmentRaw: (columns.apartment !== null ? cellToString(row[columns.apartment]) : null) ?? "",
      lastNameRaw: lastNameRaw ?? "",
      firstNamesRaw: firstNameRaw ?? "",
      phoneRaw: columns.phone !== null ? cellToString(row[columns.phone]) : null,
      alternatePhoneRaw: columns.alternatePhone !== null ? cellToString(row[columns.alternatePhone]) : null,
      emailRaw: isEmail ? emailCell : null,
      noteRaw: !isEmail ? emailCell : null,
      dobRaw: columns.dob !== null ? cellToDobString(row[columns.dob]) : null,
    });
  }

  return { rows, recognizedColumns, unmappedColumns, invalidRows };
}

function sheetToRows(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as SheetRow[];
}

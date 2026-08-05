// Watermere official roster workbook parsing. Per the reconciliation
// architecture's explicit source-authority decision: "Building 1"–
// "Building 10" are the authoritative source of truth (clean headers,
// row counts that exactly match their own stated "(N People)" titles);
// "Directory" is used only as a cross-check to flag disagreements, never
// to override a Building-sheet value; "Signature Lifestyle List" (a
// dining-program subset with a different shape — a Meal Plan column,
// couples combined into one first-name field) is excluded entirely.
// xlsx is a CommonJS package whose Node-only members (readFile, etc.) are
// added to module.exports in a way Node's CJS/ESM interop does not
// statically detect as named exports — only the default import carries
// them reliably. Never switch this to `import * as XLSX`.
import XLSX from "xlsx";
import { looksLikeEmail } from "./normalization.ts";
import type { DirectoryRow, RawRosterRow } from "./types.ts";

const BUILDING_SHEET_PATTERN = /^Building \d+$/;
const DIRECTORY_SHEET_NAME = "Directory";

type SheetRow = readonly (string | number | null)[];

function findHeaderRowIndex(rows: readonly SheetRow[]): number {
  return rows.findIndex((row) => row.some((cell) => typeof cell === "string" && /apt/i.test(cell)));
}

interface ColumnMap {
  apartment: number;
  lastName: number;
  firstNames: number;
  phone: number;
  alternatePhone: number;
  email: number;
}

function mapColumns(headerRow: SheetRow): ColumnMap {
  const find = (predicate: (cell: string) => boolean, fallback: number): number => {
    const idx = headerRow.findIndex((cell) => typeof cell === "string" && predicate(cell.toLowerCase()));
    return idx === -1 ? fallback : idx;
  };
  return {
    apartment: find((c) => c.includes("apt"), 0),
    lastName: find((c) => c.includes("last"), 1),
    firstNames: find((c) => c.includes("first"), 2),
    phone: find((c) => c.includes("phone") && !c.includes("alt"), 3),
    alternatePhone: find((c) => c.includes("alt"), 4),
    email: find((c) => c.includes("email"), 5),
  };
}

function cellToString(cell: string | number | null): string | null {
  if (cell === null || cell === undefined) return null;
  const str = String(cell).trim();
  return str.length > 0 ? str : null;
}

export function parseBuildingSheets(workbook: XLSX.WorkBook): RawRosterRow[] {
  const rows: RawRosterRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (!BUILDING_SHEET_PATTERN.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as SheetRow[];

    const headerIdx = findHeaderRowIndex(sheetRows);
    if (headerIdx === -1) {
      throw new Error(`Sheet "${sheetName}" has no recognizable header row (expected a cell containing "Apt")`);
    }
    const columns = mapColumns(sheetRows[headerIdx]);

    for (let i = headerIdx + 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const apartmentRaw = cellToString(row[columns.apartment]);
      if (!apartmentRaw) continue; // blank trailing row

      const lastNameRaw = cellToString(row[columns.lastName]) ?? "";
      const firstNamesRaw = cellToString(row[columns.firstNames]) ?? "";
      const emailCell = cellToString(row[columns.email]);
      const isEmail = looksLikeEmail(emailCell);

      rows.push({
        sourceSheet: sheetName,
        sourceRowNumber: i + 1, // 1-indexed, matches what a human sees in Excel
        apartmentRaw,
        lastNameRaw,
        firstNamesRaw,
        phoneRaw: cellToString(row[columns.phone]),
        alternatePhoneRaw: cellToString(row[columns.alternatePhone]),
        emailRaw: isEmail ? emailCell : null,
        noteRaw: !isEmail ? emailCell : null,
      });
    }
  }

  return rows;
}

// Directory sheet has no header row — data begins at the first row whose
// first cell is a plausible apartment number (a bare number or numeric
// string), and ends at the first fully-blank row after that.
export function parseDirectorySheet(workbook: XLSX.WorkBook): DirectoryRow[] {
  const sheet = workbook.Sheets[DIRECTORY_SHEET_NAME];
  if (!sheet) return [];
  const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as SheetRow[];

  const rows: DirectoryRow[] = [];
  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    const apartmentCell = row[0];
    if (typeof apartmentCell !== "number" && !(typeof apartmentCell === "string" && /^\d+$/.test(apartmentCell.trim()))) {
      continue;
    }
    rows.push({
      sourceRowNumber: i + 1,
      apartmentRaw: String(apartmentCell).trim(),
      lastNameRaw: cellToString(row[1]) ?? "",
      firstNamesRaw: cellToString(row[2]) ?? "",
    });
  }
  return rows;
}

export function loadRosterWorkbook(filePath: string): XLSX.WorkBook {
  return XLSX.readFile(filePath);
}

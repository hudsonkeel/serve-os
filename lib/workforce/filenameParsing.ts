// Bulk-import filename suggestion parsing — e.g. "Hudson Keel - EMR
// 7.2026.pdf", "Susan Akam - NAR 7.2026.pdf". Pure, no I/O.
//
// A suggestion is a convenience for a human reviewer, never verified
// evidence — per the mission's explicit warning: "Filename interpretation
// is a convenience and must never be treated as verified evidence." Every
// field here is a *suggestion*; the bulk-import UI requires explicit human
// confirmation of caregiver, document type, and date before any document
// or evidence row is created — see lib/actions/workforce.ts.

export interface FilenameParseResult {
  rawFilename: string;
  suggestedCaregiverName: string | null;
  suggestedDocumentType: "nar_search" | "emr_search" | null;
  // ISO date string (YYYY-MM-DD), always day 01 — filenames only carry
  // month/year precision (e.g. "7.2026"), never a specific day.
  suggestedDate: string | null;
}

const DOCUMENT_TYPE_KEYWORDS: Record<string, "nar_search" | "emr_search"> = {
  nar: "nar_search",
  emr: "emr_search",
};

// Matches "M.YYYY" or "MM.YYYY" (e.g. "7.2026", "12.2026").
const DATE_PATTERN = /\b(\d{1,2})\.(\d{4})\b/;

export function parseBulkImportFilename(filename: string): FilenameParseResult {
  const withoutExtension = filename.replace(/\.pdf$/i, "");

  const [namePart, ...restParts] = withoutExtension.split(" - ");
  const rest = restParts.join(" - ");

  // Only a suggestion when the filename actually has a " - " separator —
  // a bare "scan0001.pdf" has no reliable name portion to guess at.
  const suggestedCaregiverName =
    restParts.length > 0 && namePart.trim().length > 0 ? namePart.trim() : null;

  let suggestedDocumentType: "nar_search" | "emr_search" | null = null;
  const searchIn = rest || withoutExtension;
  for (const [keyword, documentType] of Object.entries(DOCUMENT_TYPE_KEYWORDS)) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(searchIn)) {
      suggestedDocumentType = documentType;
      break;
    }
  }

  let suggestedDate: string | null = null;
  const dateMatch = searchIn.match(DATE_PATTERN);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, "0");
    const year = dateMatch[2];
    const monthNum = Number(month);
    if (monthNum >= 1 && monthNum <= 12) {
      suggestedDate = `${year}-${month}-01`;
    }
  }

  return {
    rawFilename: filename,
    suggestedCaregiverName,
    suggestedDocumentType,
    suggestedDate,
  };
}

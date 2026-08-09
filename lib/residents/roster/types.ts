// Shared types for the Watermere official roster reconciliation engine.
// See docs referenced from scripts/importWatermereRoster.ts's module
// comment for the governing rules this engine implements.

// ─── Parsed source data ───────────────────────────────────────────────

// One row exactly as it appears in a "Building N" sheet — before any
// normalization or couple-splitting.
export interface RawRosterRow {
  readonly sourceSheet: string;
  readonly sourceRowNumber: number;
  readonly apartmentRaw: string;
  readonly lastNameRaw: string;
  readonly firstNamesRaw: string;
  readonly phoneRaw: string | null;
  readonly alternatePhoneRaw: string | null;
  readonly emailRaw: string | null;
  // Free-text found in a phone/email cell that isn't actually a phone or
  // email (e.g. "6/8/26 Move In") — preserved, never discarded, never
  // treated as a real email/phone.
  readonly noteRaw: string | null;
}

// A row from the "Directory" sheet, used only for cross-check — never a
// source of truth for matching or writes.
export interface DirectoryRow {
  readonly sourceRowNumber: number;
  readonly apartmentRaw: string;
  readonly lastNameRaw: string;
  readonly firstNamesRaw: string;
}

// A single person, after splitting a couple row ("Bob & Pam") into two
// independent entries. A single-person row produces exactly one of these.
export interface NormalizedPerson {
  readonly sourceSheet: string;
  readonly sourceRowNumber: number;
  readonly apartment: string; // normalized
  readonly lastName: string; // normalized (lowercased) — for matching
  readonly firstName: string; // normalized (lowercased) — for matching
  // Original casing, for anything actually written to the database (a
  // new resident's first_name/last_name must never be all-lowercase).
  readonly lastNameRaw: string;
  readonly firstNameRaw: string;
  readonly displayLabel: string; // for reports — "Bob Hatch"
  readonly isPartOfCouple: boolean;
  // Carried through from the source row so a new resident is created with
  // a phone number when the roster provided one — shared across both
  // halves of a couple row, since the roster only lists one number per
  // apartment.
  readonly phoneRaw: string | null;
}

// ─── Live resident snapshot ────────────────────────────────────────────

export interface LiveResident {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly middleName: string | null;
  readonly preferredName: string | null;
  readonly displayName: string | null;
  readonly fullName: string | null;
  readonly unitNumber: string | null;
  readonly building: string | null;
  readonly communityCode: string | null;
  readonly isActive: boolean;
}

// ─── Matching ──────────────────────────────────────────────────────────

export type MatchConfidence = "high" | "medium" | "low" | "none";

export type MatchMethod =
  | "unique_name_apartment_matches"
  | "unique_name_apartment_differs"
  | "confirmed_alias_match"
  | "no_match";

export interface PersonMatchResult {
  readonly person: NormalizedPerson;
  readonly status: "matched" | "ambiguous" | "unmatched";
  readonly residentId: string | null;
  readonly residentName: string | null;
  readonly residentUnit: string | null;
  readonly confidence: MatchConfidence;
  readonly method: MatchMethod;
  readonly reason: string;
  readonly ambiguousCandidateIds?: readonly string[];
}

// ─── Reconciliation outcomes ────────────────────────────────────────────

export type PersonOutcomeClassification =
  | "exact_match"
  | "apartment_change"
  | "new_resident"
  | "ambiguous"
  | "possible_duplicate"
  | "conflict"
  | "skipped";

export interface PersonOutcome {
  readonly person: NormalizedPerson;
  readonly classification: PersonOutcomeClassification;
  readonly residentId: string | null;
  readonly residentName: string | null;
  readonly priorUnit: string | null;
  readonly matchMethod: MatchMethod | null;
  readonly matchConfidence: MatchConfidence | null;
  readonly reason: string;
  readonly ambiguousCandidateIds?: readonly string[];
  // Set only when this row's apartment also appears on another Building
  // sheet row — neither is auto-applied.
  readonly duplicateOfSourceRow?: number;
  // Cross-check note from the Directory sheet, when it disagrees with the
  // Building-sheet value for this same apartment. Never changes the
  // classification above — informational only.
  readonly directoryDiscrepancy?: string | null;
}

export interface AbsentResident {
  readonly residentId: string;
  readonly residentName: string;
  readonly lastKnownUnitNumber: string | null;
  readonly communityCode: string | null;
}

export interface ReconciliationResult {
  readonly totalSourceRows: number;
  readonly personOutcomes: readonly PersonOutcome[];
  readonly absentResidents: readonly AbsentResident[];
}

// ─── Review-resolution file (human input for ambiguous/duplicate/absence) ─

export interface AmbiguousResolution {
  readonly sourceSheet: string;
  readonly sourceRowNumber: number;
  readonly residentId: string;
  readonly note?: string;
}

export interface DuplicateResolution {
  readonly apartment: string;
  readonly action: "skip" | "use_first" | "use_second";
}

export interface AbsenceDisposition {
  readonly residentId: string;
  readonly disposition: "moved_out" | "deceased" | "transferred" | "still_active" | "unknown";
  readonly effectiveDate?: string;
  readonly decidedBy: string;
  readonly reason?: string;
  readonly notes?: string;
}

export interface RosterResolutionFile {
  readonly ambiguousResolutions?: readonly AmbiguousResolution[];
  readonly duplicateResolutions?: readonly DuplicateResolution[];
  readonly absenceDispositions?: readonly AbsenceDisposition[];
}

// Orchestrates the Watermere roster reconciliation: raw rows -> normalized
// persons -> matched/classified outcomes -> existing-residents-absent
// detection. Pure — no I/O — takes an already-loaded resident snapshot and
// already-parsed rows, so it's fully unit-testable without a database.
import { normalizeName, normalizeUnit, splitCoupleFirstNames } from "./normalization.ts";
import { matchPerson } from "./matching.ts";
import type {
  AbsentResident,
  DirectoryRow,
  LiveResident,
  NormalizedPerson,
  PersonOutcome,
  RawRosterRow,
  ReconciliationResult,
} from "./types.ts";
import type { ConfirmedAlias } from "../identity/types.ts";

// Rows whose "Last Name" cell is a vacancy marker rather than a real
// surname — sometimes paired with a stray artifact (an Excel date serial
// number that leaked into the First Name cell) that would otherwise look
// like a one-token first name. Never represents a real person; produces
// zero NormalizedPersons regardless of what else is in the row.
const VACANCY_MARKERS = new Set(["unoccupied", "vacant", "vacancy"]);

export function normalizeRawRowToPersons(row: RawRosterRow): NormalizedPerson[] {
  const apartment = normalizeUnit(row.apartmentRaw);
  const lastName = normalizeName(row.lastNameRaw);
  if (VACANCY_MARKERS.has(lastName)) return [];

  const firstNames = splitCoupleFirstNames(row.firstNamesRaw);
  const isPartOfCouple = firstNames.length > 1;

  return firstNames.map((firstNameRaw) => ({
    sourceSheet: row.sourceSheet,
    sourceRowNumber: row.sourceRowNumber,
    apartment,
    lastName,
    firstName: normalizeName(firstNameRaw),
    lastNameRaw: row.lastNameRaw.trim(),
    firstNameRaw: firstNameRaw.trim(),
    displayLabel: `${firstNameRaw.trim()} ${row.lastNameRaw.trim()}`.trim(),
    isPartOfCouple,
    phoneRaw: row.phoneRaw,
  }));
}

// Apartments appearing on more than one distinct source row (not just
// more than one person — a couple sharing one row is expected and fine).
function findDuplicateApartmentRows(rows: readonly RawRosterRow[]): ReadonlySet<string> {
  const rowNumbersByApartment = new Map<string, Set<number>>();
  for (const row of rows) {
    const apartment = normalizeUnit(row.apartmentRaw);
    if (!apartment) continue;
    const set = rowNumbersByApartment.get(apartment) ?? new Set<number>();
    set.add(row.sourceRowNumber);
    rowNumbersByApartment.set(apartment, set);
  }
  const duplicates = new Set<string>();
  for (const [apartment, rowNumbers] of rowNumbersByApartment) {
    if (rowNumbers.size > 1) duplicates.add(apartment);
  }
  return duplicates;
}

function findDirectoryDiscrepancy(
  row: RawRosterRow,
  directoryRows: readonly DirectoryRow[],
): string | null {
  const apartment = normalizeUnit(row.apartmentRaw);
  const match = directoryRows.find((d) => normalizeUnit(d.apartmentRaw) === apartment);
  if (!match) return null;

  const buildingLastName = normalizeName(row.lastNameRaw);
  const buildingFirstNames = normalizeName(row.firstNamesRaw);
  const directoryLastName = normalizeName(match.lastNameRaw);
  const directoryFirstNames = normalizeName(match.firstNamesRaw);

  if (buildingLastName === directoryLastName && buildingFirstNames === directoryFirstNames) return null;

  return `Directory sheet lists apartment ${apartment} as "${match.firstNamesRaw} ${match.lastNameRaw}" — differs from this Building sheet's "${row.firstNamesRaw} ${row.lastNameRaw}". Building sheet value used; Directory not applied.`;
}

export function reconcileRoster(
  rawRows: readonly RawRosterRow[],
  directoryRows: readonly DirectoryRow[],
  liveResidents: readonly LiveResident[],
  confirmedAliases: readonly ConfirmedAlias[] = [],
): ReconciliationResult {
  const duplicateApartments = findDuplicateApartmentRows(rawRows);
  const matchedResidentIds = new Set<string>();
  const personOutcomes: PersonOutcome[] = [];

  for (const row of rawRows) {
    const apartment = normalizeUnit(row.apartmentRaw);
    const directoryDiscrepancy = findDirectoryDiscrepancy(row, directoryRows);
    const isDuplicateRow = duplicateApartments.has(apartment);
    const persons = normalizeRawRowToPersons(row);

    for (const person of persons) {
      if (isDuplicateRow) {
        personOutcomes.push({
          person,
          classification: "possible_duplicate",
          residentId: null,
          residentName: null,
          priorUnit: null,
          matchMethod: null,
          matchConfidence: null,
          reason: `Apartment ${apartment} appears on more than one Building-sheet row — not auto-applied.`,
          directoryDiscrepancy,
        });
        continue;
      }

      const match = matchPerson(person, liveResidents, confirmedAliases);

      if (match.status === "ambiguous") {
        personOutcomes.push({
          person,
          classification: "ambiguous",
          residentId: null,
          residentName: null,
          priorUnit: null,
          matchMethod: match.method,
          matchConfidence: match.confidence,
          reason: match.reason,
          ambiguousCandidateIds: match.ambiguousCandidateIds,
          directoryDiscrepancy,
        });
        continue;
      }

      if (match.status === "unmatched") {
        const occupant = liveResidents.find((r) => normalizeUnit(r.unitNumber) === apartment);
        const reason = occupant
          ? `No identity match; apartment ${apartment} currently shows a different resident on file (${occupant.firstName ?? ""} ${occupant.lastName ?? ""}) — that resident is evaluated separately for roster absence, never assumed to be this person.`
          : `No identity match; apartment ${apartment} is not currently assigned to any resident on file.`;
        personOutcomes.push({
          person,
          classification: "new_resident",
          residentId: null,
          residentName: null,
          priorUnit: null,
          matchMethod: null,
          matchConfidence: null,
          reason,
          directoryDiscrepancy,
        });
        continue;
      }

      // matched
      matchedResidentIds.add(match.residentId as string);
      const resident = liveResidents.find((r) => r.id === match.residentId);
      const priorUnit = resident?.unitNumber ?? null;
      const apartmentChanged = normalizeUnit(priorUnit) !== apartment;

      personOutcomes.push({
        person,
        classification: apartmentChanged ? "apartment_change" : "exact_match",
        residentId: match.residentId,
        residentName: match.residentName,
        priorUnit,
        matchMethod: match.method,
        matchConfidence: match.confidence,
        reason: match.reason,
        directoryDiscrepancy,
      });
    }
  }

  const absentResidents: AbsentResident[] = liveResidents
    .filter((r) => r.isActive && !matchedResidentIds.has(r.id))
    .map((r) => ({
      residentId: r.id,
      residentName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.displayName || r.fullName || "Unnamed Resident",
      lastKnownUnitNumber: r.unitNumber,
      communityCode: r.communityCode,
    }));

  return {
    totalSourceRows: rawRows.length,
    personOutcomes,
    absentResidents,
  };
}

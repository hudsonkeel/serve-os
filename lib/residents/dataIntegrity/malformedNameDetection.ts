// malformed_name detection — structural source defects: numeric/Excel-
// serial values in a name field, a vacancy marker treated as a person, and
// (conservatively, flag-only) a suspected first/last field reversal.
// Deliberately does NOT attempt to detect or restructure genuinely
// ambiguous compound names — that's identity resolution's job
// (lib/residents/identity/identitySignals.ts's compound_name_variant
// signal), not a data-integrity defect. Pure, no I/O.
import { normalizeFullName, normalizeNamePart } from "../identity/normalization.ts";
import type { IntegrityEvidenceSignal, ResidentForIntegrityDetection } from "./types.ts";

// Mirrors lib/residents/roster/reconcile.ts's VACANCY_MARKERS — this is a
// defensive backstop for pre-existing rows; the roster importer already
// refuses to create a resident from a vacancy-marker row in the first
// place, so this only ever fires against historical/pre-existing data.
const VACANCY_MARKERS = new Set(["unoccupied", "vacant", "vacancy"]);

export function isNumericLikeName(namePart: string | null): boolean {
  if (!namePart) return false;
  return /^\d+(\.\d+)?$/.test(namePart.trim());
}

export function detectMalformedName(resident: Pick<ResidentForIntegrityDetection, "firstName" | "lastName">): IntegrityEvidenceSignal[] {
  const signals: IntegrityEvidenceSignal[] = [];

  if (isNumericLikeName(resident.firstName)) {
    signals.push({
      signalType: "numeric_first_name",
      description: `First name "${resident.firstName}" is purely numeric — likely an Excel serial value or other parsing artifact, not a real name.`,
      rawValue: resident.firstName,
    });
  }
  if (isNumericLikeName(resident.lastName)) {
    signals.push({
      signalType: "numeric_last_name",
      description: `Last name "${resident.lastName}" is purely numeric — likely an Excel serial value or other parsing artifact, not a real name.`,
      rawValue: resident.lastName,
    });
  }

  const lastNorm = normalizeNamePart(resident.lastName);
  if (VACANCY_MARKERS.has(lastNorm)) {
    signals.push({
      signalType: "vacancy_marker_as_person",
      description: `Last name "${resident.lastName}" is a vacancy marker, not a person's name.`,
      rawValue: resident.lastName,
    });
  }

  return signals;
}

// Suspected first/last reversal: only flagged when swapping produces an
// EXACT match against another resident already on file — never a fuzzy
// guess, and never auto-restructured. Requires the full candidate set to
// compare against.
export function detectPossibleNameReversal(
  resident: ResidentForIntegrityDetection,
  others: readonly ResidentForIntegrityDetection[],
): IntegrityEvidenceSignal[] {
  const swappedName = normalizeFullName(resident.lastName, resident.firstName);
  if (!swappedName) return [];

  const match = others.find((o) => o.id !== resident.id && normalizeFullName(o.firstName, o.lastName) === swappedName);
  if (!match) return [];

  return [
    {
      signalType: "possible_first_last_reversal",
      description: `Swapping this record's first/last name ("${resident.lastName} ${resident.firstName}") exactly matches another resident already on file ("${match.firstName} ${match.lastName}") — possible field reversal, not auto-corrected.`,
    },
  ];
}

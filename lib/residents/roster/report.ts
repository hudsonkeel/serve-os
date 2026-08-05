// Human-readable reconciliation report generation — pure, no I/O. See the
// governing plan's "Reconciliation report" section for the required
// shape.
import type { PersonOutcome, PersonOutcomeClassification, ReconciliationResult } from "./types.ts";

export interface ReportCounts {
  readonly totalSourceRows: number;
  readonly exactMatch: number;
  readonly apartmentChange: number;
  readonly newResident: number;
  readonly ambiguous: number;
  readonly possibleDuplicate: number;
  readonly absentExisting: number;
}

function countByClassification(outcomes: readonly PersonOutcome[], classification: PersonOutcomeClassification): number {
  return outcomes.filter((o) => o.classification === classification).length;
}

export function buildReportCounts(result: ReconciliationResult): ReportCounts {
  return {
    totalSourceRows: result.totalSourceRows,
    exactMatch: countByClassification(result.personOutcomes, "exact_match"),
    apartmentChange: countByClassification(result.personOutcomes, "apartment_change"),
    newResident: countByClassification(result.personOutcomes, "new_resident"),
    ambiguous: countByClassification(result.personOutcomes, "ambiguous"),
    possibleDuplicate: countByClassification(result.personOutcomes, "possible_duplicate"),
    absentExisting: result.absentResidents.length,
  };
}

export function formatReconciliationReport(result: ReconciliationResult, mode: "dry_run" | "apply"): string {
  const counts = buildReportCounts(result);
  const lines: string[] = [];

  lines.push(`=== Watermere Roster Reconciliation (${mode === "apply" ? "APPLIED" : "DRY RUN"}) ===`);
  lines.push("");
  lines.push("SUMMARY");
  lines.push(`  Source rows: ${counts.totalSourceRows}`);
  lines.push(`  Exact matches (no-op): ${counts.exactMatch}`);
  lines.push(`  Apartment changes: ${counts.apartmentChange}`);
  lines.push(`  New residents: ${counts.newResident}`);
  lines.push(`  Ambiguous (needs review): ${counts.ambiguous}`);
  lines.push(`  Possible duplicate source rows (needs review): ${counts.possibleDuplicate}`);
  lines.push(`  Existing residents absent from roster (needs review): ${counts.absentExisting}`);
  lines.push("");

  const apartmentChanges = result.personOutcomes.filter((o) => o.classification === "apartment_change");
  if (apartmentChanges.length > 0) {
    lines.push("APARTMENT CHANGES");
    lines.push("  Resident | Existing apartment | Official apartment | Match method | Confidence");
    for (const o of apartmentChanges) {
      lines.push(`  ${o.residentName} | ${o.priorUnit ?? "(none)"} | ${o.person.apartment} | ${o.matchMethod} | ${o.matchConfidence}`);
    }
    lines.push("");
  }

  const newResidents = result.personOutcomes.filter((o) => o.classification === "new_resident");
  if (newResidents.length > 0) {
    lines.push("NEW RESIDENTS");
    for (const o of newResidents) {
      lines.push(`  ${o.person.displayLabel} — apartment ${o.person.apartment} (${o.person.sourceSheet} row ${o.person.sourceRowNumber}). ${o.reason}`);
    }
    lines.push("");
  }

  const ambiguous = result.personOutcomes.filter((o) => o.classification === "ambiguous");
  if (ambiguous.length > 0) {
    lines.push("AMBIGUOUS MATCHES (review required)");
    for (const o of ambiguous) {
      lines.push(`  ${o.person.displayLabel} — apartment ${o.person.apartment} (${o.person.sourceSheet} row ${o.person.sourceRowNumber}). ${o.reason}`);
    }
    lines.push("");
  }

  const duplicates = result.personOutcomes.filter((o) => o.classification === "possible_duplicate");
  if (duplicates.length > 0) {
    lines.push("POSSIBLE DUPLICATE SOURCE ROWS (review required)");
    for (const o of duplicates) {
      lines.push(`  ${o.person.displayLabel} — apartment ${o.person.apartment} (${o.person.sourceSheet} row ${o.person.sourceRowNumber}). ${o.reason}`);
    }
    lines.push("");
  }

  const discrepancies = result.personOutcomes.filter((o) => o.directoryDiscrepancy);
  if (discrepancies.length > 0) {
    lines.push("DIRECTORY SHEET DISCREPANCIES (informational only — Building sheet value used)");
    const seen = new Set<string>();
    for (const o of discrepancies) {
      if (o.directoryDiscrepancy && !seen.has(o.directoryDiscrepancy)) {
        seen.add(o.directoryDiscrepancy);
        lines.push(`  ${o.directoryDiscrepancy}`);
      }
    }
    lines.push("");
  }

  if (result.absentResidents.length > 0) {
    lines.push("EXISTING RESIDENTS ABSENT FROM OFFICIAL ROSTER (review required — no status change)");
    lines.push("  Resident | Current Serve apartment | Recommended action");
    for (const r of result.absentResidents) {
      lines.push(`  ${r.residentName} | ${r.lastKnownUnitNumber ?? "(none)"} | review`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

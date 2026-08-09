// Watermere Official Roster Reconciliation — CLI entry point.
//
// This script is a thin wrapper around the durable, reusable engine in
// lib/residents/roster/*.ts and lib/data/residentRoster.ts — a future
// admin UI or scheduled job can call the same library functions without
// rewriting the matching/reconciliation logic. See the governing plan
// (docs referenced in the PR/commit this shipped with) for the full set
// of rules this implements; the two load-bearing ones repeated here
// because violating them is unrecoverable:
//   - NEVER infer death or move-out from roster absence. An existing
//     resident missing from the roster is recorded in
//     roster_absence_reviews for human review — residents.status/
//     is_active/relationship_status are never touched by this script,
//     even when a human later provides a disposition via --resolve-file
//     (see the migration's module comment for why).
//   - An apartment change always preserves residents.id — never delete
//     and recreate a resident to apply an update.
//
// Dry run (default):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/importWatermereRoster.ts --file="data/imports/watermere-official-roster-2026-07-22.xlsx"
// Apply:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/importWatermereRoster.ts --file="..." --apply
// Apply with human resolutions for ambiguous/duplicate/absence rows:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/importWatermereRoster.ts --file="..." --apply --resolve-file="data/imports/watermere-roster-resolutions.json"
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyRosterApartmentChange,
  applyRosterNewResident,
  createImportRun,
  getOpenAbsenceReviewByResident,
  insertSourceRows,
  loadLiveWatermereResidents,
  recordRosterAbsence,
  resolveRosterAbsence,
  updateImportRunCounts,
} from "../lib/data/residentRoster.ts";
import { loadConfirmedAliases } from "../lib/data/residentIdentity.ts";
import { createIntegrityIssues } from "../lib/data/residentDataIntegrity.ts";
import { computeFingerprint } from "../lib/residents/dataIntegrity/fingerprint.ts";
import { detectMalformedPhone } from "../lib/residents/dataIntegrity/malformedPhoneDetection.ts";
import { validatePhoneForStorage } from "../lib/residents/dataIntegrity/phoneNormalization.ts";
import { loadRosterWorkbook, parseBuildingSheets, parseDirectorySheet } from "../lib/residents/roster/parseWorkbook.ts";
import { reconcileRoster } from "../lib/residents/roster/reconcile.ts";
import { buildReportCounts, formatReconciliationReport } from "../lib/residents/roster/report.ts";
import type { PersonOutcome, RosterResolutionFile } from "../lib/residents/roster/types.ts";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const APPLY = args.includes("--apply");
const FILE_PATH = argValue("file");
const COMMUNITY_CODE = argValue("community-code") ?? "watermere-frisco";
const COMMUNITY_NAME = "Watermere at Frisco";
const EFFECTIVE_DATE = argValue("effective-date") ?? null;
const OUTPUT_PATH = argValue("output");
const RESOLVE_FILE_PATH = argValue("resolve-file");
const VERBOSE = args.includes("--verbose");
const ACTOR = `Watermere Roster Import (${process.env.USER || process.env.USERNAME || "unknown operator"})`;

function log(...values: unknown[]) {
  console.log(...values);
}

function loadResolutionFile(): RosterResolutionFile {
  if (!RESOLVE_FILE_PATH) return {};
  const raw = readFileSync(RESOLVE_FILE_PATH, "utf8");
  return JSON.parse(raw) as RosterResolutionFile;
}

async function main() {
  if (!FILE_PATH) {
    console.error("Usage: --file=<path to roster .xlsx> [--apply] [--effective-date=YYYY-MM-DD] [--community-code=watermere-frisco] [--output=<path>] [--resolve-file=<path>] [--verbose]");
    process.exit(1);
  }

  log(`\n=== Watermere Roster Reconciliation ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);

  const fileBuffer = readFileSync(FILE_PATH);
  const sourceHash = createHash("sha256").update(fileBuffer).digest("hex");
  const resolution = loadResolutionFile();

  const workbook = loadRosterWorkbook(FILE_PATH);
  const buildingRows = parseBuildingSheets(workbook);
  const directoryRows = parseDirectorySheet(workbook);
  log(`Parsed ${buildingRows.length} Building-sheet rows, ${directoryRows.length} Directory rows (cross-check only).`);

  const liveResidents = await loadLiveWatermereResidents(COMMUNITY_CODE);
  log(`Loaded ${liveResidents.length} live resident(s) for community "${COMMUNITY_CODE}".`);

  const confirmedAliases = await loadConfirmedAliases();
  if (confirmedAliases.length > 0) {
    log(`Loaded ${confirmedAliases.length} confirmed identity alias(es) — consulted before creating any new resident.`);
  }

  let result = reconcileRoster(buildingRows, directoryRows, liveResidents, confirmedAliases);
  result = applyResolutions(result, resolution, liveResidents);

  const counts = buildReportCounts(result);
  log("\n" + formatReconciliationReport(result, APPLY ? "apply" : "dry_run"));

  const run = await createImportRun({
    communityCode: COMMUNITY_CODE,
    sourceFilename: FILE_PATH,
    sourceHash,
    sourceEffectiveDate: EFFECTIVE_DATE,
    importedBy: ACTOR,
    mode: APPLY ? "apply" : "dry_run",
  });
  if (run.error || !run.id) {
    console.error("Could not create import run record:", run.error);
    process.exit(1);
  }

  await insertSourceRows(run.id, result.personOutcomes);

  let appliedAt: string | null = null;

  if (APPLY) {
    appliedAt = new Date().toISOString();
    let applyErrors = 0;
    const detectionRunId = randomUUID();
    const importBatch = `watermere-official-roster-${EFFECTIVE_DATE ?? new Date().toISOString().slice(0, 10)}`;

    for (const outcome of result.personOutcomes) {
      if (outcome.classification === "apartment_change" && outcome.residentId) {
        const { error } = await applyRosterApartmentChange({
          residentId: outcome.residentId,
          newUnitNumber: outcome.person.apartment,
          newBuilding: null,
          communityCode: COMMUNITY_CODE,
          importRunId: run.id,
          actor: ACTOR,
        });
        if (error) {
          applyErrors++;
          console.error(`  ERROR applying apartment change for ${outcome.residentName}: ${error}`);
        } else if (VERBOSE) {
          log(`  Applied apartment change: ${outcome.residentName} -> ${outcome.person.apartment}`);
        }
      }

      if (outcome.classification === "new_resident") {
        const phoneValidation = validatePhoneForStorage(outcome.person.phoneRaw);
        const { id: newResidentId, error } = await applyRosterNewResident({
          firstName: outcome.person.firstNameRaw,
          lastName: outcome.person.lastNameRaw,
          displayName: outcome.person.displayLabel,
          fullName: outcome.person.displayLabel,
          communityName: COMMUNITY_NAME,
          communityCode: COMMUNITY_CODE,
          unitNumber: outcome.person.apartment,
          building: null,
          phone: phoneValidation.normalized,
          phoneRaw: outcome.person.phoneRaw,
          sourceSystem: "Watermere official roster",
          sourceFile: FILE_PATH,
          importBatch,
          importRunId: run.id,
          actor: ACTOR,
        });
        if (error) {
          applyErrors++;
          console.error(`  ERROR creating new resident ${outcome.person.displayLabel}: ${error}`);
        } else {
          if (VERBOSE) log(`  Created new resident: ${outcome.person.displayLabel} at apartment ${outcome.person.apartment}`);

          if (!phoneValidation.valid && newResidentId) {
            const evidence = detectMalformedPhone(outcome.person.phoneRaw);
            const issueResult = await createIntegrityIssues(
              detectionRunId,
              [
                {
                  issueType: "malformed_phone",
                  severity: "medium",
                  sourceSystem: "Watermere official roster",
                  sourceFile: FILE_PATH,
                  importBatch,
                  importRunId: run.id,
                  evidence,
                  recommendedAction: "Confirm the correct phone number from an authoritative source, then use Correct Malformed Field.",
                  detectorRule: "malformed_phone_at_roster_import",
                  detectorVersion: "1",
                  fingerprint: computeFingerprint("malformed_phone", [newResidentId], [outcome.person.phoneRaw]),
                  members: [{ residentId: newResidentId, role: "subject" }],
                },
              ],
              ACTOR,
            );
            if (issueResult.error) {
              console.error(`  ERROR recording malformed_phone issue for ${outcome.person.displayLabel}: ${issueResult.error}`);
            } else if (VERBOSE) {
              log(`  Flagged malformed phone for ${outcome.person.displayLabel}: "${outcome.person.phoneRaw}" preserved raw, not written to phone.`);
            }
          }
        }
      }
    }

    // ─── duplicate_source_row: the same apartment claimed by more than one
    // Building-sheet row before any resident was ever created from them.
    // reconcileRoster already classifies these as "possible_duplicate"
    // (lib/residents/roster/reconcile.ts) — this only wires that existing
    // detection into the Resident Data Integrity queue instead of leaving
    // it silently recorded in roster_source_rows alone.
    const duplicateRowGroups = new Map<string, PersonOutcome[]>();
    for (const outcome of result.personOutcomes) {
      if (outcome.classification !== "possible_duplicate") continue;
      const list = duplicateRowGroups.get(outcome.person.apartment) ?? [];
      list.push(outcome);
      duplicateRowGroups.set(outcome.person.apartment, list);
    }
    for (const [apartment, outcomes] of duplicateRowGroups) {
      const evidence = outcomes.map((o) => ({
        signalType: "duplicate_source_row",
        description: `Apartment ${apartment} appears on source row ${o.person.sourceRowNumber} ("${o.person.displayLabel}") — more than one Building-sheet row claims this apartment in the same import.`,
      }));
      const issueResult = await createIntegrityIssues(
        detectionRunId,
        [
          {
            issueType: "duplicate_source_row",
            severity: "low",
            sourceSystem: "Watermere official roster",
            sourceFile: FILE_PATH,
            importBatch,
            importRunId: run.id,
            evidence,
            recommendedAction: `Review the source file for apartment ${apartment} and resolve via --resolve-file before the next apply.`,
            detectorRule: "duplicate_apartment_row_same_import",
            detectorVersion: "1",
            fingerprint: computeFingerprint("duplicate_source_row", [], [importBatch, apartment]),
            members: [],
          },
        ],
        ACTOR,
      );
      if (issueResult.error) {
        console.error(`  ERROR recording duplicate_source_row issue for apartment ${apartment}: ${issueResult.error}`);
      }
    }

    for (const absent of result.absentResidents) {
      const { error } = await recordRosterAbsence({
        residentId: absent.residentId,
        importRunId: run.id,
        communityCode: absent.communityCode ?? COMMUNITY_CODE,
        lastKnownUnitNumber: absent.lastKnownUnitNumber,
        actor: ACTOR,
      });
      if (error) {
        applyErrors++;
        console.error(`  ERROR recording absence for ${absent.residentName}: ${error}`);
      }
    }

    for (const disposition of resolution.absenceDispositions ?? []) {
      const review = await getOpenAbsenceReviewByResident(disposition.residentId);
      if (!review) {
        console.error(`  No open absence review found for resident ${disposition.residentId} — skipping disposition.`);
        continue;
      }
      const { error } = await resolveRosterAbsence({
        reviewId: review.id,
        disposition: disposition.disposition,
        disposition_reason: disposition.reason ?? null,
        disposition_effective_date: disposition.effectiveDate ?? null,
        decidedBy: disposition.decidedBy,
      });
      if (error) {
        applyErrors++;
        console.error(`  ERROR resolving absence review for ${disposition.residentId}: ${error}`);
      } else {
        log(`  Resolved absence review for resident ${disposition.residentId}: ${disposition.disposition}`);
      }
    }

    if (applyErrors > 0) {
      console.error(`\n${applyErrors} error(s) occurred during apply — see above.`);
    }
  }

  await updateImportRunCounts({
    runId: run.id,
    totalSourceRows: result.totalSourceRows,
    matchedCount: counts.exactMatch + counts.apartmentChange,
    apartmentChangeCount: counts.apartmentChange,
    newResidentCount: counts.newResident,
    ambiguousCount: counts.ambiguous,
    duplicateSourceCount: counts.possibleDuplicate,
    absentExistingCount: counts.absentExisting,
    noOpCount: counts.exactMatch,
    appliedAt,
  });

  if (OUTPUT_PATH) {
    writeFileSync(OUTPUT_PATH, formatReconciliationReport(result, APPLY ? "apply" : "dry_run"));
    log(`\nReport written to ${OUTPUT_PATH}`);
  }

  log(`\nImport run id: ${run.id}`);
  log("No AxisCare or Cinch records were touched by this script — it has no code path capable of it.");
}

// Applies a resolution file's decisions to the reconciliation result
// before it's reported/applied: an ambiguous row with a matching
// residentId resolution is reclassified exactly like a normal match
// (apartment_change or exact_match depending on the resident's current
// unit); a possible_duplicate apartment resolved to "skip" or
// "use_first"/"use_second" keeps only the chosen row's persons, each
// re-evaluated as an ordinary (non-duplicate) match.
function applyResolutions(
  result: ReturnType<typeof reconcileRoster>,
  resolution: RosterResolutionFile,
  liveResidents: Awaited<ReturnType<typeof loadLiveWatermereResidents>>,
): ReturnType<typeof reconcileRoster> {
  if (!resolution.ambiguousResolutions?.length && !resolution.duplicateResolutions?.length) return result;

  const ambiguousByKey = new Map(
    (resolution.ambiguousResolutions ?? []).map((r) => [`${r.sourceSheet}#${r.sourceRowNumber}`, r]),
  );
  const duplicateByApartment = new Map((resolution.duplicateResolutions ?? []).map((r) => [r.apartment, r]));

  // For "use_first"/"use_second": determine, per apartment, which
  // distinct source row number appeared first vs. second among this
  // apartment's possible_duplicate outcomes — independent of how many
  // persons (couples) each row contributed.
  const rowNumbersByApartment = new Map<string, number[]>();
  for (const outcome of result.personOutcomes) {
    if (outcome.classification !== "possible_duplicate") continue;
    const list = rowNumbersByApartment.get(outcome.person.apartment) ?? [];
    if (!list.includes(outcome.person.sourceRowNumber)) list.push(outcome.person.sourceRowNumber);
    rowNumbersByApartment.set(outcome.person.apartment, list);
  }
  for (const list of rowNumbersByApartment.values()) list.sort((a, b) => a - b);

  const updated: PersonOutcome[] = [];

  for (const outcome of result.personOutcomes) {
    if (outcome.classification === "ambiguous") {
      const key = `${outcome.person.sourceSheet}#${outcome.person.sourceRowNumber}`;
      const resolved = ambiguousByKey.get(key);
      if (resolved) {
        const resident = liveResidents.find((r) => r.id === resolved.residentId);
        updated.push({
          ...outcome,
          classification: resident && resident.unitNumber === outcome.person.apartment ? "exact_match" : "apartment_change",
          residentId: resolved.residentId,
          residentName: resident ? [resident.firstName, resident.lastName].filter(Boolean).join(" ") : null,
          priorUnit: resident?.unitNumber ?? null,
          matchMethod: null,
          matchConfidence: "high",
          reason: `Resolved via review-resolution file${resolved.note ? `: ${resolved.note}` : "."}`,
        });
        continue;
      }
    }

    if (outcome.classification === "possible_duplicate") {
      const dup = duplicateByApartment.get(outcome.person.apartment);
      if (dup) {
        if (dup.action === "skip") {
          updated.push({ ...outcome, classification: "skipped", reason: "Skipped via review-resolution file (duplicate apartment)." });
          continue;
        }
        const rowNumbers = rowNumbersByApartment.get(outcome.person.apartment) ?? [];
        const chosenRowNumber = dup.action === "use_first" ? rowNumbers[0] : rowNumbers[1];
        if (outcome.person.sourceRowNumber !== chosenRowNumber) {
          updated.push({ ...outcome, classification: "skipped", reason: "Skipped via review-resolution file (duplicate apartment — a different row was chosen)." });
          continue;
        }
        updated.push({
          ...outcome,
          classification: "new_resident",
          reason: `Chosen via review-resolution file (${dup.action}) — re-run matching manually if this should instead have matched an existing resident.`,
        });
        continue;
      }
    }

    updated.push(outcome);
  }

  return { ...result, personOutcomes: updated };
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

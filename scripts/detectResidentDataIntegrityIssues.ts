// Resident Data Integrity — issue detection CLI.
//
// Deterministic (never AI-fabricated) detection of source/parsing/
// normalization/import-write defects across the live resident population.
// Detection is automatic; nothing here merges anything — see
// supabase/migrations/20260807000000_create_resident_data_integrity.sql and
// lib/residents/dataIntegrity/ for the full engine and its governing rules.
// Review/resolution happens afterward, through /resident-data-integrity.
//
// Dry run (default — computes and prints, writes nothing):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/detectResidentDataIntegrityIssues.ts
// Apply (persists issues into resident_data_integrity_issues):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/detectResidentDataIntegrityIssues.ts --apply
// One-time migration of existing resident_identity_candidates that are
// actually same_import_duplicate cases, not genuine identity uncertainty.
// For every open/investigating identity candidate, re-evaluates the pair
// against detectSameImportDuplicate; where it matches, the identity
// candidate is dismissed (never merged — resolveCandidateNotDuplicate) and
// a same_import_duplicate issue is created in its place, linked via
// linked_identity_candidate_id. Genuine identity cases (e.g. spelling
// variants from different sources) are left untouched in
// /resident-identities:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/detectResidentDataIntegrityIssues.ts --migrate-existing-cases
import { randomUUID } from "node:crypto";
import {
  createIntegrityIssues,
  loadResidentsForIntegrityDetection,
  loadResidentsForIntegrityDetectionByIds,
} from "../lib/data/residentDataIntegrity.ts";
import { loadOpenCandidatesForMigration, resolveCandidateNotDuplicate } from "../lib/data/residentIdentity.ts";
import { computeFingerprint } from "../lib/residents/dataIntegrity/fingerprint.ts";
import { detectMalformedName, detectPossibleNameReversal } from "../lib/residents/dataIntegrity/malformedNameDetection.ts";
import { detectMalformedPhone } from "../lib/residents/dataIntegrity/malformedPhoneDetection.ts";
import { detectSameImportDuplicate } from "../lib/residents/dataIntegrity/sameImportDuplicateDetection.ts";
import type { IssueDraft, ResidentForIntegrityDetection } from "../lib/residents/dataIntegrity/types.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const MIGRATE_EXISTING_CASES = args.includes("--migrate-existing-cases");
function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}
const COMMUNITY_CODE = argValue("community-code") ?? "watermere-frisco";
const ACTOR = `Resident Data Integrity Detection (${process.env.USER || process.env.USERNAME || "unknown operator"})`;
const DETECTOR_VERSION = "1";

function log(...values: unknown[]) {
  console.log(...values);
}

function residentLabel(r: ResidentForIntegrityDetection): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unnamed";
  return r.unitNumber ? `${name} (Unit ${r.unitNumber})` : name;
}

function draftFromSameImportDuplicate(a: ResidentForIntegrityDetection, b: ResidentForIntegrityDetection): IssueDraft | null {
  const evidence = detectSameImportDuplicate(a, b);
  if (evidence.length === 0) return null;
  return {
    issueType: "same_import_duplicate",
    severity: "high",
    sourceSystem: a.sourceSystem,
    sourceFile: a.sourceFile,
    importBatch: a.importBatch,
    importRunId: null,
    evidence,
    recommendedAction: "Review both records; if confirmed, use Confirm Duplicate Import Record to merge via the existing consolidation workflow.",
    detectorRule: "same_import_duplicate_live_population",
    detectorVersion: DETECTOR_VERSION,
    fingerprint: computeFingerprint("same_import_duplicate", [a.id, b.id], [a.importBatch]),
    members: [
      { residentId: a.id, role: "candidate" },
      { residentId: b.id, role: "candidate" },
    ],
  };
}

function draftsFromSingleResident(r: ResidentForIntegrityDetection, allResidents: readonly ResidentForIntegrityDetection[]): IssueDraft[] {
  const drafts: IssueDraft[] = [];

  const phoneEvidence = detectMalformedPhone(r.phoneRaw);
  if (phoneEvidence.length > 0) {
    drafts.push({
      issueType: "malformed_phone",
      severity: "medium",
      sourceSystem: r.sourceSystem,
      sourceFile: r.sourceFile,
      importBatch: r.importBatch,
      importRunId: null,
      evidence: phoneEvidence,
      recommendedAction: "Confirm the correct phone number from an authoritative source, then use Correct Malformed Field.",
      detectorRule: "malformed_phone_live_population",
      detectorVersion: DETECTOR_VERSION,
      fingerprint: computeFingerprint("malformed_phone", [r.id], [r.phoneRaw]),
      members: [{ residentId: r.id, role: "subject" }],
    });
  }

  const nameEvidence = [...detectMalformedName(r), ...detectPossibleNameReversal(r, allResidents)];
  if (nameEvidence.length > 0) {
    drafts.push({
      issueType: "malformed_name",
      severity: "low",
      sourceSystem: r.sourceSystem,
      sourceFile: r.sourceFile,
      importBatch: r.importBatch,
      importRunId: null,
      evidence: nameEvidence,
      recommendedAction: "Confirm the correct name from an authoritative source, then use Correct Malformed Field. Never auto-restructured.",
      detectorRule: "malformed_name_live_population",
      detectorVersion: DETECTOR_VERSION,
      fingerprint: computeFingerprint("malformed_name", [r.id], [r.firstName, r.lastName]),
      members: [{ residentId: r.id, role: "subject" }],
    });
  }

  return drafts;
}

async function runMigrateExistingCases(residentsById: Map<string, ResidentForIntegrityDetection>) {
  log(`\n=== Migrate existing resident_identity_candidates that are actually same_import_duplicate cases ===\n`);

  const openCandidates = await loadOpenCandidatesForMigration();
  log(`${openCandidates.length} open/investigating identity candidate(s) on record.`);

  const toMigrate: { candidateId: string; draft: IssueDraft; residentIds: [string, string] }[] = [];
  const staying: string[] = [];

  for (const candidate of openCandidates) {
    const [idA, idB] = candidate.memberResidentIds;
    let a = idA ? residentsById.get(idA) : undefined;
    let b = idB ? residentsById.get(idB) : undefined;
    if ((!a || !b) && idA && idB) {
      const fetched = await loadResidentsForIntegrityDetectionByIds([idA, idB]);
      a = fetched.find((r) => r.id === idA) ?? a;
      b = fetched.find((r) => r.id === idB) ?? b;
    }
    if (!a || !b) continue;

    const draft = draftFromSameImportDuplicate(a, b);
    if (draft) {
      toMigrate.push({ candidateId: candidate.id, draft, residentIds: [a.id, b.id] });
    } else {
      staying.push(candidate.id);
    }
  }

  log(`  ${toMigrate.length} candidate(s) are same-import duplicates -> will move to Resident Data Integrity.`);
  log(`  ${staying.length} candidate(s) remain genuine identity questions -> stay in /resident-identities.`);

  if (!APPLY) {
    log(`\nDry run only. Re-run with --apply to perform the migration.`);
    for (const m of toMigrate) {
      const a = residentsById.get(m.residentIds[0]);
      const b = residentsById.get(m.residentIds[1]);
      log(`    ${a ? residentLabel(a) : m.residentIds[0]} + ${b ? residentLabel(b) : m.residentIds[1]}`);
    }
    return;
  }

  const detectionRunId = randomUUID();
  let migrated = 0;
  for (const m of toMigrate) {
    const issueResult = await createIntegrityIssues(detectionRunId, [m.draft], ACTOR);
    if (issueResult.error) {
      console.error(`  ERROR creating issue for candidate ${m.candidateId}: ${issueResult.error}`);
      continue;
    }
    const dismissResult = await resolveCandidateNotDuplicate(
      m.candidateId,
      ACTOR,
      "Reclassified as Resident Data Integrity — same import event writing the same person twice, not genuine identity uncertainty. See /resident-data-integrity.",
    );
    if (dismissResult.error) {
      console.error(`  ERROR dismissing candidate ${m.candidateId}: ${dismissResult.error}`);
      continue;
    }
    migrated++;
  }
  log(`Migrated ${migrated}/${toMigrate.length} candidate(s).`);
}

async function main() {
  log(`\n=== Resident Data Integrity Issue Detection ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);

  const residents = await loadResidentsForIntegrityDetection(COMMUNITY_CODE);
  log(`Loaded ${residents.length} live resident(s) for community "${COMMUNITY_CODE}".`);
  const residentsById = new Map(residents.map((r) => [r.id, r]));

  if (MIGRATE_EXISTING_CASES) {
    await runMigrateExistingCases(residentsById);
    return;
  }

  const drafts: IssueDraft[] = [];

  for (let i = 0; i < residents.length; i++) {
    for (let j = i + 1; j < residents.length; j++) {
      const draft = draftFromSameImportDuplicate(residents[i], residents[j]);
      if (draft) drafts.push(draft);
    }
  }

  for (const r of residents) {
    drafts.push(...draftsFromSingleResident(r, residents));
  }

  const counts = { same_import_duplicate: 0, duplicate_source_row: 0, malformed_phone: 0, malformed_name: 0 };
  for (const d of drafts) counts[d.issueType]++;

  log(`\nSUMMARY`);
  log(`  same_import_duplicate: ${counts.same_import_duplicate}`);
  log(`  malformed_phone: ${counts.malformed_phone}`);
  log(`  malformed_name: ${counts.malformed_name}`);
  log(`  (duplicate_source_row is detected at roster-import time — see scripts/importWatermereRoster.ts, not here.)`);

  for (const d of drafts) {
    const names = d.members.map((m) => (residentsById.has(m.residentId) ? residentLabel(residentsById.get(m.residentId) as ResidentForIntegrityDetection) : m.residentId));
    log(`  [${d.issueType}] ${names.join(" + ")}`);
    for (const e of d.evidence) log(`    - ${e.description}`);
  }

  if (APPLY) {
    const detectionRunId = randomUUID();
    const result = await createIntegrityIssues(detectionRunId, drafts, ACTOR);
    if (result.error) {
      console.error(`\nERROR persisting issues: ${result.error}`);
      process.exit(1);
    }
    log(`\nPersisted ${result.issues?.length ?? 0} data integrity issue(s) to the review queue (detection run ${detectionRunId}).`);
    log(`Review at /resident-data-integrity.`);
  } else {
    log(`\nDry run only — nothing was written. Re-run with --apply to populate the review queue.`);
  }
}

main().catch((err) => {
  console.error("Detection failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

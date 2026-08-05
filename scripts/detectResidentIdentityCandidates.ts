// Resident Identity Resolution — candidate detection CLI.
//
// Deterministic (never AI-fabricated) duplicate-identity detection across
// the live resident population. Detection is automatic; nothing here
// merges anything — see supabase/migrations/
// 20260805000000_create_resident_identity_resolution.sql,
// supabase/migrations/20260806000000_create_resident_household_detection.sql,
// and lib/residents/identity/ for the full engine and its governing rules.
// Consolidation/merge review happens afterward, through /resident-identities.
//
// Phase 2: every pass produces two SEPARATE outputs — identity candidates
// (evidence answers "is this the same human?") and household links
// (evidence answers "do these residents likely share a household?"). A
// pair with household evidence and zero identity evidence never becomes an
// identity candidate; it becomes a household link instead.
//
// Dry run (default — computes and prints, writes nothing):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/detectResidentIdentityCandidates.ts
// Apply (persists candidates + household links into their respective tables):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/detectResidentIdentityCandidates.ts --apply
// One-time Phase 1 -> Phase 2 migration. For every open/investigating
// Phase 1 candidate, evidence is RE-DERIVED FRESH with the current engine
// (never trusted from the stored blob — Phase 1 sometimes opened a
// candidate via a coincidental household signal alone, e.g. "Marilyn Born"
// / "Marilyn Holstein Born" was only linked via a shared phone number
// before the compound_name_variant signal existed; re-deriving catches
// that it's a genuine identity match under Phase 2, not household-only):
//   - Fresh identity evidence non-empty -> the candidate stays OPEN, with
//     its evidence/household_context refreshed to the current split shape.
//   - Fresh identity evidence empty -> the candidate is dismissed and a
//     household link is created from the fresh household evidence instead,
//     so the original observation is preserved, not discarded.
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/detectResidentIdentityCandidates.ts --migrate-phase1
import { randomUUID } from "node:crypto";
import {
  createHouseholdLinks,
  createIdentityCandidates,
  dismissIdentityCandidate,
  loadAbsentResidentIds,
  loadConfirmedAliases,
  loadOpenCandidatesForMigration,
  loadRecentlyCreatedResidentIds,
  loadResidentsForIdentityDetection,
  loadSuppressedPairs,
  updateIdentityCandidateEvidence,
} from "../lib/data/residentIdentity.ts";
import { loadOpenSameImportDuplicatePairs } from "../lib/data/residentDataIntegrity.ts";
import { buildIntegrityClaimedPairs } from "../lib/residents/dataIntegrity/precedence.ts";
import { assignConfidenceBand } from "../lib/residents/identity/confidenceBands.ts";
import { buildSuppressionSet, detectIdentityCandidates, MATCHING_RULE_VERSION } from "../lib/residents/identity/candidateDetection.ts";
import { generateHouseholdSignals } from "../lib/residents/identity/householdSignals.ts";
import { generateIdentitySignals } from "../lib/residents/identity/identitySignals.ts";
import type { IdentitySignalContext } from "../lib/residents/identity/identitySignals.ts";
import { normalizeNamePart } from "../lib/residents/identity/normalization.ts";
import type { CandidateDraft, HouseholdLinkDraft, LiveResidentForIdentity } from "../lib/residents/identity/types.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const MIGRATE_PHASE1 = args.includes("--migrate-phase1");
function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}
const COMMUNITY_CODE = argValue("community-code") ?? "watermere-frisco";
const ACTOR = `Resident Identity Detection (${process.env.USER || process.env.USERNAME || "unknown operator"})`;

function log(...values: unknown[]) {
  console.log(...values);
}

function residentLabel(id: string, residentsById: Map<string, { firstName: string | null; lastName: string | null; unitNumber: string | null }>): string {
  const r = residentsById.get(id);
  if (!r) return id;
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unnamed";
  return r.unitNumber ? `${name} (Unit ${r.unitNumber})` : name;
}

async function runMigratePhase1(residentsById: Map<string, LiveResidentForIdentity>, context: IdentitySignalContext) {
  log(`\n=== Phase 1 -> Phase 2 migration ===\n`);

  const openCandidates = await loadOpenCandidatesForMigration();
  log(`${openCandidates.length} open/investigating candidate(s) on record. Re-deriving fresh Phase 2 evidence for each (never trusting the stored blob)...`);

  const toUpgrade: { candidateId: string; residentIds: readonly [string, string]; confidenceBand: string; evidence: unknown; householdContext: unknown }[] = [];
  const toReclassify: (HouseholdLinkDraft & { originalCandidateId: string })[] = [];
  const noEvidenceEitherDomain: string[] = [];
  const skipped: string[] = [];

  for (const candidate of openCandidates) {
    const [idA, idB] = candidate.memberResidentIds;
    const a = idA ? residentsById.get(idA) : undefined;
    const b = idB ? residentsById.get(idB) : undefined;
    if (!a || !b) {
      skipped.push(candidate.id);
      continue;
    }

    const freshIdentity = generateIdentitySignals(a, b, context);
    const freshHousehold = generateHouseholdSignals(a, b);

    if (freshIdentity.length > 0) {
      const confidenceBand = assignConfidenceBand(freshIdentity, freshHousehold);
      // Non-null: freshIdentity is non-empty, so assignConfidenceBand always
      // returns a real band (see confidenceBands.ts — null only when
      // identity evidence is empty).
      toUpgrade.push({ candidateId: candidate.id, residentIds: [a.id, b.id], confidenceBand: confidenceBand as string, evidence: freshIdentity, householdContext: freshHousehold });
      continue;
    }

    if (freshHousehold.length === 0) {
      noEvidenceEitherDomain.push(candidate.id);
      continue;
    }

    const lastA = normalizeNamePart(a.lastName);
    const lastB = normalizeNamePart(b.lastName);
    const sameLastName = lastA !== "" && lastA === lastB;
    toReclassify.push({
      originalCandidateId: candidate.id,
      residentIds: [a.id, b.id],
      relationshipHint: sameLastName ? "likely_spouse" : "shared_household",
      evidence: freshHousehold,
      matchingRuleVersion: MATCHING_RULE_VERSION,
    });
  }

  if (skipped.length > 0) {
    log(`Skipped ${skipped.length} candidate(s) whose member residents could no longer both be loaded: ${skipped.join(", ")}`);
  }

  log(`  ${toUpgrade.length} have genuine Phase 2 identity evidence -> stay OPEN, evidence refreshed to the current split shape.`);
  log(`  ${toReclassify.length} have zero identity evidence but real household evidence -> dismissed, reclassified as a household link.`);
  if (noEvidenceEitherDomain.length > 0) {
    log(`  ${noEvidenceEitherDomain.length} have NEITHER fresh identity NOR fresh household evidence (e.g. Phase 1's old same_email signal, dropped in Phase 2) -> dismissed, no household link created: ${noEvidenceEitherDomain.join(", ")}`);
  }

  if (toUpgrade.length === 0 && toReclassify.length === 0 && noEvidenceEitherDomain.length === 0) {
    log(`Nothing to migrate.`);
    return;
  }

  if (!APPLY) {
    log(`\nDry run only. Re-run with --apply to perform the migration.`);
    log(`\n  UPGRADE IN PLACE (stays open, evidence refreshed):`);
    for (const u of toUpgrade) {
      log(`    [${u.confidenceBand.toUpperCase()}] ${residentLabel(u.residentIds[0], residentsById)} + ${residentLabel(u.residentIds[1], residentsById)}`);
    }
    log(`\n  RECLASSIFY AS HOUSEHOLD LINK (dismissed):`);
    for (const l of toReclassify) {
      log(`    [${l.relationshipHint}] ${residentLabel(l.residentIds[0], residentsById)} + ${residentLabel(l.residentIds[1], residentsById)}`);
    }
    return;
  }

  const detectionRunId = randomUUID();

  let upgraded = 0;
  for (const u of toUpgrade) {
    const result = await updateIdentityCandidateEvidence(
      { candidateId: u.candidateId, confidenceBand: u.confidenceBand, evidence: u.evidence, householdContext: u.householdContext, matchingRuleVersion: MATCHING_RULE_VERSION },
      ACTOR,
    );
    if (result.error) {
      console.error(`  ERROR refreshing candidate ${u.candidateId}: ${result.error}`);
      continue;
    }
    upgraded++;
  }
  log(`Refreshed ${upgraded}/${toUpgrade.length} candidate(s) in place.`);

  const linkResult = await createHouseholdLinks(
    detectionRunId,
    toReclassify.map((l) => ({ residentIds: l.residentIds, relationshipHint: l.relationshipHint, evidence: l.evidence, matchingRuleVersion: l.matchingRuleVersion })),
    ACTOR,
  );
  if (linkResult.error) {
    console.error(`\nERROR creating household links: ${linkResult.error}`);
    process.exit(1);
  }
  log(`Created ${linkResult.links?.length ?? 0} household link(s) (detection run ${detectionRunId}).`);

  let dismissed = 0;
  for (const l of toReclassify) {
    const result = await dismissIdentityCandidate(
      l.originalCandidateId,
      ACTOR,
      "Reclassified under the Phase 2 evidence model — household-only evidence, not identity evidence. See resident_household_links for the preserved observation.",
    );
    if (result.error) {
      console.error(`  ERROR dismissing candidate ${l.originalCandidateId}: ${result.error}`);
      continue;
    }
    dismissed++;
  }
  for (const candidateId of noEvidenceEitherDomain) {
    const result = await dismissIdentityCandidate(
      candidateId,
      ACTOR,
      "Reclassified under the Phase 2 evidence model — no identity or household evidence survives re-derivation with the current engine (e.g. the old same_email-only signal is no longer tracked in either domain).",
    );
    if (result.error) {
      console.error(`  ERROR dismissing candidate ${candidateId}: ${result.error}`);
      continue;
    }
    dismissed++;
  }
  log(`Dismissed ${dismissed}/${toReclassify.length + noEvidenceEitherDomain.length} Phase 1 candidate(s).`);
}

async function main() {
  log(`\n=== Resident Identity Candidate Detection ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);

  const residents = await loadResidentsForIdentityDetection(COMMUNITY_CODE);
  log(`Loaded ${residents.length} live resident(s) for community "${COMMUNITY_CODE}".`);
  const residentsById = new Map(residents.map((r) => [r.id, r]));

  const [confirmedAliases, suppressedPairs, absentResidentIds, recentlyCreatedResidentIds, integrityClaimedPairList] = await Promise.all([
    loadConfirmedAliases(),
    loadSuppressedPairs(),
    loadAbsentResidentIds(),
    loadRecentlyCreatedResidentIds(30),
    loadOpenSameImportDuplicatePairs(),
  ]);
  log(`${confirmedAliases.length} confirmed alias(es), ${suppressedPairs.length} suppressed pair(s) on record.`);
  if (integrityClaimedPairList.length > 0) {
    log(`${integrityClaimedPairList.length} pair(s) already claimed by an open Resident Data Integrity issue — excluded from identity/household detection.`);
  }

  if (MIGRATE_PHASE1) {
    await runMigratePhase1(residentsById, { confirmedAliases, absentResidentIds, recentlyCreatedResidentIds });
    return;
  }

  const { identityCandidates, householdLinks } = detectIdentityCandidates({
    residents,
    context: { confirmedAliases, absentResidentIds, recentlyCreatedResidentIds },
    suppressedPairs: buildSuppressionSet(suppressedPairs),
    integrityClaimedPairs: buildIntegrityClaimedPairs(integrityClaimedPairList),
  });

  const counts = { high: 0, probable: 0, needs_investigation: 0 };
  for (const d of identityCandidates) counts[d.confidenceBand]++;

  log(`\nSUMMARY`);
  log(`  Total identity candidate groups: ${identityCandidates.length}`);
  log(`  High confidence: ${counts.high}`);
  log(`  Probable: ${counts.probable}`);
  log(`  Needs investigation: ${counts.needs_investigation}`);
  log(`  Household links (separate from identity candidates): ${householdLinks.length}`);
  const likelySpouse = householdLinks.filter((l) => l.relationshipHint === "likely_spouse").length;
  log(`    Likely spouse (same last name): ${likelySpouse}`);
  log(`    Shared household (different last name): ${householdLinks.length - likelySpouse}`);

  if (identityCandidates.length > 0) {
    log(`\nIDENTITY CANDIDATES`);
    for (const d of identityCandidates) {
      const names = d.residentIds.map((id) => residentLabel(id, residentsById)).join(" vs. ");
      log(`  [${d.confidenceBand.toUpperCase()}] ${names}`);
      for (const e of d.evidence) {
        log(`    - (${e.strength}) ${e.description}`);
      }
      for (const h of d.householdContext) {
        log(`    - (household context) ${h.description}`);
      }
    }
  }

  if (householdLinks.length > 0) {
    log(`\nHOUSEHOLD LINKS`);
    for (const l of householdLinks) {
      const names = l.residentIds.map((id) => residentLabel(id, residentsById)).join(" + ");
      log(`  [${l.relationshipHint}] ${names}`);
      for (const e of l.evidence) {
        log(`    - ${e.description}`);
      }
    }
  }

  if (APPLY) {
    const detectionRunId = randomUUID();
    const candidateResult = await createIdentityCandidates(
      detectionRunId,
      identityCandidates.map((d: CandidateDraft) => ({
        residentIds: d.residentIds,
        confidenceBand: d.confidenceBand,
        evidence: d.evidence,
        householdContext: d.householdContext,
        matchingRuleVersion: d.matchingRuleVersion,
      })),
      ACTOR,
    );
    if (candidateResult.error) {
      console.error(`\nERROR persisting candidates: ${candidateResult.error}`);
      process.exit(1);
    }
    log(`\nPersisted ${candidateResult.candidates?.length ?? 0} identity candidate(s) to the review queue (detection run ${detectionRunId}).`);

    const linkResult = await createHouseholdLinks(
      detectionRunId,
      householdLinks.map((l) => ({ residentIds: l.residentIds, relationshipHint: l.relationshipHint, evidence: l.evidence, matchingRuleVersion: l.matchingRuleVersion })),
      ACTOR,
    );
    if (linkResult.error) {
      console.error(`\nERROR persisting household links: ${linkResult.error}`);
      process.exit(1);
    }
    log(`Persisted ${linkResult.links?.length ?? 0} household link(s) (detection run ${detectionRunId}).`);
    log(`Review at /resident-identities.`);
  } else {
    log(`\nDry run only — nothing was written. Re-run with --apply to populate the review queue and household links.`);
  }
}

main().catch((err) => {
  console.error("Detection failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

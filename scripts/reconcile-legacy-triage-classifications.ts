// One-time, idempotent reconciliation for the residents affected by the
// EP_CLIENT_TRIAGE_CLASSIFIED canonical-source gap (Priority 1
// investigation, 2026-09-17/18): a resident whose triage classification
// came in purely through AxisCare sync, before the forward-sync repair in
// lib/integrations/axiscare/clientCanonicalApply.ts existed, could carry
// verified legacy person_evidence with zero governed
// resident_triage_classifications rows -- so evaluateTriageClassification()
// read "missing" while the evidence panel simultaneously showed "verified".
//
// This script calls the EXACT SAME initializeMissingTriageClassificationFromAxisCare()
// the forward sync now calls automatically -- never a bespoke one-off write
// path -- restricted to an explicit, reviewed allowlist of residents.
//
// SAFETY:
//   - Defaults to --dry-run (zero writes). Pass --apply to write.
//   - Refuses to run against anything but exactly the 7 reviewed residents
//     below -- by id AND by an exact-name cross-check, so a wrong id pasted
//     into RECONCILIATION_TARGETS fails loudly instead of silently writing
//     to the wrong resident.
//   - Skips (does not fail) any target that already has a CURRENT governed
//     classification by the time this runs -- proves this script is safe
//     to re-run and never overwrites Serve ownership established another
//     way (e.g. a manual correction) since the diagnostic was captured.
//   - Adds zero new decision logic -- every ownership/recognition rule
//     lives entirely in initializeMissingTriageClassificationFromAxisCare()
//     and mapAxisCareTriageDescriptionToCode(), unchanged from the forward
//     sync path.
//
// Run (dry-run, default -- no writes):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/reconcile-legacy-triage-classifications.ts
// Run (writes -- requires explicit production approval per the Priority 1 plan):
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/reconcile-legacy-triage-classifications.ts --apply
import { createServerClient } from "../lib/supabase/server.ts";
import { getRequirementByCode } from "../lib/data/personRequirements.ts";
import { getAxisCareClientCanonicalSnapshot } from "../lib/data/axiscareClientCanonicalSnapshot.ts";
import { getCurrentResidentTriageClassification } from "../lib/data/residentTriageClassifications.ts";
import { initializeMissingTriageClassificationFromAxisCare } from "../lib/integrations/axiscare/clientCanonicalApply.ts";
import { EP_CLIENT_TRIAGE_CLASSIFIED } from "../lib/clientReadiness/constants.ts";

const ACTOR = "system:triage-canonical-source-reconciliation-2026-09-18";

// Filled in from the production diagnostic query's own `resident_id` /
// `axiscare_client_id_on_evidence` columns (see the Priority 1 triage
// canonical-source-repair investigation). REPLACE every placeholder below
// with the real value before running this script AT ALL, including
// --dry-run -- the script refuses to start otherwise (see the guard below).
// exactName is a cross-check against the resolved resident row, never a
// lookup key: a mismatch fails that one target loudly instead of writing
// to a wrongly-pasted id.
interface ReconciliationTarget {
  residentId: string;
  axiscareClientId: string;
  exactName: string;
}

const RECONCILIATION_TARGETS: ReconciliationTarget[] = [
  { residentId: "5d1f5ef8-bc70-4a10-88e2-cb5c605b13e4", axiscareClientId: "29", exactName: "Brenda Fritchen" },
  { residentId: "3d2253e6-a972-4aa2-9e3d-fc54316e7702", axiscareClientId: "12", exactName: "Doris Kakazu" },
  { residentId: "7af9ec57-50bb-4401-9448-90d522010eb9", axiscareClientId: "16", exactName: "John McKey" },
  { residentId: "34511bb2-942b-4de3-8158-81dc96ffb38f", axiscareClientId: "13", exactName: "Kathryn Morshed" },
  { residentId: "881f1b14-0b24-43f9-9b00-e0a90e3aa099", axiscareClientId: "7", exactName: "Linda Kaplan" },
  { residentId: "57d18be3-e998-4e3b-8daa-ec05e0c8ab8d", axiscareClientId: "11", exactName: "Michele Helsley" },
  { residentId: "fd05bd39-848b-43a6-b871-587daafdaca0", axiscareClientId: "39", exactName: "Willie Pat Walsh" },
];

function resolveResidentName(resident: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  full_name: string | null;
}): string {
  return resident.full_name || resident.display_name || [resident.first_name, resident.last_name].filter(Boolean).join(" ");
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  console.log(dryRun ? "=== DRY RUN (no writes) ===" : "=== LIVE RUN (writes enabled) ===");

  if (RECONCILIATION_TARGETS.some((t) => t.residentId.startsWith("REPLACE_") || t.axiscareClientId.startsWith("REPLACE_"))) {
    console.error(
      "RECONCILIATION_TARGETS still contains placeholder ids -- fill in the real resident_id/axiscare_client_id values " +
        "from the diagnostic query before running this script at all, including --dry-run."
    );
    process.exit(1);
  }
  if (RECONCILIATION_TARGETS.length !== 7) {
    console.error(`Expected exactly 7 reconciliation targets, found ${RECONCILIATION_TARGETS.length}. Refusing to run.`);
    process.exit(1);
  }

  const requirement = await getRequirementByCode(EP_CLIENT_TRIAGE_CLASSIFIED);
  if (!requirement) {
    console.error("EP_CLIENT_TRIAGE_CLASSIFIED requirement not found -- is the CLIENT_RECORD_READINESS set seeded?");
    process.exit(1);
  }

  const supabase = createServerClient();
  let failures = 0;

  for (const target of RECONCILIATION_TARGETS) {
    const { data: resident, error: residentError } = await supabase
      .from("residents")
      .select("id, first_name, last_name, display_name, full_name")
      .eq("id", target.residentId)
      .maybeSingle();

    if (residentError || !resident) {
      console.error(`FAIL - ${target.exactName} (${target.residentId}): resident not found (${residentError?.message ?? "no row"})`);
      failures += 1;
      continue;
    }

    const resolvedName = resolveResidentName(resident as Parameters<typeof resolveResidentName>[0]);
    if (resolvedName !== target.exactName) {
      console.error(
        `FAIL - resident ${target.residentId} name mismatch: expected "${target.exactName}", found "${resolvedName}". Refusing to touch this row.`
      );
      failures += 1;
      continue;
    }

    const alreadyCurrent = await getCurrentResidentTriageClassification(target.residentId);
    if (alreadyCurrent) {
      console.log(
        `SKIP - ${target.exactName}: already has a current governed classification (${alreadyCurrent.levelCode}) -- no longer affected, nothing to do.`
      );
      continue;
    }

    const snapshot = await getAxisCareClientCanonicalSnapshot(target.axiscareClientId);
    if (!snapshot) {
      console.error(`FAIL - ${target.exactName}: no axiscare_client_canonical_snapshot row for AxisCare client ${target.axiscareClientId}.`);
      failures += 1;
      continue;
    }

    console.log(
      `${dryRun ? "WOULD INITIALIZE" : "INITIALIZING"} - ${target.exactName} (resident ${target.residentId}, AxisCare ${target.axiscareClientId}): "${snapshot.triage_level_description}"`
    );

    if (dryRun) continue;

    const result = await initializeMissingTriageClassificationFromAxisCare({
      residentId: target.residentId,
      axiscareClientId: target.axiscareClientId,
      triageRequirementId: requirement.id,
      triageLevelDescription: snapshot.triage_level_description,
      fetchedAt: snapshot.fetched_at,
      actor: ACTOR,
    });

    if (result.status !== "initialized") {
      console.error(`FAIL - ${target.exactName}: ${result.status}${result.error ? ` -- ${result.error}` : ""}`);
      failures += 1;
      continue;
    }
    console.log(`OK - ${target.exactName}: initialized as ${result.levelCode}`);
  }

  console.log(`\n${dryRun ? "Dry run" : "Run"} complete -- ${failures} failure(s).`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

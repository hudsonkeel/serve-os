// Viventium Employee Collector — the first PERSISTING production Viventium
// collector. See docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md and
// the approved "Alma longitudinal example" implementation plan.
//
// IMPORTANT — selector provenance: the field selectors in
// lib/recruiting/extractors/viventium/employeeFields.ts are PROVISIONAL.
// They were built from a semantic field description, not the real
// reconnaissance JSON (unlike Apploi's selectors, which came from real
// structural data). Every extraction here fails safely to not_visible/
// unknown/ambiguous — never a fabricated value — so a wrong guess simply
// means nothing was collected this run, not that wrong data was collected.
// Correct these selectors against real output after this first run.
//
// Same safety model as every collector this project has built: attaches
// via CDP only, never launches, never logs in, never performs MFA, never
// clicks anything, never writes to Viventium. Collects ONLY the minimum
// observation set approved for this phase — explicitly does NOT collect
// birth date, gender, address, emergency contacts, previous employers,
// education, tax information, banking information, or any other HR detail
// beyond what's wired to a Desired State/Capability/Gap/Recommendation.
//
// Usage:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/collectors/viventiumEmployeeCollector.ts --recruiting-lead-id=<uuid> [--cdp-endpoint=http://localhost:9222]
import { createInterface } from "node:readline/promises";

import { getRecruitingLeadById } from "../../lib/data/recruitingLeads.ts";
import { verifyRequiredSchema } from "../../lib/data/recruitingLeadSchemaCheck.ts";
import {
  createCollectorRun,
  completeCollectorRun,
  insertObservations,
  getObservationsForLead,
  type ObservationInput,
} from "../../lib/data/recruitingLeadCollector.ts";
import { getInferencesForLead, getHumanConfirmationsForLead, getVendorIdentitiesForLead } from "../../lib/data/recruitingLeadEvidence.ts";
import { createWorkforceMember, getWorkforceMemberByRecruitingLeadId } from "../../lib/data/workforceMembers.ts";
import { persistDesiredStateEvaluations } from "../../lib/data/recruitingLeadOperationalUnderstanding.ts";
import { evaluateRecruitingLeadRules } from "../../lib/recruiting/rules/evaluateRecruitingLeadRules.ts";
import { generateFlightMarker } from "../../lib/recruiting/flightMarker.ts";
import { planStateObservationWrites } from "../../lib/recruiting/observationIdempotency.ts";
import { evaluateRecruitingLifecycle } from "../../lib/recruiting/operationalUnderstanding/evaluateRecruitingLifecycle.ts";
import { generateRecommendations, selectNextRecommendedAction } from "../../lib/recruiting/operationalUnderstanding/generateRecommendations.ts";
import { generateOperationalBrief } from "../../lib/recruiting/operationalUnderstanding/generateOperationalBrief.ts";
import { evaluateWorkforceCapabilities } from "../../lib/recruiting/operationalUnderstanding/capabilities.ts";
import { listOpenTabs, getPageByIndex, verifyOrigin, namesMatch } from "../../lib/recruiting/extractors/apploi/cdpAttach.ts";
import { extractField } from "../../lib/recruiting/extractors/apploi/extraction.ts";
import { parseViventiumEmployeeUrl } from "../../lib/recruiting/extractors/viventium/employeeUrl.ts";
import {
  EMPLOYEE_NAME_FIELD,
  I9_STATUS_FIELD,
  VIVENTIUM_COLLECTOR_EXTRACTOR_VERSION,
  evaluateEmployeeRecordExists,
  finalizeI9Status,
} from "../../lib/recruiting/extractors/viventium/employeeFields.ts";
import type { RawObservation } from "../../lib/collectors/types.ts";
import type { ObservationVisibility } from "../../lib/supabase/types.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}
async function confirm(prompt: string): Promise<boolean> {
  return (await ask(`${prompt} [y/N] `)).toLowerCase() === "y";
}

const INITIATED_BY = process.env.USER || process.env.USERNAME || "Viventium Employee Collector operator";

function parseArgs(): { recruitingLeadId?: string; cdpEndpoint: string } {
  const args = process.argv.slice(2);
  const idArg = args.find((a) => a.startsWith("--recruiting-lead-id="));
  const endpointArg = args.find((a) => a.startsWith("--cdp-endpoint="));
  return {
    recruitingLeadId: idArg?.slice("--recruiting-lead-id=".length),
    cdpEndpoint: endpointArg?.slice("--cdp-endpoint=".length) ?? "http://localhost:9222",
  };
}

function outcomeToVisibility(outcome: RawObservation["outcome"]): ObservationVisibility {
  switch (outcome) {
    case "observed":
      return "directly_observed";
    case "unknown":
      return "unknown";
    case "ambiguous":
      return "ambiguous";
    case "not_visible":
      return "not_visible";
  }
}

// `employeeUuid` here is always the value validated by
// parseViventiumEmployeeUrl — never a division uuid, a recruiting-lead
// uuid, or a workforce-member uuid. Every observation this collector
// produces is scoped to exactly this identifier.
function toObservationInput(raw: RawObservation, employeeUuid: string | null): ObservationInput {
  return {
    observationKey: raw.observationKey,
    rawLabel: raw.rawLabel,
    normalizedValue: raw.normalizedValue,
    visibility: outcomeToVisibility(raw.outcome),
    observedAt: raw.observedAt,
    sourceSystem: "viventium",
    sourceRecordId: employeeUuid,
    collectedAt: new Date().toISOString(),
    sourceLocation: raw.sourceLocation,
    extractorVersion: raw.extractorVersion,
    extractionConfidence: raw.extractionConfidence,
    matchMethod: raw.matchMethod,
    failureReason: raw.failureReason,
    sensitivity: raw.sensitivity,
    collectionMethod: raw.collectionMethod,
  };
}

async function main() {
  const { recruitingLeadId, cdpEndpoint } = parseArgs();
  if (!recruitingLeadId) {
    console.error("Usage: --recruiting-lead-id=<uuid> is required.");
    process.exit(1);
  }

  console.log("\n=== Viventium Employee Collector ===");
  console.log("Verifying required schema before touching anything else...");
  const schemaCheck = await verifyRequiredSchema();
  if (!schemaCheck.ok) {
    console.error(`Schema verification failed: ${schemaCheck.missing}`);
    console.error("Aborting — no collector run was created, nothing was written.");
    rl.close();
    process.exit(1);
  }
  console.log("Schema verification passed.");

  const lead = await getRecruitingLeadById(recruitingLeadId);
  if (!lead) {
    console.error("No matching recruiting lead found. Aborting — nothing was attached to.");
    rl.close();
    process.exit(1);
  }
  // Explicit throughout this script: recruitingLeadUuid (Serve's recruiting
  // identity), employeeUuid (Viventium's employee identity, parsed below),
  // divisionUuid (Viventium's division identity, informational only), and
  // workforceMember.id (Serve's durable workforce identity) are four
  // genuinely distinct identifiers — never interchanged.
  const recruitingLeadUuid = lead.id;
  console.log(`Approved lead — Recruiting Lead UUID: ${recruitingLeadUuid} (${[lead.first_name, lead.last_name].filter(Boolean).join(" ")})`);

  console.log(`Attaching to ${cdpEndpoint} — this does NOT launch a browser.`);
  const { browser, tabs } = await listOpenTabs(cdpEndpoint);
  if (tabs.length === 0) {
    console.error("No open tabs found at that CDP endpoint. Aborting.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  console.log("\nOpen tabs:");
  for (const t of tabs) console.log(`  [${t.index}] ${t.title} — ${t.url}`);

  const chosenIndexRaw = await ask("\nWhich numbered tab is the approved Viventium employee record? ");
  const chosenTab = tabs.find((t) => t.index === Number.parseInt(chosenIndexRaw, 10));
  if (!chosenTab) {
    console.error("No tab matched that number. Aborting — nothing was inspected.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  const approvedOrigin = process.env.NEXT_PUBLIC_VIVENTIUM_URL;
  const originVerified = Boolean(approvedOrigin && verifyOrigin(chosenTab.url, approvedOrigin));
  if (!originVerified) {
    console.error("Tab origin does not match the approved Viventium origin. Aborting — nothing was inspected.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Step: parse the URL structurally (never positionally — see
  // employeeUrl.ts's module comment for why). Hard stop, before touching
  // any page content at all, if the URL doesn't unambiguously identify one
  // individual HR employee record.
  const urlParseResult = parseViventiumEmployeeUrl(chosenTab.url);
  if (!urlParseResult.valid || !urlParseResult.employeeUuid) {
    console.error(`\nURL Pattern: Invalid`);
    console.error(`Reason: ${urlParseResult.rejectionReason}`);
    console.error("Aborting — no identity was established, no evidence was collected, nothing was written.");
    await browser.close();
    rl.close();
    process.exit(1);
  }
  const employeeUuid = urlParseResult.employeeUuid; // canonical — never confused with divisionUuid below
  const divisionUuid = urlParseResult.divisionUuid; // informational only, never persisted as evidence

  const page = getPageByIndex(browser, chosenTab.index);
  const observedAt = new Date().toISOString();

  // Best-effort, provisional auto-read — shown as a HINT only. It is never
  // trusted as the authoritative name; the operator's own transcription
  // (below) is what actually gets checked and persisted. See the
  // collector-review notes in this script's header for why.
  const autoReadNameResult = await extractField(page, EMPLOYEE_NAME_FIELD, VIVENTIUM_COLLECTOR_EXTRACTOR_VERSION, observedAt);
  const autoReadName = autoReadNameResult.outcome === "observed" ? autoReadNameResult.normalizedValue : null;

  // Validation display — required before any confirmation prompt.
  console.log("\n=== URL Validation ===");
  console.log(`Employee UUID:\n  ${employeeUuid}`);
  console.log(`Employee Name (auto-read hint, NOT yet trusted):\n  ${autoReadName ?? "(could not be read automatically)"}`);
  console.log(`Profile Type:\n  HR Employee Record`);
  console.log(`URL Pattern:\n  Valid`);
  if (divisionUuid) console.log(`Division UUID (context only, never used as an identity):\n  ${divisionUuid}`);

  const singleRecordConfirmed = await confirm(
    "\nConfirm this tab shows ONE individual employee record — not a list, search-results, or dashboard view"
  );
  if (!singleRecordConfirmed) {
    console.error("Not confirmed as a single-record view. Aborting — nothing was written, to avoid capturing unrelated employee records.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Identity confirmation is always grounded in what the OPERATOR types,
  // never in the auto-read hint above — the auto-read selector is
  // unverified against real Viventium DOM structure and must never become
  // the authoritative source for evidence establishing canonical identity.
  const typedName = await ask(
    `\nType the exact name shown on screen (to check against "${[lead.first_name, lead.last_name].filter(Boolean).join(" ")}"): `
  );
  if (!namesMatch(typedName, lead.first_name ?? "", lead.last_name ?? "")) {
    console.log(`  Note: this does not automatically match the approved lead's name on file. Review carefully before confirming.`);
  }
  const identityConfirmed = await confirm(`Confirm "${typedName}" is the approved candidate/employee?`);

  if (!identityConfirmed) {
    console.error("Candidate/employee identity not confirmed. Aborting — nothing was written.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Workforce identity — created only via explicit confirmation, never
  // silently inferred from vendor evidence arriving. See
  // docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md Part 1.
  let workforceMember = await getWorkforceMemberByRecruitingLeadId(recruitingLeadUuid);
  if (!workforceMember) {
    const createConfirmed = await confirm(
      "\nThis recruiting lead has no Serve workforce identity yet. Create one now (a durable identity that survives beyond recruiting)?"
    );
    if (createConfirmed) {
      const leadDisplayName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
      if (!leadDisplayName) {
        console.error("Recruiting lead has no name on file — cannot create a workforce profile without a human-readable name. Continuing without one.");
      } else {
        const { member, error } = await createWorkforceMember({
          recruitingLeadId: recruitingLeadUuid,
          createdBy: INITIATED_BY,
          displayName: leadDisplayName,
          legalFirstName: lead.first_name ?? null,
          legalLastName: lead.last_name ?? null,
        });
        if (error || !member) {
          console.error(`Could not create workforce member: ${error}. Continuing without one — observations will still be recorded against the recruiting lead.`);
        } else {
          workforceMember = member;
          console.log(`Workforce Member UUID created: ${member.id}`);
        }
      }
    } else {
      console.log("Continuing without a workforce identity — observations will still be recorded against the recruiting lead.");
    }
  } else {
    console.log(`Existing Workforce Member UUID found: ${workforceMember.id}`);
  }

  // Extract only the approved production observations.
  const rawObservations: RawObservation[] = [];

  rawObservations.push(
    evaluateEmployeeRecordExists(
      { employeeUuid, originVerified, singleRecordConfirmed, identityConfirmed },
      VIVENTIUM_COLLECTOR_EXTRACTOR_VERSION,
      observedAt
    )
  );
  // Persisted as guided_manual, sourced from the operator's own
  // transcription (typedName) — never from the unverified auto-read
  // selector, which was shown only as a hint above.
  rawObservations.push({
    observationKey: "viventium.employee_name",
    outcome: "observed",
    rawLabel: typedName,
    normalizedValue: typedName,
    sourceLocation: "operator transcription of the on-screen employee name",
    extractorVersion: VIVENTIUM_COLLECTOR_EXTRACTOR_VERSION,
    extractionConfidence: "high",
    matchMethod: "manual",
    failureReason: null,
    sensitivity: "standard",
    collectionMethod: "guided_manual",
    observedAt,
  });
  rawObservations.push(
    finalizeI9Status(await extractField(page, I9_STATUS_FIELD, VIVENTIUM_COLLECTOR_EXTRACTOR_VERSION, observedAt))
  );

  console.log("\n=== Extracted (nothing persisted yet) ===");
  for (const o of rawObservations) {
    console.log(`  ${o.observationKey}: ${o.outcome === "observed" ? o.normalizedValue : `(${o.outcome}${o.failureReason ? `: ${o.failureReason}` : ""})`}`);
  }

  const candidates = rawObservations.map((o) => toObservationInput(o, employeeUuid));

  // Persist — idempotent: an unchanged value is not re-recorded; a
  // changed value (e.g. I-9 moving from Not Verified to Verified) inserts
  // a new row, preserving history, per the approved "trust the newest
  // authoritative vendor evidence" rule. Hud's verbal statement that
  // verification was completed is NEVER itself evidence — only what this
  // collector actually observes on the next run counts.
  const existingObservations = await getObservationsForLead(recruitingLeadUuid);
  const plan = planStateObservationWrites(existingObservations, candidates);

  const flightMarker = generateFlightMarker(`viventium-employee-collector-${recruitingLeadUuid}`);
  const { run, error: createRunError } = await createCollectorRun({
    recruitingLeadId: recruitingLeadUuid,
    sourceSystem: "viventium",
    initiatedBy: INITIATED_BY,
    flightMarker,
  });
  if (createRunError || !run) {
    console.error(`Could not create collector run: ${createRunError}. Aborting — no observations were written.`);
    await browser.close();
    rl.close();
    process.exit(1);
  }

  if (plan.toInsert.length > 0) {
    const { error: insertError } = await insertObservations({
      collectorRunId: run.id,
      recruitingLeadId: recruitingLeadUuid,
      observations: plan.toInsert,
    });
    if (insertError) {
      await completeCollectorRun({ collectorRunId: run.id, status: "failed", matchStatus: "found", errorCategory: "persist_failed" });
      console.error(`Could not persist observations: ${insertError}`);
      await browser.close();
      rl.close();
      process.exit(1);
    }
  }

  await completeCollectorRun({ collectorRunId: run.id, status: "success", matchStatus: "found" });

  console.log(`\nPersisted ${plan.toInsert.length} new observation(s).`);
  if (plan.skippedUnchanged.length > 0) {
    console.log(`Unchanged, not re-recorded: ${plan.skippedUnchanged.join(", ")}`);
  }

  // Recompute everything: rules, desired states, capabilities,
  // recommendations, and the Operational Brief — over every observation
  // on record for this lead, not just this run's.
  const allObservations = await getObservationsForLead(recruitingLeadUuid);
  const { signalsProduced, errors: ruleErrors } = await evaluateRecruitingLeadRules(recruitingLeadUuid, allObservations);
  console.log(`Rule evaluation: ${signalsProduced} inference(s) produced.`);
  for (const err of ruleErrors) console.error(`  Rule evaluation error: ${err}`);

  const [allInferences, allHumanConfirmations, allVendorIdentities] = await Promise.all([
    getInferencesForLead(recruitingLeadUuid),
    getHumanConfirmationsForLead(recruitingLeadUuid),
    getVendorIdentitiesForLead(recruitingLeadUuid),
  ]);
  const lifecycleResults = evaluateRecruitingLifecycle({
    observations: allObservations,
    inferences: allInferences,
    humanConfirmations: allHumanConfirmations,
    vendorIdentities: allVendorIdentities,
  });
  const { evaluationsPersisted, errors: evaluationErrors } = await persistDesiredStateEvaluations(recruitingLeadUuid, lifecycleResults);
  console.log(`Operational Understanding: ${evaluationsPersisted} desired-state evaluation(s) persisted.`);
  for (const err of evaluationErrors) console.error(`  Desired-state evaluation error: ${err}`);

  const capabilities = evaluateWorkforceCapabilities(lifecycleResults);
  const recommendations = generateRecommendations(lifecycleResults);
  const nextAction = selectNextRecommendedAction(recommendations);
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "This candidate";
  const brief = generateOperationalBrief(lifecycleResults, leadName, capabilities);

  console.log(`\n=== Operational Brief preview ===`);
  console.log(`Current Understanding: ${brief.currentUnderstanding}`);
  if (brief.currentCapability) console.log(`Current Capability: ${brief.currentCapability}`);
  console.log(`Next Action: ${brief.nextAction ?? nextAction ?? "(none)"}`);
  for (const w of brief.whyThisMatters) console.log(`  Why: ${w}`);
  for (const u of brief.uncertainty) console.log(`  Uncertainty: ${u}`);

  console.log(`\nFlight marker: ${flightMarker}`);
  console.log(`View the result at /recruiting/${recruitingLeadUuid}`);

  await browser.close();
  rl.close();
}

main().catch((err) => {
  console.error("Viventium Employee Collector failed:", err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});

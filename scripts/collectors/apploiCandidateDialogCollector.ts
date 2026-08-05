// Apploi Candidate Dialog Collector — the first PERSISTING automatic-DOM
// collector for the recruiting evidence model. See
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md and the approved
// implementation plan (chat, this phase) for the exact 15-step flow this
// script implements.
//
// Distinct from scripts/collectors/apploiDomReconnaissance.ts (read-only,
// print-only, never persists) and scripts/collectors/recruitingLeadFlight.ts
// (the older guided-manual Q&A flow, a different observation-key
// vocabulary, unaffected by this script).
//
// Run by a human (Hud), in Hud's own terminal, against a browser Hud has
// already launched and authenticated manually. Never launches, attaches
// via CDP only, never logs in, never performs MFA, never writes to Apploi.
// The only click this script performs is the one narrowly-approved,
// allowlisted tab click (see tabNavigation.ts) — enforced by
// lib/collectors/__tests__/contractBoundaries.test.ts.
//
// Usage:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/collectors/apploiCandidateDialogCollector.ts --recruiting-lead-id=<uuid> [--cdp-endpoint=http://localhost:9222]
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
import {
  getVendorIdentitiesForLead,
  upsertVendorIdentity,
  confirmVendorIdentity,
} from "../../lib/data/recruitingLeadEvidence.ts";
import { evaluateRecruitingLeadRules } from "../../lib/recruiting/rules/evaluateRecruitingLeadRules.ts";
import { generateFlightMarker } from "../../lib/recruiting/flightMarker.ts";
import { planStateObservationWrites } from "../../lib/recruiting/observationIdempotency.ts";
import { listOpenTabs, getPageByIndex, verifyOrigin, namesMatch } from "../../lib/recruiting/extractors/apploi/cdpAttach.ts";
import { extractField } from "../../lib/recruiting/extractors/apploi/extraction.ts";
import { selectApprovedTab, tabContentAlreadyVisible } from "../../lib/recruiting/extractors/apploi/tabNavigation.ts";
import {
  parseApploiCandidateUrl,
  decideVendorIdentityAction,
  shortenVendorId,
} from "../../lib/recruiting/extractors/apploi/vendorIdentity.ts";
import {
  CANDIDATE_NAME_FIELD,
  POSITION_FIELD,
  RESUME_AVAILABILITY_FIELD,
  VIVENTIUM_INTEGRATION_STATUS_FIELD,
  VIVENTIUM_INTEGRATION_STATUS_TAB,
  DIALOG_COLLECTOR_EXTRACTOR_VERSION,
  finalizeResumeAvailability,
  finalizeViventiumIntegrationStatus,
} from "../../lib/recruiting/extractors/apploi/dialogFields.ts";
import { countApplicationSections, evaluateApplicationExists } from "../../lib/recruiting/extractors/apploi/applicationExists.ts";
import { evaluateRecruitingLifecycle } from "../../lib/recruiting/operationalUnderstanding/evaluateRecruitingLifecycle.ts";
import { persistDesiredStateEvaluations } from "../../lib/data/recruitingLeadOperationalUnderstanding.ts";
import { getHumanConfirmationsForLead, getInferencesForLead } from "../../lib/data/recruitingLeadEvidence.ts";
import type { RawObservation } from "../../lib/collectors/types.ts";
import type { ObservationVisibility } from "../../lib/supabase/types.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}
async function confirm(prompt: string): Promise<boolean> {
  return (await ask(`${prompt} [y/N] `)).toLowerCase() === "y";
}

const INITIATED_BY = process.env.USER || process.env.USERNAME || "Apploi Candidate Dialog Collector operator";

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

function toObservationInput(raw: RawObservation, candidateId: string): ObservationInput {
  return {
    observationKey: raw.observationKey,
    rawLabel: raw.rawLabel,
    normalizedValue: raw.normalizedValue,
    visibility: outcomeToVisibility(raw.outcome),
    observedAt: raw.observedAt,
    sourceSystem: "apploi",
    sourceRecordId: candidateId,
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

  // Step 1 — schema preflight. Nothing else runs until this passes.
  console.log("\n=== Apploi Candidate Dialog Collector ===");
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

  console.log(`Approved lead: ${[lead.first_name, lead.last_name].filter(Boolean).join(" ")} (${lead.id})`);

  // Step 2/3 — attach via CDP (never launches), list tabs.
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

  // Step 4 — require user selection of the approved tab.
  const chosenIndexRaw = await ask("\nWhich numbered tab is the approved candidate record? ");
  const chosenTab = tabs.find((t) => t.index === Number.parseInt(chosenIndexRaw, 10));
  if (!chosenTab) {
    console.error("No tab matched that number. Aborting — nothing was inspected.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Step 5 — verify origin.
  const approvedOrigin = process.env.NEXT_PUBLIC_APPLOI_URL;
  if (!approvedOrigin || !verifyOrigin(chosenTab.url, approvedOrigin)) {
    console.error("Tab origin does not match the approved Apploi origin. Aborting — nothing was inspected.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Step 6 — parse candidateID / applicationID from the confirmed URL.
  const { candidateId, applicationId } = parseApploiCandidateUrl(chosenTab.url);
  if (!candidateId) {
    console.error("Could not parse a candidateID from this tab's URL. Aborting — nothing was written.");
    await browser.close();
    rl.close();
    process.exit(1);
  }
  console.log(`Parsed candidateID=${shortenVendorId(candidateId)}, applicationID=${applicationId ? shortenVendorId(applicationId) : "(none)"}`);

  const page = getPageByIndex(browser, chosenTab.index);
  const dialog = page.locator('[role="dialog"]');

  // Step 7 — locate exactly one active candidate dialog.
  const dialogCount = await dialog.count();
  if (dialogCount === 0) {
    console.error('No [role="dialog"] element found on this page. Aborting — the candidate drawer may not be open.');
    await browser.close();
    rl.close();
    process.exit(1);
  }
  if (dialogCount > 1) {
    console.error(`Found ${dialogCount} elements matching [role="dialog"] — ambiguous. Aborting rather than guessing which one.`);
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Step 8 — read candidate name.
  const nameResult = await extractField(dialog, CANDIDATE_NAME_FIELD, DIALOG_COLLECTOR_EXTRACTOR_VERSION);
  if (nameResult.outcome !== "observed" || !nameResult.normalizedValue) {
    console.error(`Could not read a candidate name from the dialog (${nameResult.outcome}: ${nameResult.failureReason}). Aborting — identity cannot be confirmed.`);
    await browser.close();
    rl.close();
    process.exit(1);
  }
  const observedName = nameResult.normalizedValue;
  console.log(`\nCandidate name observed on screen: "${observedName}"`);

  const approvedFirst = lead.first_name ?? "";
  const approvedLast = lead.last_name ?? "";
  if (!namesMatch(observedName, approvedFirst, approvedLast)) {
    console.log(`  Note: this does not automatically match the approved lead's name on file ("${approvedFirst} ${approvedLast}"). Review carefully before confirming.`);
  }

  // Step 9 — require explicit candidate identity confirmation. Hard stop.
  const identityConfirmed = await confirm(
    `Confirm "${observedName}" is the approved candidate (${[lead.first_name, lead.last_name].filter(Boolean).join(" ")})?`
  );
  if (!identityConfirmed) {
    console.error("Candidate identity not confirmed. Aborting — nothing was inspected further, nothing was written.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  // Step 10 — verify or establish the human-confirmed vendor identity link.
  const existingIdentities = await getVendorIdentitiesForLead(lead.id);
  const existingApploi = existingIdentities.find((v) => v.source_system === "apploi") ?? null;
  const identityDecision = decideVendorIdentityAction(candidateId, existingApploi);

  if (identityDecision.action === "hard_stop_no_candidate_id") {
    console.error("No candidateID available for vendor identity resolution. Aborting — nothing was written.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  if (identityDecision.action === "hard_stop_mismatch") {
    console.error(
      `Vendor identity mismatch: stored Apploi candidateID (${shortenVendorId(identityDecision.storedCandidateId)}) does not match the candidateID observed in this tab (${shortenVendorId(identityDecision.observedCandidateId)}). This is a hard stop — nothing was written.`
    );
    await browser.close();
    rl.close();
    process.exit(1);
  }

  if (identityDecision.action === "requires_confirmation") {
    const linkConfirmed = await confirm(
      `\nNo existing Apploi vendor identity is linked to this Serve recruiting lead. Link candidateID ${shortenVendorId(identityDecision.candidateId)} (observed name: "${observedName}") as the confirmed Apploi identity for this lead?`
    );
    if (!linkConfirmed) {
      console.error("Vendor identity link declined. Aborting — nothing was written.");
      await browser.close();
      rl.close();
      process.exit(1);
    }
    const { error: upsertError } = await upsertVendorIdentity({
      recruitingLeadId: lead.id,
      sourceSystem: "apploi",
      vendorRecordId: identityDecision.candidateId,
      vendorDisplayName: observedName,
      matchMethod: "vendor_id",
      matchConfidence: "high",
    });
    if (upsertError) {
      console.error(`Could not persist vendor identity link: ${upsertError}. Aborting.`);
      await browser.close();
      rl.close();
      process.exit(1);
    }
    const { error: confirmVendorError } = await confirmVendorIdentity({
      recruitingLeadId: lead.id,
      sourceSystem: "apploi",
      linkedBy: INITIATED_BY,
    });
    if (confirmVendorError) {
      console.error(`Could not confirm vendor identity link: ${confirmVendorError}. Aborting.`);
      await browser.close();
      rl.close();
      process.exit(1);
    }
    console.log("Vendor identity link established and confirmed.");
  } else if (identityDecision.action === "proceed_unconfirmed") {
    console.log("Note: stored Apploi identity for this lead matches but was never explicitly confirmed by a human.");
  }
  // "proceed_confirmed" — nothing further to do here.

  // Step 11 — extract only the approved production observations.
  const observedAt = new Date().toISOString();
  const rawObservations: RawObservation[] = [];

  rawObservations.push({ ...nameResult, observedAt });
  const positionResult = await extractField(dialog, POSITION_FIELD, DIALOG_COLLECTOR_EXTRACTOR_VERSION, observedAt);
  rawObservations.push(positionResult);
  rawObservations.push(
    finalizeResumeAvailability(await extractField(dialog, RESUME_AVAILABILITY_FIELD, DIALOG_COLLECTOR_EXTRACTOR_VERSION, observedAt))
  );

  // apploi.application_exists — composite, gated observation. Never
  // inferred from candidate name, vendor identity, position, resume
  // status, or general candidate existence alone (see applicationExists.ts).
  const applicationSectionCount = await countApplicationSections(dialog);
  rawObservations.push(
    evaluateApplicationExists(
      {
        applicationIdFromUrl: applicationId,
        candidateIdFromUrl: candidateId,
        confirmedCandidateId: candidateId,
        dialogCount,
        identityConfirmed,
        applicationSectionCount,
        positionObserved: positionResult.outcome === "observed",
      },
      DIALOG_COLLECTOR_EXTRACTOR_VERSION,
      observedAt
    )
  );

  const integrationsVisible = await tabContentAlreadyVisible(dialog, VIVENTIUM_INTEGRATION_STATUS_TAB);
  if (!integrationsVisible) {
    const tabResult = await selectApprovedTab(dialog, VIVENTIUM_INTEGRATION_STATUS_TAB);
    if (!tabResult.selected) {
      console.log(`  Could not select the "${VIVENTIUM_INTEGRATION_STATUS_TAB}" tab (${tabResult.reason}) — recording as not visible.`);
      rawObservations.push({
        observationKey: VIVENTIUM_INTEGRATION_STATUS_FIELD.observationKey,
        outcome: "not_visible",
        rawLabel: null,
        normalizedValue: null,
        sourceLocation: VIVENTIUM_INTEGRATION_STATUS_FIELD.sourceLocation,
        extractorVersion: DIALOG_COLLECTOR_EXTRACTOR_VERSION,
        extractionConfidence: null,
        matchMethod: null,
        failureReason: `tab_not_selectable (${tabResult.reason})`,
        sensitivity: "standard",
        collectionMethod: "automatic_dom",
        observedAt,
      });
    } else {
      rawObservations.push(
        finalizeViventiumIntegrationStatus(
          await extractField(dialog, VIVENTIUM_INTEGRATION_STATUS_FIELD, DIALOG_COLLECTOR_EXTRACTOR_VERSION, observedAt)
        )
      );
    }
  } else {
    rawObservations.push(
      finalizeViventiumIntegrationStatus(
        await extractField(dialog, VIVENTIUM_INTEGRATION_STATUS_FIELD, DIALOG_COLLECTOR_EXTRACTOR_VERSION, observedAt)
      )
    );
  }

  console.log("\n=== Extracted (nothing persisted yet) ===");
  for (const o of rawObservations) {
    console.log(`  ${o.observationKey}: ${o.outcome === "observed" ? o.normalizedValue : `(${o.outcome}${o.failureReason ? `: ${o.failureReason}` : ""})`}`);
  }

  const candidates = rawObservations.map((o) => toObservationInput(o, candidateId));

  // Step 12 — persist the collector run and observations.
  const existingObservations = await getObservationsForLead(lead.id);
  const plan = planStateObservationWrites(existingObservations, candidates);

  const flightMarker = generateFlightMarker(`apploi-dialog-collector-${lead.id}`);
  const { run, error: createRunError } = await createCollectorRun({
    recruitingLeadId: lead.id,
    sourceSystem: "apploi",
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
      recruitingLeadId: lead.id,
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
    console.log(
      `Unchanged, not re-recorded (freshness reflected by this collector run's own timestamp instead): ${plan.skippedUnchanged.join(", ")}`
    );
  }

  // Steps 13/14 — evaluate only rules whose required evidence exists, over
  // every observation on record for this lead (not just this run's).
  const allObservations = await getObservationsForLead(lead.id);
  const { signalsProduced, errors: ruleErrors } = await evaluateRecruitingLeadRules(lead.id, allObservations);
  console.log(`Rule evaluation: ${signalsProduced} inference(s) produced.`);
  for (const err of ruleErrors) console.error(`  Rule evaluation error: ${err}`);

  // Operational Understanding — deterministic Desired State evaluation over
  // every observation/inference/human-confirmation/vendor-identity on
  // record for this lead. See
  // docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md.
  const [allInferences, allHumanConfirmations, allVendorIdentities] = await Promise.all([
    getInferencesForLead(lead.id),
    getHumanConfirmationsForLead(lead.id),
    getVendorIdentitiesForLead(lead.id),
  ]);
  const lifecycleResults = evaluateRecruitingLifecycle({
    observations: allObservations,
    inferences: allInferences,
    humanConfirmations: allHumanConfirmations,
    vendorIdentities: allVendorIdentities,
  });
  const { evaluationsPersisted, errors: evaluationErrors } = await persistDesiredStateEvaluations(lead.id, lifecycleResults);
  console.log(`Operational Understanding: ${evaluationsPersisted} desired-state evaluation(s) persisted.`);
  for (const err of evaluationErrors) console.error(`  Desired-state evaluation error: ${err}`);
  for (const r of lifecycleResults) {
    console.log(`  ${r.desiredStateKey}: ${r.status}`);
  }

  // Step 15 — print the Serve recruiting-lead URL and a concise summary.
  console.log(`\nFlight marker: ${flightMarker}`);
  console.log(`View the result at /recruiting/${lead.id}`);

  await browser.close();
  rl.close();
}

main().catch((err) => {
  console.error("Apploi Candidate Dialog Collector failed:", err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});

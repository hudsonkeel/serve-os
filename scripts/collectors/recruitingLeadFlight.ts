// Recruiting Lead Flight — supervised, real-data evidence collection from
// Apploi and Viventium for ONE explicitly approved recruiting lead. See
// docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md for the full design and
// docs/architecture/VENDOR_COLLECTOR_AUTHENTICATION.md for why permanent
// credential/session storage is deliberately NOT part of this script.
//
// Run by a human (Hud), in Hud's own terminal — never invoked by this
// agent. See the plan's §11: an AI agent driving a live MFA pause is
// exactly the kind of unattended/AI-mediated login this flight prohibits.
//
// No automated browser is launched or attached anywhere in this script.
// A pristine, CDP-driven Chromium instance triggered Cloudflare's bot
// challenge on the first supervised run (fresh profile, zero history, zero
// prior clearance — exactly the signals bot detection weighs). Rather than
// attempt any workaround, browser automation was removed from this path
// entirely: you open each vendor yourself, in your own regular browser,
// logged in exactly as you always are. This script only prints the URL,
// waits for you, and continues with the same guided evidence prompts as
// before. See the "Option C" architecture decision this implements — no
// browser attachment, no CDP, no profile reuse, no stealth behavior, no
// Cloudflare workaround of any kind.
//
// Usage:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/collectors/recruitingLeadFlight.ts --recruiting-lead-id=<uuid>
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/collectors/recruitingLeadFlight.ts --email=<approved-email>
//
// What this script does NOT do, by construction — no code path exists for
// any of these:
//   - launch, attach to, or control any browser;
//   - store a username, password, MFA code, cookie, or session artifact;
//   - take a screenshot, trace, HAR, or full-page content dump;
//   - accept a file download;
//   - write anything to Apploi or Viventium;
//   - touch recruiting_leads.status;
//   - search for, or record evidence about, anyone other than the one
//     confirmed lead this run was started for.
import { createInterface } from "node:readline/promises";

import { getRecruitingLeadById, getRecruitingLeadByApprovedEmail } from "../../lib/data/recruitingLeads.ts";
import {
  createCollectorRun,
  completeCollectorRun,
  insertObservations,
  getObservationsForLead,
  type ObservationInput,
} from "../../lib/data/recruitingLeadCollector.ts";
import { evaluateRecruitingLeadRules } from "../../lib/recruiting/rules/evaluateRecruitingLeadRules.ts";
import { generateFlightMarker } from "../../lib/recruiting/flightMarker.ts";
import type { CollectorMatchStatus, CollectorSourceSystem, RecruitingLead } from "../../lib/supabase/types.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(prompt: string): Promise<string> {
  const answer = await rl.question(prompt);
  return answer.trim();
}
async function confirm(prompt: string): Promise<boolean> {
  const answer = await ask(`${prompt} [y/N] `);
  return answer.toLowerCase() === "y";
}

const INITIATED_BY = process.env.USER || process.env.USERNAME || "Recruiting Lead Flight operator";

type PendingObservation = ObservationInput;

interface VendorCollectionResult {
  matchStatus: CollectorMatchStatus;
  observations: PendingObservation[];
}

function parseArgs(): { recruitingLeadId?: string; email?: string } {
  const args = process.argv.slice(2);
  const idArg = args.find((a) => a.startsWith("--recruiting-lead-id="));
  const emailArg = args.find((a) => a.startsWith("--email="));
  return {
    recruitingLeadId: idArg?.slice("--recruiting-lead-id=".length),
    email: emailArg?.slice("--email=".length),
  };
}

async function resolveLead(): Promise<RecruitingLead> {
  const { recruitingLeadId, email } = parseArgs();

  if (!recruitingLeadId && !email) {
    console.error("Usage: --recruiting-lead-id=<uuid> OR --email=<approved-email> is required.");
    process.exit(1);
  }
  if (recruitingLeadId && email) {
    console.error("Pass exactly one of --recruiting-lead-id or --email, not both.");
    process.exit(1);
  }

  const lead = recruitingLeadId
    ? await getRecruitingLeadById(recruitingLeadId)
    : await getRecruitingLeadByApprovedEmail(email!);

  if (!lead) {
    console.error("No single matching recruiting lead was found. Aborting — nothing was searched in any vendor.");
    process.exit(1);
  }
  return lead;
}

async function pauseForVendor(vendorLabel: string, lead: RecruitingLead, url: string | undefined): Promise<void> {
  console.log(`\n=== ${vendorLabel} ===`);
  console.log(`Lead under review: ${[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "(unnamed)"} (${lead.id})`);
  if (url) {
    console.log(`1. Open this URL in your normal browser: ${url}`);
  } else {
    console.log(
      `1. Open ${vendorLabel} in your normal browser — no URL is configured (set NEXT_PUBLIC_${vendorLabel.toUpperCase()}_URL to have it printed here).`
    );
  }
  console.log("2. Log in and complete MFA normally, exactly as you always do.");
  console.log("3. Do not type any password or MFA code into this terminal — nothing here ever asks for one.");
  await ask("4. Press Enter here once you are logged in and ready to search. ");
}

async function collectApploi(lead: RecruitingLead): Promise<VendorCollectionResult | null> {
  await pauseForVendor("Apploi", lead, process.env.NEXT_PUBLIC_APPLOI_URL);

  const searchResult = await ask(
    `Search for ${lead.first_name ?? ""} ${lead.last_name ?? ""} (${lead.email ?? "no email on file"}) yourself in the browser.\n` +
      "Type 'found' if you located a single matching record, 'notfound' if none exists, 'multiple' if more than one candidate matches, or 'incomplete' if you could not finish searching: "
  );

  const matchStatus: CollectorMatchStatus =
    searchResult === "found" ? "found" :
    searchResult === "notfound" ? "not_found" :
    searchResult === "multiple" ? "ambiguous_multiple_matches" : "search_incomplete";

  const observations: PendingObservation[] = [];
  const observedAt = new Date().toISOString();

  if (matchStatus === "found") {
    console.log("\nAnswer only what is directly visible on screen. If you can't tell, answer 'unknown' — never guess.");
    observations.push(await askBoolean("apploi.application_started", "Has the application been started?", observedAt));
    observations.push(await askBoolean("apploi.application_submitted", "Has the application been submitted?", observedAt));
    observations.push(await askFreeText("apploi.current_status", "What is the current status shown on the record (exact label)?", observedAt));
    observations.push(await askFreeText("apploi.selected_position", "What position/role is selected on the record?", observedAt));
    observations.push(await askBoolean("apploi.interview_scheduled", "Is an interview scheduled?", observedAt));
    observations.push(await askBoolean("apploi.interview_completed", "Is interview completion directly shown (not just scheduled)?", observedAt));
    observations.push(await askFreeText("apploi.incomplete_tasks", "Any incomplete tasks/documents directly visible? (or 'none')", observedAt));
    observations.push(
      await askEnum(
        "apploi.pipeline_disposition",
        "Pipeline disposition, if shown",
        observedAt,
        ["advanced", "withdrawn", "rejected", "none_observed"]
      )
    );
  }

  return { matchStatus, observations };
}

async function collectViventium(lead: RecruitingLead): Promise<VendorCollectionResult | null> {
  await pauseForVendor("Viventium", lead, process.env.NEXT_PUBLIC_VIVENTIUM_URL);

  const searchResult = await ask(
    `Search for ${lead.first_name ?? ""} ${lead.last_name ?? ""} (${lead.email ?? "no email on file"}) yourself in the browser.\n` +
      "Type 'found' if you located a single matching record, 'notfound' if none exists, 'multiple' if more than one matches, or 'incomplete' if you could not finish searching: "
  );

  const matchStatus: CollectorMatchStatus =
    searchResult === "found" ? "found" :
    searchResult === "notfound" ? "not_found" :
    searchResult === "multiple" ? "ambiguous_multiple_matches" : "search_incomplete";

  const observations: PendingObservation[] = [];
  const observedAt = new Date().toISOString();

  if (matchStatus === "found") {
    console.log("\nAnswer only what is directly visible on screen. If you can't tell, answer 'unknown' — never guess.");
    observations.push(await askFreeText("viventium.onboarding_stage", "What onboarding stage is shown (exact label)?", observedAt));
    observations.push(await askStatusEnum("viventium.i9_status", "I-9 status", observedAt));
    observations.push(await askStatusEnum("viventium.w4_status", "W-4 status", observedAt));
    observations.push(await askStatusEnum("viventium.direct_deposit_status", "Direct deposit status", observedAt));
    observations.push(await askFreeText("viventium.required_forms_tasks", "Any required forms/tasks directly visible? (or 'none')", observedAt));
    observations.push(await askEnum("viventium.record_status", "Record status", observedAt, ["active", "pending"]));
  }

  return { matchStatus, observations };
}

async function askBoolean(key: string, question: string, observedAt: string): Promise<PendingObservation> {
  const answer = (await ask(`${question} [true/false/unknown] `)).toLowerCase();
  if (answer === "true" || answer === "false") {
    return { observationKey: key, rawLabel: null, normalizedValue: answer, visibility: "directly_observed", observedAt };
  }
  return { observationKey: key, rawLabel: null, normalizedValue: null, visibility: "not_visible", observedAt };
}

async function askFreeText(key: string, question: string, observedAt: string): Promise<PendingObservation> {
  const answer = await ask(`${question} `);
  if (!answer || answer.toLowerCase() === "unknown") {
    return { observationKey: key, rawLabel: null, normalizedValue: null, visibility: "not_visible", observedAt };
  }
  const isNone = answer.toLowerCase() === "none";
  return {
    observationKey: key,
    rawLabel: answer,
    normalizedValue: isNone ? "none" : answer,
    visibility: "directly_observed",
    observedAt,
  };
}

async function askEnum(key: string, question: string, observedAt: string, options: readonly string[]): Promise<PendingObservation> {
  const answer = (await ask(`${question} [${options.join("/")}/unknown] `)).toLowerCase();
  if (options.includes(answer)) {
    return { observationKey: key, rawLabel: null, normalizedValue: answer, visibility: "directly_observed", observedAt };
  }
  return { observationKey: key, rawLabel: null, normalizedValue: null, visibility: "not_visible", observedAt };
}

async function askStatusEnum(key: string, question: string, observedAt: string): Promise<PendingObservation> {
  return askEnum(key, question, observedAt, ["completed", "pending", "not_started"]);
}

async function persist(
  lead: RecruitingLead,
  flightMarker: string,
  source: CollectorSourceSystem,
  result: VendorCollectionResult
): Promise<void> {
  const { run, error: createError } = await createCollectorRun({
    recruitingLeadId: lead.id,
    sourceSystem: source,
    initiatedBy: INITIATED_BY,
    flightMarker,
  });
  if (createError || !run) {
    console.error(`Could not create collector run for ${source}: ${createError}`);
    return;
  }

  if (result.observations.length > 0) {
    const { error: insertError } = await insertObservations({
      collectorRunId: run.id,
      recruitingLeadId: lead.id,
      observations: result.observations,
    });
    if (insertError) {
      await completeCollectorRun({ collectorRunId: run.id, status: "failed", matchStatus: result.matchStatus, errorCategory: "persist_failed" });
      console.error(`Could not persist ${source} observations: ${insertError}`);
      return;
    }
  }

  await completeCollectorRun({ collectorRunId: run.id, status: "success", matchStatus: result.matchStatus });
  console.log(`${source}: persisted ${result.observations.length} observation(s), match_status=${result.matchStatus}.`);
}

async function main() {
  const lead = await resolveLead();

  console.log("\n=== Recruiting Lead Flight ===");
  console.log(`Lead:   ${[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "(unnamed)"}`);
  console.log(`Role:   ${lead.role_interest}`);
  console.log(`Status: ${lead.status}`);
  console.log(`Email:  ${lead.email ?? "(none on file)"}`);
  console.log(`ID:     ${lead.id}`);

  const confirmed = await confirm("\nConfirm this is the approved person to search for in Apploi and Viventium?");
  if (!confirmed) {
    console.log("Not confirmed. Exiting — no vendor was contacted.");
    rl.close();
    return;
  }

  const flightMarker = generateFlightMarker(`recruiting-lead-${lead.id}`);

  const apploiResult = await collectApploi(lead);
  const viventiumResult = await collectViventium(lead);

  console.log("\n=== Summary — nothing has been saved yet ===");
  console.log(`Apploi match: ${apploiResult?.matchStatus}, ${apploiResult?.observations.length ?? 0} observation(s)`);
  for (const o of apploiResult?.observations ?? []) {
    console.log(`  ${o.observationKey}: ${o.visibility === "directly_observed" ? o.normalizedValue : "not visible"}`);
  }
  console.log(`Viventium match: ${viventiumResult?.matchStatus}, ${viventiumResult?.observations.length ?? 0} observation(s)`);
  for (const o of viventiumResult?.observations ?? []) {
    console.log(`  ${o.observationKey}: ${o.visibility === "directly_observed" ? o.normalizedValue : "not visible"}`);
  }

  const shouldPersist = await confirm("\nPersist this evidence to Supabase for this lead?");
  if (!shouldPersist) {
    console.log("Not confirmed. Exiting — nothing was written to Supabase.");
    rl.close();
    return;
  }

  if (apploiResult) await persist(lead, flightMarker, "apploi", apploiResult);
  if (viventiumResult) await persist(lead, flightMarker, "viventium", viventiumResult);

  // Rule evaluation runs once, after all of this run's observations are
  // persisted, over every observation on record for this lead — not just
  // this run's — so cross-run and cross-vendor rules (e.g. Rule F) see the
  // full picture. The collector's job ends at persistence; everything from
  // here on is the Operational Intelligence Engine's responsibility.
  const allObservations = await getObservationsForLead(lead.id);
  const { signalsProduced, errors: ruleErrors } = await evaluateRecruitingLeadRules(lead.id, allObservations);
  console.log(`\nRule evaluation: ${signalsProduced} inference(s) produced.`);
  for (const err of ruleErrors) console.error(`  Rule evaluation error: ${err}`);

  console.log(`\nDone. Flight marker: ${flightMarker}`);
  console.log(`View the result at /recruiting/${lead.id}`);
  rl.close();
}

main().catch((err) => {
  console.error("Recruiting Lead Flight failed:", err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});

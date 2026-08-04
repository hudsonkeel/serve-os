// Viventium DOM Reconnaissance — supervised discovery tool, read-only. See
// the approved "Assisted Cross-System Flight" plan, Phase 1.
//
// Same safety model as scripts/collectors/apploiDomReconnaissance.ts:
//   - attaches via CDP to a browser Hud already launched and authenticated
//     manually — never launches, never logs in, never performs MFA;
//   - requires Hud to confirm which open tab is the approved Viventium
//     record;
//   - verifies the confirmed tab's origin against the approved Viventium
//     origin — hard stop on mismatch;
//   - requires Hud to attest BOTH that the on-screen name matches the
//     approved lead AND that this is a single individual record, not a
//     list/search-results view — hard stop on any doubt;
//   - captures a bounded, read-only structural map of the ENTIRE currently
//     rendered page (Viventium's DOM shape is unknown — unlike Apploi,
//     there is no known dialog/drawer to scope to yet, and no tab
//     navigation is attempted at all: zero clicks, of any kind, anywhere
//     in this script);
//   - never clicks, fills, types, selects, uploads, or navigates — see
//     lib/collectors/__tests__/contractBoundaries.test.ts, which
//     structurally enforces the click prohibition repo-wide;
//   - redacts any captured text that pattern-matches SSN, bank-account,
//     date-of-birth, or street-address shapes before it is ever printed
//     (see lib/recruiting/extractors/viventium/sensitiveDataFilter.ts) —
//     conservative by design, redacts rather than guesses safe.
//
// Usage:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/collectors/viventiumDomReconnaissance.ts --recruiting-lead-id=<uuid> [--cdp-endpoint=http://localhost:9222]
import { createInterface } from "node:readline/promises";
// cdpAttach.ts's functions (listOpenTabs/getPageByIndex/verifyOrigin/
// namesMatch) are vendor-agnostic — pure CDP/browser mechanics, no Apploi-
// specific logic — so they're reused here as-is rather than duplicated.
import { listOpenTabs, getPageByIndex, verifyOrigin, namesMatch } from "../../lib/recruiting/extractors/apploi/cdpAttach.ts";
import { captureDialogStructure } from "../../lib/recruiting/extractors/apploi/dialogReconnaissance.ts";
import { redactSensitiveAnchors } from "../../lib/recruiting/extractors/viventium/sensitiveDataFilter.ts";
import { getRecruitingLeadById } from "../../lib/data/recruitingLeads.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

function parseArgs(): { recruitingLeadId?: string; cdpEndpoint: string } {
  const args = process.argv.slice(2);
  const idArg = args.find((a) => a.startsWith("--recruiting-lead-id="));
  const endpointArg = args.find((a) => a.startsWith("--cdp-endpoint="));
  return {
    recruitingLeadId: idArg?.slice("--recruiting-lead-id=".length),
    cdpEndpoint: endpointArg?.slice("--cdp-endpoint=".length) ?? "http://localhost:9222",
  };
}

async function main() {
  const { recruitingLeadId, cdpEndpoint } = parseArgs();
  if (!recruitingLeadId) {
    console.error("Usage: --recruiting-lead-id=<uuid> is required.");
    process.exit(1);
  }

  const lead = await getRecruitingLeadById(recruitingLeadId);
  if (!lead) {
    console.error("No matching recruiting lead found. Aborting — nothing was attached to.");
    process.exit(1);
  }

  console.log(`\n=== Viventium DOM Reconnaissance (read-only) ===`);
  console.log(`Approved lead: ${[lead.first_name, lead.last_name].filter(Boolean).join(" ")} (${lead.id})`);
  console.log(`Attaching to ${cdpEndpoint} — this does NOT launch a browser.`);

  const { browser, tabs } = await listOpenTabs(cdpEndpoint);
  if (tabs.length === 0) {
    console.error("No open tabs found at that CDP endpoint. Aborting.");
    await browser.close();
    process.exit(1);
  }

  console.log("\nOpen tabs:");
  for (const t of tabs) console.log(`  [${t.index}] ${t.title} — ${t.url}`);

  const chosenIndexRaw = await ask("\nWhich numbered tab is the approved Viventium record? ");
  const chosenTab = tabs.find((t) => t.index === Number.parseInt(chosenIndexRaw, 10));
  if (!chosenTab) {
    console.error("No tab matched that number. Aborting — nothing was inspected.");
    await browser.close();
    process.exit(1);
  }

  const approvedOrigin = process.env.NEXT_PUBLIC_VIVENTIUM_URL;
  if (!approvedOrigin || !verifyOrigin(chosenTab.url, approvedOrigin)) {
    console.error("Tab origin does not match the approved Viventium origin. Aborting — nothing was inspected.");
    await browser.close();
    process.exit(1);
  }

  const singleRecordConfirmed = await ask(
    "\nConfirm this tab shows ONE individual employee/new-hire record — not a list, search-results, or dashboard view [y/N]: "
  );
  if (singleRecordConfirmed.toLowerCase() !== "y") {
    console.error("Not confirmed as a single-record view. Aborting — nothing was inspected, to avoid capturing unrelated employee records.");
    await browser.close();
    process.exit(1);
  }

  const page = getPageByIndex(browser, chosenTab.index);

  const nameOnScreen = await ask(
    `\nType the exact name shown on screen for this record (so it can be checked against "${[lead.first_name, lead.last_name].filter(Boolean).join(" ")}"): `
  );
  if (!namesMatch(nameOnScreen, lead.first_name ?? "", lead.last_name ?? "")) {
    console.error(`Name does not match the approved lead's name on file. Aborting — nothing was inspected further.`);
    await browser.close();
    process.exit(1);
  }
  const identityConfirmed = await ask(`Confirm "${nameOnScreen}" is the approved candidate/employee [y/N]: `);
  if (identityConfirmed.toLowerCase() !== "y") {
    console.error("Candidate identity not confirmed. Aborting — nothing was inspected further.");
    await browser.close();
    process.exit(1);
  }

  console.log("\nCapturing bounded, read-only structural map of the current page (no clicks, no navigation)...");
  const rawCapture = await captureDialogStructure(page.locator("body"), "Viventium Employee Record");
  const capture = redactSensitiveAnchors(rawCapture);

  console.log(`\n=== Full structural capture (sensitive-pattern matches redacted) ===`);
  console.log("Use this to populate a future VIVENTIUM_DOM_MAP.md / VIVENTIUM_OBSERVATION_CATALOG.md.\n");
  console.log(JSON.stringify(capture, null, 2));

  await browser.close();
  rl.close();
}

main().catch((err) => {
  console.error("Viventium DOM reconnaissance failed:", err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});

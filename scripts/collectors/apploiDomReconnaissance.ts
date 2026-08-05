// Apploi DOM Reconnaissance — supervised discovery tool, dialog-scoped.
// See docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md Phase 1 and
// the follow-up decisions approving dialog-scoped capture and narrow
// read-only tab navigation.
//
// Run by Hud, in Hud's own terminal, against a browser Hud has already
// launched and authenticated manually. This script:
//   - attaches via CDP (never launches, never logs in, never performs MFA);
//   - lists every open tab and requires Hud to confirm which one is the
//     approved candidate record;
//   - verifies the confirmed tab's origin matches the approved Apploi
//     origin — hard stop on mismatch;
//   - requires Hud to attest the on-screen candidate name matches the
//     approved lead — hard stop on any doubt;
//   - locates the active candidate dialog ([role="dialog"]) and scopes
//     every subsequent capture to it — no page-wide queries;
//   - captures a rich, BOUNDED, read-only structural map (nesting context
//     via nearest heading/nearest labeled container, occurrence count,
//     a short structural path, never raw HTML or full page/message text)
//     for the default (Activity) tab, then for Interview and Documents —
//     using tab content that's already rendered where possible, and the
//     ONE narrowly-approved read-only tab click (see
//     lib/recruiting/extractors/apploi/tabNavigation.ts) only when it isn't.
//   - prints one combined, tab-labeled report.
//
// Never clicks anything except an approved tab. Never fills, types,
// selects, uploads, or navigates. See
// lib/collectors/__tests__/contractBoundaries.test.ts, which structurally
// enforces this.
//
// Usage:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server \
//     scripts/collectors/apploiDomReconnaissance.ts --recruiting-lead-id=<uuid> [--cdp-endpoint=http://localhost:9222]
import { createInterface } from "node:readline/promises";
import { listOpenTabs, getPageByIndex, verifyOrigin } from "../../lib/recruiting/extractors/apploi/cdpAttach.ts";
import { captureDialogStructure } from "../../lib/recruiting/extractors/apploi/dialogReconnaissance.ts";
import { selectApprovedTab, tabContentAlreadyVisible } from "../../lib/recruiting/extractors/apploi/tabNavigation.ts";
import { getRecruitingLeadById } from "../../lib/data/recruitingLeads.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(prompt: string): Promise<string> {
  const answer = await rl.question(prompt);
  return answer.trim();
}

// Reconnaissance target set for this session. Screen and Integrations are
// included per the approved sequence; Integrations' output is reviewed
// for operational relevance before anything is proposed from it, per the
// explicit instruction that it's inspected "only if it contains
// operationally relevant, approved evidence."
const TARGET_TABS = ["Activity", "Interview", "Documents", "Screen", "Integrations"] as const;

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

  console.log(`\n=== Apploi DOM Reconnaissance (dialog-scoped) ===`);
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

  const chosenIndexRaw = await ask("\nWhich numbered tab is the approved candidate record? ");
  const chosenIndex = Number.parseInt(chosenIndexRaw, 10);
  const chosenTab = tabs.find((t) => t.index === chosenIndex);

  if (!chosenTab) {
    console.error("No tab matched that number. Aborting — nothing was inspected.");
    await browser.close();
    process.exit(1);
  }

  const approvedOrigin = process.env.NEXT_PUBLIC_APPLOI_URL;
  if (!approvedOrigin || !verifyOrigin(chosenTab.url, approvedOrigin)) {
    console.error(`Tab origin does not match the approved Apploi origin. Aborting — nothing was inspected.`);
    await browser.close();
    process.exit(1);
  }

  const nameConfirmed = await ask(
    `\nConfirm the candidate name shown on this page matches "${[lead.first_name, lead.last_name].filter(Boolean).join(" ")}" [y/N]: `
  );
  if (nameConfirmed.toLowerCase() !== "y") {
    console.error("Candidate identity not confirmed. Aborting — nothing was inspected, nothing was persisted.");
    await browser.close();
    process.exit(1);
  }

  const page = getPageByIndex(browser, chosenTab.index);
  const dialog = page.locator('[role="dialog"]');

  const dialogCount = await dialog.count();
  if (dialogCount === 0) {
    console.error("No [role=\"dialog\"] element found on this page. Aborting — the candidate drawer may not be open.");
    await browser.close();
    process.exit(1);
  }
  if (dialogCount > 1) {
    console.error(`Found ${dialogCount} elements matching [role="dialog"] — ambiguous. Aborting rather than guessing which one.`);
    await browser.close();
    process.exit(1);
  }

  const captures: Awaited<ReturnType<typeof captureDialogStructure>>[] = [];

  for (const tab of TARGET_TABS) {
    console.log(`\n--- ${tab} ---`);

    if (tab !== "Activity") {
      const alreadyVisible = await tabContentAlreadyVisible(dialog, tab);
      if (!alreadyVisible) {
        const result = await selectApprovedTab(dialog, tab);
        if (!result.selected) {
          console.log(`  Could not select "${tab}" tab (${result.reason}) — skipping.`);
          continue;
        }
        console.log(`  Selected "${tab}" tab, verified label: ${result.verifiedLabel}`);
      } else {
        console.log(`  "${tab}" content was already rendered — no click needed.`);
      }
    }

    const capture = await captureDialogStructure(dialog, tab);
    captures.push(capture);
    console.log(`  Captured ${capture.anchors.length} anchor(s).`);
  }

  console.log(`\n=== Full structural capture, by tab ===`);
  console.log("Use this to populate docs/architecture/APPLOI_DOM_MAP.md.\n");
  console.log(JSON.stringify(captures, null, 2));

  await browser.close();
  rl.close();
}

main().catch((err) => {
  console.error("Apploi DOM reconnaissance failed:", err instanceof Error ? err.message : err);
  rl.close();
  process.exit(1);
});

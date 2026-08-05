// CDP-attach for the Apploi reconnaissance/collection flow. See
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md §2 and
// docs/architecture/VENDOR_COLLECTOR_AUTHENTICATION.md for why this never
// launches, logs in, or performs MFA — it only attaches to a browser Hud
// already authenticated manually.
import { chromium, type Browser, type Page } from "playwright";

export interface OpenTab {
  readonly index: number;
  readonly title: string;
  readonly url: string;
}

// Enumerates every open tab across every context of the attached browser —
// never assumes the focused/active tab is the right one. The caller
// (scripts/collectors/apploiDomReconnaissance.ts) prints this list and
// requires Hud to pick one explicitly.
export async function listOpenTabs(cdpEndpoint: string): Promise<{ browser: Browser; tabs: OpenTab[] }> {
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const allPages = browser.contexts().flatMap((c) => c.pages());

  const tabs: OpenTab[] = await Promise.all(
    allPages.map(async (page, index) => ({
      index,
      title: await page.title().catch(() => "(untitled)"),
      url: page.url(),
    }))
  );

  return { browser, tabs };
}

export function getPageByIndex(browser: Browser, index: number): Page {
  const allPages = browser.contexts().flatMap((c) => c.pages());
  const page = allPages[index];
  if (!page) throw new Error(`No open tab at index ${index}`);
  return page;
}

// Origin check — a hard stop if the confirmed tab isn't on the approved
// Apploi origin. Never proceeds past this on a mismatch.
export function verifyOrigin(url: string, approvedOrigin: string): boolean {
  try {
    return new URL(url).origin === new URL(approvedOrigin).origin;
  } catch {
    return false;
  }
}

// Candidate-identity check — reads the on-page candidate name (read-only)
// and requires it to match the approved lead's name before any further
// extraction proceeds. A mismatch is a hard stop before persistence, per
// Phase 3/4's explicit requirement — this function only compares strings,
// it never decides how to find the name element (that's a
// FieldSelectorConfig the caller supplies, same as every other extractor).
export function namesMatch(observedName: string, approvedFirstName: string, approvedLastName: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const approved = normalize(`${approvedFirstName} ${approvedLastName}`);
  const observed = normalize(observedName);
  return observed.includes(approved) || approved.includes(observed);
}

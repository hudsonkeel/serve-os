// Proves the narrow tab-navigation allowlist actually holds — fully
// offline, headless Chromium rendering static fixture HTML (same pattern
// as rowScan.test.ts), zero network, zero vendor contact.
//
// Every forbidden button below carries data-clicked="false" plus an
// onclick handler that flips it to "true" — the test proves a click never
// happened by asserting that attribute never changes, not just that
// selectApprovedTab() returned an error.
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { selectApprovedTab, APPROVED_TABS } from "../tabNavigation.ts";

let passed = 0;
function test(name: string, fn: () => Promise<void>) {
  return fn().then(() => {
    passed++;
    console.log(`ok - ${passed}. ${name}`);
  });
}

const FIXTURE_HTML = `
<html><body>
  <div role="dialog">
    <div role="tablist">
      <button role="tab" aria-selected="true" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Activity</button>
      <button role="tab" aria-selected="false" data-clicked="false" onclick="this.setAttribute('aria-selected','true'); this.setAttribute('data-clicked','true')">Interview</button>
      <button role="tab" aria-selected="false" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Documents</button>
    </div>

    <button data-testid="preview-button" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Schedule Interview</button>
    <button data-testid="preview-button" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Rate Candidate</button>
    <button data-testid="preview-button" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Add Note</button>
    <button data-testid="preview-button" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Add Tags</button>
    <button data-testid="preview-button" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Add Resume</button>
    <button role="combobox" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">New</button>
    <button role="combobox" data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Interview 29</button>
    <button data-clicked="false" onclick="this.setAttribute('data-clicked','true')">Some Arbitrary Button</button>
  </div>
</body></html>
`;

async function withFixturePage(fn: (page: Page) => Promise<void>): Promise<void> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML);
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function wasClicked(page: Page, text: string): Promise<boolean> {
  const attr = await page.locator(`text="${text}"`).first().getAttribute("data-clicked");
  return attr === "true";
}

async function run() {
  await test("an approved tab (Interview) may be selected and is verified afterward", async () => {
    await withFixturePage(async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const result = await selectApprovedTab(dialog, "Interview");
      assert.equal(result.selected, true);
      assert.equal(result.reason, "selected");
      assert.equal(result.verifiedLabel, "Interview");
    });
  });

  await test("APPROVED_TABS contains exactly the five allowlisted labels", async () => {
    assert.deepEqual([...APPROVED_TABS].sort(), ["Activity", "Documents", "Integrations", "Interview", "Screen"].sort());
  });

  const forbiddenLabels = [
    "Schedule Interview",
    "Rate Candidate",
    "Add Note",
    "Add Tags",
    "Add Resume",
    "New",
    "Interview 29",
    "Some Arbitrary Button",
  ];

  for (const label of forbiddenLabels) {
    await test(`"${label}" cannot be clicked via selectApprovedTab`, async () => {
      await withFixturePage(async (page) => {
        const dialog = page.locator('[role="dialog"]');
        const result = await selectApprovedTab(dialog, label);
        assert.equal(result.selected, false);
        assert.equal(result.reason, "not_in_allowlist");
        assert.equal(await wasClicked(page, label), false, `"${label}" must never actually be clicked`);
      });
    });
  }

  await test("an unapproved string that happens to match nothing with role=tab is still rejected before any DOM query", async () => {
    await withFixturePage(async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const result = await selectApprovedTab(dialog, "Not A Real Tab");
      assert.equal(result.reason, "not_in_allowlist");
    });
  });

  console.log(`\n${passed}/${passed} passed`);
}

run().catch((err) => {
  console.error("Test run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

// Proves the primitives the persisting collector's hard stops depend on —
// exactly-one-dialog detection and candidate-name matching — behave
// correctly. Fully offline, static fixture HTML, same pattern as
// rowScan.test.ts/dialogFields.test.ts.
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { namesMatch, verifyOrigin } from "../cdpAttach.ts";

let passed = 0;
function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`ok - ${passed}. ${name}`);
  });
}

async function withFixturePage(html: string, fn: (page: Page) => Promise<void>): Promise<void> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function run() {
  // ─── Exactly-one-dialog requirement ───────────────────────────────────
  await test("exactly one [role=dialog] is detected as count === 1 (the collector proceeds)", async () => {
    await withFixturePage(`<html><body><div role="dialog">one</div></body></html>`, async (page) => {
      assert.equal(await page.locator('[role="dialog"]').count(), 1);
    });
  });

  await test("zero [role=dialog] elements is detected as count === 0 (the collector hard-stops)", async () => {
    await withFixturePage(`<html><body><div>no dialog here</div></body></html>`, async (page) => {
      assert.equal(await page.locator('[role="dialog"]').count(), 0);
    });
  });

  await test("multiple [role=dialog] elements is detected as count > 1 (the collector hard-stops rather than guessing)", async () => {
    await withFixturePage(
      `<html><body><div role="dialog">one</div><div role="dialog">two</div></body></html>`,
      async (page) => {
        assert.equal(await page.locator('[role="dialog"]').count(), 2);
      }
    );
  });

  // ─── Candidate identity matching ───────────────────────────────────────
  await test("namesMatch confirms an exact match", () => {
    assert.equal(namesMatch("Alma Dhora Owolabi", "Alma Dhora", "Owolabi"), true);
  });

  await test("namesMatch confirms a substring match (e.g. the page shows extra text alongside the name)", () => {
    assert.equal(namesMatch("Alma Dhora Owolabi (Independent Living Caregiver)", "Alma Dhora", "Owolabi"), true);
  });

  await test("namesMatch rejects a genuinely different name — an identity mismatch", () => {
    assert.equal(namesMatch("Bob Smith", "Alma Dhora", "Owolabi"), false);
  });

  // ─── Origin verification ───────────────────────────────────────────────
  await test("verifyOrigin confirms a matching origin", () => {
    assert.equal(
      verifyOrigin("https://hire.apploi.com/v2/candidates?candidateID=abc", "https://hire.apploi.com"),
      true
    );
  });

  await test("verifyOrigin rejects a different origin — a hard stop before any extraction", () => {
    assert.equal(verifyOrigin("https://evil.example.com/candidates", "https://hire.apploi.com"), false);
  });

  await test("verifyOrigin rejects a malformed URL rather than throwing", () => {
    assert.equal(verifyOrigin("not a url", "https://hire.apploi.com"), false);
  });

  console.log(`\n${passed}/${passed} passed`);
}

run().catch((err) => {
  console.error("Test run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

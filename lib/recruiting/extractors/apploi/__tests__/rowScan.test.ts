// Fixture-based extractor tests — a fully OFFLINE, local, headless
// Chromium instance rendering static HTML I wrote (chromium.launch +
// page.setContent). No network call, no vendor origin, no Cloudflare
// interaction of any kind. This is categorically different from launching
// an automated browser against a real vendor, which this codebase
// deliberately does not do (see docs/architecture/RECRUITING_LEAD_FLIGHT_PLAN.md's
// "Option C" decision) — Playwright is used here purely to parse static
// text, the same way any DOM-testing library would be.
//
// The fixture HTML below is entirely fictional, written for this test —
// it is not, and is not claimed to be, real Apploi markup.
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { rowScan } from "../rowScan.ts";
import type { FieldSelectorConfig } from "../extraction.ts";

let passed = 0;
function test(name: string, fn: () => Promise<void>) {
  return fn().then(() => {
    passed++;
    console.log(`ok - ${passed}. ${name}`);
  });
}

const FIXTURE_HTML = `
<html><body>
  <div class="candidate-row">
    <span data-testid="candidate-name">Fixture Candidate</span>
    <span data-testid="pipeline-stage">Requested Interview</span>
    <span data-testid="empty-field"></span>
    <span data-testid="duplicate-field">First</span>
    <span data-testid="duplicate-field">Second</span>
  </div>
</body></html>
`;

function dataTestIdField(observationKey: string, testId: string, sourceLocation: string): FieldSelectorConfig {
  return {
    observationKey,
    sourceLocation,
    strategies: [
      {
        matchMethod: "data_attribute",
        confidence: "high",
        locate: (scope) => scope.locator(`[data-testid="${testId}"]`),
      },
    ],
  };
}

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

async function run() {
  await test("an observed field returns outcome 'observed' with a bounded rawLabel", async () => {
    await withFixturePage(async (page) => {
      const results = await rowScan(page, [
        dataTestIdField("fixture.pipeline_stage", "pipeline-stage", "candidate row > pipeline stage"),
      ]);
      assert.equal(results[0].outcome, "observed");
      assert.equal(results[0].normalizedValue, "Requested Interview");
      assert.equal(results[0].matchMethod, "data_attribute");
      assert.equal(results[0].extractionConfidence, "high");
    });
  });

  await test("a missing selector returns 'not_visible', never a fabricated value", async () => {
    await withFixturePage(async (page) => {
      const results = await rowScan(page, [
        dataTestIdField("fixture.nonexistent_field", "does-not-exist", "nowhere"),
      ]);
      assert.equal(results[0].outcome, "not_visible");
      assert.equal(results[0].normalizedValue, null);
      assert.equal(results[0].failureReason, "selector_not_found");
    });
  });

  await test("an empty-but-present element returns 'unknown', not a false negative", async () => {
    await withFixturePage(async (page) => {
      const results = await rowScan(page, [
        dataTestIdField("fixture.empty_field", "empty-field", "candidate row > empty field"),
      ]);
      assert.equal(results[0].outcome, "unknown");
      assert.equal(results[0].normalizedValue, null);
    });
  });

  await test("multiple matches return 'ambiguous', never a silently picked value", async () => {
    await withFixturePage(async (page) => {
      const results = await rowScan(page, [
        dataTestIdField("fixture.duplicate_field", "duplicate-field", "candidate row > duplicate field"),
      ]);
      assert.equal(results[0].outcome, "ambiguous");
      assert.equal(results[0].normalizedValue, null);
      assert.ok(results[0].failureReason?.includes("multiple_matches"));
    });
  });

  await test("outcome vocabulary never includes false/incomplete/not_done", async () => {
    await withFixturePage(async (page) => {
      const results = await rowScan(page, [
        dataTestIdField("fixture.pipeline_stage", "pipeline-stage", "candidate row > pipeline stage"),
        dataTestIdField("fixture.nonexistent_field", "does-not-exist", "nowhere"),
        dataTestIdField("fixture.empty_field", "empty-field", "candidate row > empty field"),
        dataTestIdField("fixture.duplicate_field", "duplicate-field", "candidate row > duplicate field"),
      ]);
      const allowedOutcomes = new Set(["observed", "unknown", "ambiguous", "not_visible"]);
      for (const r of results) {
        assert.ok(allowedOutcomes.has(r.outcome), `unexpected outcome: ${r.outcome}`);
      }
    });
  });

  console.log(`\n${passed}/${passed} passed`);
}

run().catch((err) => {
  console.error("Test run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

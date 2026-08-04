// Fixture-based tests for the real (approved) dialog field selectors and
// their finalizers — fully OFFLINE, static HTML, same pattern as
// rowScan.test.ts. The fixture markup mirrors the SHAPE of the confirmed
// reconnaissance evidence (h2 candidate name vs. a separate h2 "Viventium",
// h3 position vs. "Recent Experience"/"Education", a "Resume" h4 with a
// sibling status paragraph, a noIntegrationMessage data-testid) — it is
// fictional markup written for this test, not a claim of exact real HTML.
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { extractField } from "../extraction.ts";
import {
  CANDIDATE_NAME_FIELD,
  POSITION_FIELD,
  RESUME_AVAILABILITY_FIELD,
  VIVENTIUM_INTEGRATION_STATUS_FIELD,
  finalizeResumeAvailability,
  finalizeViventiumIntegrationStatus,
} from "../dialogFields.ts";
import type { RawObservation } from "../../../../collectors/types.ts";

let passed = 0;
function test(name: string, fn: () => Promise<void>) {
  return fn().then(() => {
    passed++;
    console.log(`ok - ${passed}. ${name}`);
  });
}

const DIALOG_FIXTURE_HTML = `
<html><body>
  <div role="dialog">
    <div>
      <h2>Fixture Candidate Name</h2>
    </div>
    <div>
      <h3>Fixture Job Title</h3>
      <div>
        <h3>Recent Experience</h3>
      </div>
      <div>
        <h3>Education</h3>
      </div>
    </div>
    <div>
      <h4>Resume</h4>
      <div><p>No resume added.</p></div>
    </div>
    <div role="tabpanel">
      <h2>Viventium</h2>
      <span data-testid="noIntegrationMessage">The Application has no Viventium integration records</span>
    </div>
  </div>
</body></html>
`;

const RESUME_PRESENT_HTML = `
<html><body>
  <div role="dialog">
    <div><h4>Resume</h4><div><p>resume.pdf</p></div></div>
  </div>
</body></html>
`;

const INTEGRATION_UNRECOGNIZED_HTML = `
<html><body>
  <div role="dialog">
    <div role="tabpanel">
      <span data-testid="noIntegrationMessage">Some unexpected future vendor copy</span>
    </div>
  </div>
</body></html>
`;

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
  await test("candidate_name selector finds the header h2, excluding the Integrations tab's 'Viventium' h2", async () => {
    await withFixturePage(DIALOG_FIXTURE_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const result = await extractField(dialog, CANDIDATE_NAME_FIELD, "test@1");
      assert.equal(result.outcome, "observed");
      assert.equal(result.normalizedValue, "Fixture Candidate Name");
    });
  });

  await test("position selector finds the one h3 that isn't 'Recent Experience' or 'Education'", async () => {
    await withFixturePage(DIALOG_FIXTURE_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const result = await extractField(dialog, POSITION_FIELD, "test@1");
      assert.equal(result.outcome, "observed");
      assert.equal(result.normalizedValue, "Fixture Job Title");
    });
  });

  await test("resume_availability selector finds the paragraph sibling of the 'Resume' h4", async () => {
    await withFixturePage(DIALOG_FIXTURE_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const raw = await extractField(dialog, RESUME_AVAILABILITY_FIELD, "test@1");
      const finalized = finalizeResumeAvailability(raw);
      assert.equal(finalized.outcome, "observed");
      assert.equal(finalized.normalizedValue, "not_available");
    });
  });

  await test("resume absent state ('No resume added.') is recognized and normalized", async () => {
    await withFixturePage(DIALOG_FIXTURE_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const raw = await extractField(dialog, RESUME_AVAILABILITY_FIELD, "test@1");
      assert.equal(raw.rawLabel, "No resume added.");
      const finalized = finalizeResumeAvailability(raw);
      assert.equal(finalized.normalizedValue, "not_available");
    });
  });

  await test("an unrecognized resume state (e.g. a filename) becomes 'unknown', never a guessed positive", async () => {
    await withFixturePage(RESUME_PRESENT_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const raw = await extractField(dialog, RESUME_AVAILABILITY_FIELD, "test@1");
      assert.equal(raw.outcome, "observed"); // extraction itself succeeded — a real p was found
      const finalized = finalizeResumeAvailability(raw);
      assert.equal(finalized.outcome, "unknown");
      assert.equal(finalized.normalizedValue, null);
      assert.equal(finalized.failureReason, "unrecognized_resume_state");
    });
  });

  await test("viventium_integration_status finds the noIntegrationMessage and normalizes it narrowly", async () => {
    await withFixturePage(DIALOG_FIXTURE_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const raw = await extractField(dialog, VIVENTIUM_INTEGRATION_STATUS_FIELD, "test@1");
      const finalized = finalizeViventiumIntegrationStatus(raw);
      assert.equal(finalized.outcome, "observed");
      assert.equal(finalized.normalizedValue, "no_integration_record_found");
      // Never phrased as proof of a hiring/onboarding/transfer outcome —
      // the normalized value itself stays a narrow integration-status
      // label, not an operational conclusion.
      assert.ok(!/hired|onboard|transfer/i.test(finalized.normalizedValue ?? ""));
    });
  });

  await test("unrecognized integration status text becomes 'unknown', never guessed", async () => {
    await withFixturePage(INTEGRATION_UNRECOGNIZED_HTML, async (page) => {
      const dialog = page.locator('[role="dialog"]');
      const raw = await extractField(dialog, VIVENTIUM_INTEGRATION_STATUS_FIELD, "test@1");
      const finalized = finalizeViventiumIntegrationStatus(raw);
      assert.equal(finalized.outcome, "unknown");
      assert.equal(finalized.normalizedValue, null);
    });
  });

  await test("finalizers pass through non-'observed' outcomes unchanged", async () => {
    const notVisible: RawObservation = {
      observationKey: "apploi.resume_availability",
      outcome: "not_visible",
      rawLabel: null,
      normalizedValue: null,
      sourceLocation: null,
      extractorVersion: "test@1",
      extractionConfidence: null,
      matchMethod: null,
      failureReason: "selector_not_found",
      sensitivity: "standard",
      collectionMethod: "automatic_dom",
      observedAt: new Date().toISOString(),
    };
    assert.deepEqual(finalizeResumeAvailability(notVisible), notVisible);
    assert.deepEqual(finalizeViventiumIntegrationStatus(notVisible), notVisible);
  });

  console.log(`\n${passed}/${passed} passed`);
}

run().catch((err) => {
  console.error("Test run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

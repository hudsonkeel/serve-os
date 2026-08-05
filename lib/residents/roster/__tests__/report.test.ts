// Pure-function tests for ../report.ts. Run with:
//   npm run test:residentRoster
import assert from "node:assert/strict";
import { buildReportCounts, formatReconciliationReport } from "../report.ts";
import type { PersonOutcome, ReconciliationResult } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function outcome(overrides: Partial<PersonOutcome> & { classification: PersonOutcome["classification"] }): PersonOutcome {
  return {
    person: {
      sourceSheet: "Building 1",
      sourceRowNumber: 10,
      apartment: "1201",
      lastName: "reedy",
      firstName: "carl",
      lastNameRaw: "Reedy",
      firstNameRaw: "Carl",
      displayLabel: "Carl Reedy",
      isPartOfCouple: false,
      phoneRaw: null,
    },
    residentId: null,
    residentName: null,
    priorUnit: null,
    matchMethod: null,
    matchConfidence: null,
    reason: "test",
    ...overrides,
  };
}

test("1. buildReportCounts tallies each classification correctly", () => {
  const result: ReconciliationResult = {
    totalSourceRows: 4,
    personOutcomes: [
      outcome({ classification: "exact_match" }),
      outcome({ classification: "apartment_change" }),
      outcome({ classification: "new_resident" }),
      outcome({ classification: "ambiguous" }),
    ],
    absentResidents: [{ residentId: "a", residentName: "A", lastKnownUnitNumber: "1201", communityCode: "watermere-frisco" }],
  };
  const counts = buildReportCounts(result);
  assert.equal(counts.exactMatch, 1);
  assert.equal(counts.apartmentChange, 1);
  assert.equal(counts.newResident, 1);
  assert.equal(counts.ambiguous, 1);
  assert.equal(counts.absentExisting, 1);
});

test("2. the formatted report includes an Apartment Changes section with resident/existing/official/method/confidence", () => {
  const result: ReconciliationResult = {
    totalSourceRows: 1,
    personOutcomes: [
      outcome({
        classification: "apartment_change",
        residentId: "carl",
        residentName: "Carl Reedy",
        priorUnit: "1150",
        matchMethod: "unique_name_apartment_differs",
        matchConfidence: "high",
      }),
    ],
    absentResidents: [],
  };
  const text = formatReconciliationReport(result, "dry_run");
  assert.match(text, /APARTMENT CHANGES/);
  assert.match(text, /Carl Reedy \| 1150 \| 1201 \| unique_name_apartment_differs \| high/);
});

test("3. the formatted report includes an absent-residents section with no status/disposition column", () => {
  const result: ReconciliationResult = {
    totalSourceRows: 0,
    personOutcomes: [],
    absentResidents: [{ residentId: "a", residentName: "Ada Absent", lastKnownUnitNumber: "1305", communityCode: "watermere-frisco" }],
  };
  const text = formatReconciliationReport(result, "dry_run");
  assert.match(text, /EXISTING RESIDENTS ABSENT FROM OFFICIAL ROSTER/);
  assert.match(text, /Ada Absent \| 1305 \| review/);
  assert.ok(!/deceased|moved_out/i.test(text));
});

test("4. dry-run vs apply mode label appears correctly in the header", () => {
  const result: ReconciliationResult = { totalSourceRows: 0, personOutcomes: [], absentResidents: [] };
  assert.match(formatReconciliationReport(result, "dry_run"), /DRY RUN/);
  assert.match(formatReconciliationReport(result, "apply"), /APPLIED/);
});

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();

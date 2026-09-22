// Pure-function tests for ../operationalSummary.ts. Run with:
//   npm run test:workspace
import assert from "node:assert/strict";
import { isOperationalSummaryCardVisible, type OperationalSummaryCardKey } from "../operationalSummary.ts";
import type { AuthRole } from "../../auth/constants.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ALL_CARDS: readonly OperationalSummaryCardKey[] = [
  "assessments",
  "follow_ups",
  "wellness_follow_ups",
  "proposals",
  "recruiting",
  "payroll",
  "governance",
];

test("REGRESSION: office_staff sees Assessments, Follow-ups, Wellness Follow-ups, Proposals, and Recruiting", () => {
  for (const card of ["assessments", "follow_ups", "wellness_follow_ups", "proposals", "recruiting"] as const) {
    assert.ok(isOperationalSummaryCardVisible(card, "office_staff" as AuthRole), card);
  }
});

test("REGRESSION: office_staff does NOT see Payroll or Governance & Quality", () => {
  assert.equal(isOperationalSummaryCardVisible("payroll", "office_staff" as AuthRole), false);
  assert.equal(isOperationalSummaryCardVisible("governance", "office_staff" as AuthRole), false);
});

test("REGRESSION: every other role retains every card, including Payroll and Governance & Quality", () => {
  for (const role of ["admin", "manager", "executive", "operations"] as AuthRole[]) {
    for (const card of ALL_CARDS) {
      assert.ok(isOperationalSummaryCardVisible(card, role), `${role} should see ${card}`);
    }
  }
});

test("a null/undefined role is treated as non-office_staff -- every card stays visible", () => {
  for (const card of ALL_CARDS) {
    assert.ok(isOperationalSummaryCardVisible(card, null));
    assert.ok(isOperationalSummaryCardVisible(card, undefined));
  }
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);

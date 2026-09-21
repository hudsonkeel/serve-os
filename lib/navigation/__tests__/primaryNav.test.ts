// node --experimental-strip-types --conditions=react-server lib/navigation/__tests__/primaryNav.test.ts
//
// Tests lib/navigation/navData.ts, not primaryNav.ts directly — primaryNav.ts
// imports lucide-react (icons), which this repo's plain-Node test runner
// cannot load. navData.ts holds the actual label/href/roles facts and
// filtering logic and is deliberately free of that import so it's testable;
// primaryNav.ts only adds icons on top (see its own header comment).
import assert from "node:assert/strict";
import { AUTH_ROLES, type AuthRole } from "../../auth/constants.ts";
import { getVisibleNavSectionsData, getVisibleUtilityItemsData } from "../navData.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function visibleLabels(role: AuthRole | null): string[] {
  return [
    ...getVisibleNavSectionsData(role).flatMap((section) => section.items.map((item) => item.label)),
    ...getVisibleUtilityItemsData(role).map((item) => item.label),
  ];
}

// Office Staff Visibility v0.1 / Scoped Workforce Audit Readiness / Ask
// Serve office_staff access — the exact approved destination set per
// role. Every role except office_staff must see the full, unchanged
// nav; office_staff sees Today's Work, The People We Serve, Workforce,
// Audit Readiness (a scoped workforce-only view at the same URL — see
// app/audit-readiness/page.tsx), Ask Serve (read-only organizational
// knowledge, no added operational/governance authority), and Settings.
const EXPECTED: Record<(typeof AUTH_ROLES)[number], string[]> = {
  admin: [
    "Today's Work",
    "The People We Serve",
    "Workforce",
    "Audit Readiness",
    "Quality (QAPI)",
    "How We're Doing",
    "Community Outlook",
    "Ask Serve",
    "Settings",
  ],
  manager: [
    "Today's Work",
    "The People We Serve",
    "Workforce",
    "Audit Readiness",
    "Quality (QAPI)",
    "How We're Doing",
    "Community Outlook",
    "Ask Serve",
    "Settings",
  ],
  executive: [
    "Today's Work",
    "The People We Serve",
    "Workforce",
    "Audit Readiness",
    "Quality (QAPI)",
    "How We're Doing",
    "Community Outlook",
    "Ask Serve",
    "Settings",
  ],
  operations: [
    "Today's Work",
    "The People We Serve",
    "Workforce",
    "Audit Readiness",
    "Quality (QAPI)",
    "How We're Doing",
    "Community Outlook",
    "Ask Serve",
    "Settings",
  ],
  office_staff: ["Today's Work", "The People We Serve", "Workforce", "Audit Readiness", "Ask Serve", "Settings"],
};

for (const role of AUTH_ROLES) {
  test(`${role} sees exactly the expected nav destination set`, () => {
    assert.deepEqual(visibleLabels(role), EXPECTED[role]);
  });
}

test("office_staff's Serve section keeps both The People We Serve and Workforce (resident-access revision)", () => {
  const sections = getVisibleNavSectionsData("office_staff");
  const serve = sections.find((s) => s.heading === "Serve");
  assert.ok(serve, "Serve section should still render");
  assert.deepEqual(serve!.items.map((i) => i.label), ["The People We Serve", "Workforce"]);
});

test("office_staff's Governance section keeps only Audit Readiness (Quality/QAPI dropped) — Understand is dropped entirely", () => {
  const sections = getVisibleNavSectionsData("office_staff");
  const governance = sections.find((s) => s.heading === "Governance");
  assert.ok(governance, "Governance section should still render (Audit Readiness is visible)");
  assert.deepEqual(governance!.items.map((i) => i.label), ["Audit Readiness"]);
  assert.equal(sections.some((s) => s.heading === "Understand"), false);
});

test("REGRESSION: office_staff nav contains Audit Readiness and Ask Serve but not Quality (QAPI), How We're Doing, or Community Outlook", () => {
  const labels = visibleLabels("office_staff");
  assert.ok(labels.includes("Audit Readiness"));
  assert.ok(labels.includes("Ask Serve"));
  assert.ok(!labels.includes("Quality (QAPI)"));
  assert.ok(!labels.includes("How We're Doing"));
  assert.ok(!labels.includes("Community Outlook"));
});

test("a null role sees nothing role-restricted, but does see The People We Serve/Workforce/Audit Readiness/Settings (unrestricted items have no role check to fail)", () => {
  assert.deepEqual(visibleLabels(null), ["Today's Work", "The People We Serve", "Workforce", "Audit Readiness", "Settings"]);
});

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

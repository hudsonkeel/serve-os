import assert from "node:assert/strict";
import { classifyAxisCareClientLifecycle, hasServiceStarted } from "../clientLifecycle.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("active status -> active_client, regardless of class", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: true, label: "Active" },
      classes: [],
      hasContactInfo: false,
      hasStartDate: false,
    }),
    "active_client"
  );
});

test("inactive with WAF Prospect class -> prospect", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [{ code: "WAF Prospect", label: "WAF Prospect" }],
      hasContactInfo: true,
      hasStartDate: false,
    }),
    "prospect"
  );
});

// "Active No Visits" (both the legacy "WAF -" and current "WAFrisco -"
// naming) means an established client deliberately kept Inactive in
// AxisCare until service is requested — inactive_client, not prospect,
// and no start date is required (Frisco Needs Review investigation,
// 2026-08-23 — see lifecycleSignals.ts's header for the confirmed
// business meaning).
test("inactive with 'WAF - Active No Visits' class -> inactive_client, no start date required", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [{ code: "WAF - Active No Visits", label: "WAF - Active No Visits" }],
      hasContactInfo: true,
      hasStartDate: false,
    }),
    "inactive_client"
  );
});

test("inactive with 'WAFrisco - Active No Visits' class -> inactive_client, no start date required", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [{ code: "WAFrisco - Active No Visits", label: "WAFrisco - Active No Visits" }],
      hasContactInfo: true,
      hasStartDate: false,
    }),
    "inactive_client"
  );
});

test("inactive, no prospect class, real contact info and a start date -> inactive_client", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [],
      hasContactInfo: true,
      hasStartDate: true,
    }),
    "inactive_client"
  );
});

test("inactive, no prospect class, no contact info, no start date -> needs_review", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [],
      hasContactInfo: false,
      hasStartDate: false,
    }),
    "needs_review"
  );
});

test("inactive with contact info but no start date -> needs_review, not assumed inactive_client", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [],
      hasContactInfo: true,
      hasStartDate: false,
    }),
    "needs_review"
  );
});

// ─── hasServiceStarted — the 2026-08-23 fix ────────────────────────────

test("hasServiceStarted: null/undefined start date -> false", () => {
  assert.equal(hasServiceStarted(null), false);
  assert.equal(hasServiceStarted(undefined), false);
});

test("hasServiceStarted: a past start date -> true", () => {
  assert.equal(hasServiceStarted("2026-01-01", new Date("2026-08-23T00:00:00Z")), true);
});

test("hasServiceStarted: today's date -> true (the day service begins already counts as started)", () => {
  assert.equal(hasServiceStarted("2026-08-23", new Date("2026-08-23T00:00:00Z")), true);
});

test("REGRESSION (Karen Mabry / AxisCare #44 live case): a future start date -> false, service has not begun", () => {
  assert.equal(hasServiceStarted("2026-08-28", new Date("2026-08-23T00:00:00Z")), false);
});

test("REGRESSION: classifyAxisCareClientLifecycle with a future-dated start (via hasServiceStarted) is needs_review, never inactive_client", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [],
    hasContactInfo: true,
    hasStartDate: hasServiceStarted("2026-08-28", new Date("2026-08-23T00:00:00Z")),
  });
  assert.equal(result, "needs_review");
});

// ─── REGRESSION (Frisco Needs Review investigation, 2026-08-23): Karen ──
// Mabry's real class codes (["Watermere Firewheel", "PC"]) carry no
// AxisCare lifecycle class signal at all, so the new "Active No Visits" ->
// inactive_client class-signal path must never catch her — her
// classification stays governed entirely by her future start date.
test("REGRESSION (Karen Mabry / AxisCare #44 live case): real classes + future start date -> needs_review, not inactive_client", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [
      { code: "Watermere Firewheel", label: "Watermere Firewheel" },
      { code: "PC", label: "Personal Care" },
    ],
    hasContactInfo: true,
    hasStartDate: hasServiceStarted("2026-08-28", new Date("2026-08-23T00:00:00Z")),
  });
  assert.equal(result, "needs_review");
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

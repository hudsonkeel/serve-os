import assert from "node:assert/strict";
import { hasProspectLifecycleSignal } from "../lifecycleSignals.ts";
import { classifyAxisCareClientLifecycle } from "../clientLifecycle.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("'WAFirewheel Prospect' carries the prospect lifecycle signal", () => {
  assert.equal(hasProspectLifecycleSignal(["Watermere Firewheel", "CINCH", "PC", "WAFirewheel Prospect"]), true);
});

test("'WAFrisco Signed Agreement / No Visits' carries the prospect lifecycle signal", () => {
  assert.equal(hasProspectLifecycleSignal(["Watermere Frisco", "WAFrisco Signed Agreement / No Visits"]), true);
});

test("a pure location class alone ('Watermere Frisco') carries no lifecycle signal", () => {
  assert.equal(hasProspectLifecycleSignal(["Watermere Frisco"]), false);
});

test("a pure workflow class with no location meaning ('CINCH') carries no lifecycle signal either", () => {
  assert.equal(hasProspectLifecycleSignal(["CINCH", "Personal Care"]), false);
});

// ─── THE BUG FIX, proven at the classification level ───────────────────

test("BUG FIX: Maria's real class set now classifies as 'prospect', not 'needs_review'", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [
      { code: "Watermere Firewheel", label: "Watermere Firewheel" },
      { code: "CINCH", label: "CINCH" },
      { code: "PC", label: "Personal Care" },
      { code: "WAFirewheel Prospect", label: "WAFirewheel Prospect" },
    ],
    hasContactInfo: true,
    hasStartDate: false,
  });
  assert.equal(result, "prospect");
});

test("the equivalent Frisco prospect class ('WAFrisco Signed Agreement / No Visits') still classifies as 'prospect' -- the fix is generic, not Firewheel-specific", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [
      { code: "Watermere Frisco", label: "Watermere Frisco" },
      { code: "WAFrisco Signed Agreement / No Visits", label: "WAFrisco Signed Agreement / No Visits" },
    ],
    hasContactInfo: true,
    hasStartDate: false,
  });
  assert.equal(result, "prospect");
});

test("Frisco and Firewheel prospects reach the SAME substantive lifecycle state through the SAME generic rule -- location-independent", () => {
  const friscoResult = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [{ code: "WAFrisco Signed Agreement / No Visits", label: "" }],
    hasContactInfo: true,
    hasStartDate: false,
  });
  const firewheelResult = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [{ code: "WAFirewheel Prospect", label: "" }],
    hasContactInfo: true,
    hasStartDate: false,
  });
  assert.equal(friscoResult, "prospect");
  assert.equal(firewheelResult, "prospect");
  assert.equal(friscoResult, firewheelResult);
});

test("active status still wins regardless of any prospect class present (unchanged behavior)", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: true, label: "Active" },
    classes: [{ code: "WAFirewheel Prospect", label: "" }],
    hasContactInfo: true,
    hasStartDate: true,
  });
  assert.equal(result, "active_client");
});

test("inactive, no prospect class, real contact info + start date -> inactive_client (unchanged behavior)", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [{ code: "Watermere Frisco", label: "" }],
    hasContactInfo: true,
    hasStartDate: true,
  });
  assert.equal(result, "inactive_client");
});

test("inactive, no prospect class, no start date -> needs_review (unchanged fallback)", () => {
  const result = classifyAxisCareClientLifecycle({
    status: { active: false, label: "Inactive" },
    classes: [{ code: "CINCH", label: "" }],
    hasContactInfo: true,
    hasStartDate: false,
  });
  assert.equal(result, "needs_review");
});

test("an unrecognized class string never triggers the prospect signal via partial/substring matching", () => {
  assert.equal(hasProspectLifecycleSignal(["WAMcKinney Prospect Something Else"]), false);
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

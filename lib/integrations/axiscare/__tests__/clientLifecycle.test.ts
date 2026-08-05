import assert from "node:assert/strict";
import { classifyAxisCareClientLifecycle } from "../clientLifecycle.ts";

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

test("inactive with WAF Signed Agreement / No Visits class -> prospect, not inactive_client", () => {
  assert.equal(
    classifyAxisCareClientLifecycle({
      status: { active: false, label: "Inactive" },
      classes: [{ code: "WAF - Active No Visits", label: "WAF Signed Agreement / No Visits" }],
      hasContactInfo: true,
      hasStartDate: false,
    }),
    "prospect"
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

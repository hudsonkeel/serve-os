import assert from "node:assert/strict";
import {
  AxisCareClientCreateRequestSchema,
  AXISCARE_INACTIVE_STATUS,
  AXISCARE_CLIENTS_API_VERSION,
  AXISCARE_CLIENTS_PATH,
} from "../clientCreateRequest.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("the only two fields the checked-in AxisCare spec actually requires are firstName + lastName -- a minimal valid request has nothing else", () => {
  const parsed = AxisCareClientCreateRequestSchema.parse({ firstName: "Margaret", lastName: "Thompson" });
  assert.equal(parsed.firstName, "Margaret");
  assert.equal(parsed.lastName, "Thompson");
});

test("an empty firstName fails validation -- the spec requires it, this schema enforces it", () => {
  assert.throws(() => AxisCareClientCreateRequestSchema.parse({ firstName: "", lastName: "Thompson" }));
});

test("a missing lastName fails validation", () => {
  assert.throws(() => AxisCareClientCreateRequestSchema.parse({ firstName: "Margaret" }));
});

test("status accepts the object form { active, label } exactly as the spec's own response example uses", () => {
  const parsed = AxisCareClientCreateRequestSchema.parse({
    firstName: "Margaret",
    lastName: "Thompson",
    status: AXISCARE_INACTIVE_STATUS,
  });
  assert.deepEqual(parsed.status, { active: false, label: "Inactive" });
});

test("AXISCARE_INACTIVE_STATUS is the exact { active: false, label: 'Inactive' } shape -- never a bare string, never accidentally Active", () => {
  assert.deepEqual(AXISCARE_INACTIVE_STATUS, { active: false, label: "Inactive" });
});

test("residentialAddress requires streetAddress1/city/state/postalCode when the object is provided -- the spec types these as non-nullable strings within the object", () => {
  assert.throws(() =>
    AxisCareClientCreateRequestSchema.parse({
      firstName: "Margaret",
      lastName: "Thompson",
      residentialAddress: { streetAddress1: "123 Main St" }, // city/state/postalCode missing
    })
  );
});

test("a fully-specified residentialAddress validates, with name/streetAddress2 as the only genuinely optional sub-fields", () => {
  const parsed = AxisCareClientCreateRequestSchema.parse({
    firstName: "Margaret",
    lastName: "Thompson",
    residentialAddress: { streetAddress1: "123 Main St", city: "Frisco", state: "TX", postalCode: "75034" },
  });
  assert.equal(parsed.residentialAddress?.streetAddress1, "123 Main St");
});

test("no responsibleParties property is modeled anywhere in this schema -- AxisCare's create-client contract has no such field", () => {
  const shape = AxisCareClientCreateRequestSchema.shape;
  assert.ok(!("responsibleParties" in shape));
});

test("no community property is modeled anywhere in this schema -- absent from the spec's own POST /api/clients property list", () => {
  const shape = AxisCareClientCreateRequestSchema.shape;
  assert.ok(!("community" in shape));
});

test("the pinned API version and endpoint path match the checked-in spec", () => {
  assert.equal(AXISCARE_CLIENTS_API_VERSION, "2023-10-01");
  assert.equal(AXISCARE_CLIENTS_PATH, "/api/clients");
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

// node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/permissions.test.ts
import assert from "node:assert/strict";
import {
  canAccessWorkforceDocuments,
  canCorrectWorkforceIdentityLinks,
  canEditWorkforceCanonicalProfile,
  canEditWorkforceLegalIdentity,
  canManageWorkforceCommunityMemberships,
  canTriggerAxisCareSync,
} from "../permissions.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("canAccessWorkforceDocuments allows only admin and manager", () => {
  assert.equal(canAccessWorkforceDocuments("admin"), true);
  assert.equal(canAccessWorkforceDocuments("manager"), true);
  assert.equal(canAccessWorkforceDocuments("executive"), false);
  assert.equal(canAccessWorkforceDocuments("operations"), false);
  assert.equal(canAccessWorkforceDocuments(null), false);
  assert.equal(canAccessWorkforceDocuments(undefined), false);
  assert.equal(canAccessWorkforceDocuments(""), false);
});

test("canTriggerAxisCareSync allows only admin", () => {
  assert.equal(canTriggerAxisCareSync("admin"), true);
  assert.equal(canTriggerAxisCareSync("manager"), false);
  assert.equal(canTriggerAxisCareSync(null), false);
});

test("canCorrectWorkforceIdentityLinks allows only admin", () => {
  assert.equal(canCorrectWorkforceIdentityLinks("admin"), true);
  assert.equal(canCorrectWorkforceIdentityLinks("manager"), false);
  assert.equal(canCorrectWorkforceIdentityLinks(null), false);
});

test("canEditWorkforceCanonicalProfile allows admin and manager (preferred name, contact fields)", () => {
  assert.equal(canEditWorkforceCanonicalProfile("admin"), true);
  assert.equal(canEditWorkforceCanonicalProfile("manager"), true);
  assert.equal(canEditWorkforceCanonicalProfile("executive"), false);
  assert.equal(canEditWorkforceCanonicalProfile(null), false);
});

test("canEditWorkforceLegalIdentity allows only admin — a manager may request but not apply a legal-name correction", () => {
  assert.equal(canEditWorkforceLegalIdentity("admin"), true);
  assert.equal(canEditWorkforceLegalIdentity("manager"), false);
  assert.equal(canEditWorkforceLegalIdentity(null), false);
});

test("canManageWorkforceCommunityMemberships allows admin and manager", () => {
  assert.equal(canManageWorkforceCommunityMemberships("admin"), true);
  assert.equal(canManageWorkforceCommunityMemberships("manager"), true);
  assert.equal(canManageWorkforceCommunityMemberships("executive"), false);
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

// Pure-function tests for lib/intake/residentMatching.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { matchResident } from "../residentMatching.ts";
import type { ResidentMatchCandidate } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function candidate(overrides: Partial<ResidentMatchCandidate> = {}): ResidentMatchCandidate {
  return {
    id: "res-1",
    firstName: "Doris",
    lastName: "Kakazu",
    unitNumber: "9401",
    communityName: "Watermere at Frisco",
    externalSourceKey: null,
    ...overrides,
  };
}

test("1. exact external source key match wins immediately", () => {
  const result = matchResident(
    { externalSourceKey: "EXT-1", fullName: "Wrong Name" },
    [candidate({ id: "res-2", externalSourceKey: "EXT-1" })]
  );
  assert.deepEqual(result, { residentId: "res-2", reasonCode: "RESIDENT_EXACT_MATCH" });
});

test("2. exact resident ID match wins immediately", () => {
  const result = matchResident({ residentId: "res-1", fullName: null }, [candidate()]);
  assert.deepEqual(result, { residentId: "res-1", reasonCode: "RESIDENT_EXACT_MATCH" });
});

test("3. name + unit match, unique", () => {
  const result = matchResident({ fullName: "Doris Kakazu", unitNumber: "9401" }, [
    candidate(),
    candidate({ id: "res-other", firstName: "Someone", lastName: "Else", unitNumber: "1000" }),
  ]);
  assert.deepEqual(result, { residentId: "res-1", reasonCode: "RESIDENT_NAME_UNIT_MATCH" });
});

test("4. name + community match, unique", () => {
  const result = matchResident({ fullName: "Doris Kakazu", communityName: "Watermere at Frisco" }, [candidate()]);
  assert.deepEqual(result, { residentId: "res-1", reasonCode: "RESIDENT_NAME_UNIT_MATCH" });
});

test("5. unique name match alone (no unit/community given)", () => {
  const result = matchResident({ fullName: "Doris Kakazu" }, [candidate()]);
  assert.deepEqual(result, { residentId: "res-1", reasonCode: "RESIDENT_NAME_UNIT_MATCH" });
});

test("6. name matches multiple residents -> MULTIPLE_RESIDENT_MATCHES, never guesses", () => {
  const result = matchResident({ fullName: "John Smith" }, [
    candidate({ id: "a", firstName: "John", lastName: "Smith", unitNumber: "100" }),
    candidate({ id: "b", firstName: "John", lastName: "Smith", unitNumber: "200" }),
  ]);
  assert.deepEqual(result, { residentId: null, reasonCode: "MULTIPLE_RESIDENT_MATCHES" });
});

test("7. no name match at all -> RESIDENT_MATCH_REQUIRED", () => {
  const result = matchResident({ fullName: "Nobody Here" }, [candidate()]);
  assert.deepEqual(result, { residentId: null, reasonCode: "RESIDENT_MATCH_REQUIRED" });
});

test("8. no name at all -> INSUFFICIENT_RESIDENT_IDENTITY (never attempts a search)", () => {
  const result = matchResident({ fullName: null }, [candidate()]);
  assert.deepEqual(result, { residentId: null, reasonCode: "INSUFFICIENT_RESIDENT_IDENTITY" });
});

test("9. never fuzzy-matches on partial/similar names", () => {
  const result = matchResident({ fullName: "Dori Kakazu" }, [candidate()]);
  assert.equal(result.residentId, null);
});

test("10. name comparison is case-insensitive and trims whitespace", () => {
  const result = matchResident({ fullName: "  doris KAKAZU  " }, [candidate()]);
  assert.deepEqual(result, { residentId: "res-1", reasonCode: "RESIDENT_NAME_UNIT_MATCH" });
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

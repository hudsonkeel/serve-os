// Pure-function tests for ../sourceAuthority.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { sourceAuthorityLabel, sourceAuthorityRank } from "../sourceAuthority.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. the official roster ranks above the original CSV bulk import", () => {
  assert.ok(sourceAuthorityRank("Watermere official roster") > sourceAuthorityRank("Watermere resident roster CSV"));
});

test("2. human-confirmed ranks above every automated source", () => {
  assert.ok(sourceAuthorityRank("human-confirmed") > sourceAuthorityRank("Watermere official roster"));
  assert.ok(sourceAuthorityRank("human-confirmed") > sourceAuthorityRank("serve_os_manual"));
});

test("3. an unrecognized source system gets the default low rank, never crashes", () => {
  assert.equal(sourceAuthorityRank("some_future_vendor"), sourceAuthorityRank(null));
});

test("4. null source system gets the default rank", () => {
  assert.equal(sourceAuthorityRank(null), sourceAuthorityRank(undefined as unknown as null));
});

test("5. sourceAuthorityLabel passes through a known source unchanged", () => {
  assert.equal(sourceAuthorityLabel("Watermere official roster"), "Watermere official roster");
});

test("6. sourceAuthorityLabel flags an unranked source explicitly rather than silently treating it as trustworthy", () => {
  assert.ok(sourceAuthorityLabel("some_future_vendor").includes("unranked"));
});

test("7. sourceAuthorityLabel handles null", () => {
  assert.equal(sourceAuthorityLabel(null), "Unknown source");
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

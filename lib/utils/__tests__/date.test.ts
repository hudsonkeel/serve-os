import assert from "node:assert/strict";
import { formatCentralDateTime } from "../date.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("formats an ISO instant as 'Mon D, YYYY at H:MM AM/PM' in Central time", () => {
  // 2026-08-14T19:07:00Z = 2:07 PM Central (CDT, UTC-5) in August.
  const result = formatCentralDateTime("2026-08-14T19:07:00.000Z");
  assert.equal(result, "Aug 14, 2026 at 2:07 PM");
});

test("returns null for an unparseable input rather than throwing or showing 'Invalid Date'", () => {
  assert.equal(formatCentralDateTime("not-a-date"), null);
});

test("handles midnight/noon boundaries correctly", () => {
  // Midnight Central (CDT, UTC-5) = 05:00Z
  assert.equal(formatCentralDateTime("2026-08-15T05:00:00.000Z"), "Aug 15, 2026 at 12:00 AM");
  // Noon Central = 17:00Z
  assert.equal(formatCentralDateTime("2026-08-15T17:00:00.000Z"), "Aug 15, 2026 at 12:00 PM");
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

// Pins ResidentTimelineEventType against the intended migration
// vocabulary (supabase/migrations/20260818000000_add_resident_profile_update_event.sql,
// corrected against confirmed live data). This is the runtime half of
// drift prevention: RESIDENT_TIMELINE_EVENT_TYPES in lib/supabase/types.ts
// is already compiler-enforced to exactly match the ResidentTimelineEventType
// union (a missing or extra member is a type error on its own) — this
// test instead catches the case both drift together and are still wrong,
// by checking against an independently-written expected list.
import assert from "node:assert/strict";
import { RESIDENT_TIMELINE_EVENT_TYPES } from "../types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Independently transcribed from the corrected migration's CHECK
// constraint — not imported from types.ts, so this genuinely catches a
// wrong-but-internally-consistent union, not just a divergent one.
const EXPECTED_LIVE_VOCABULARY = [
  "current_needs_updated",
  "follow_up_updated",
  "resident_created",
  "working_note_created",
  "working_note_resolved",
  "relationship_conversion",
  "profile_updated",
];

test("RESIDENT_TIMELINE_EVENT_TYPES has exactly seven entries", () => {
  assert.equal(RESIDENT_TIMELINE_EVENT_TYPES.length, 7);
});

test("RESIDENT_TIMELINE_EVENT_TYPES contains every value from the corrected migration, and nothing else", () => {
  const actual = [...RESIDENT_TIMELINE_EVENT_TYPES].sort();
  const expected = [...EXPECTED_LIVE_VOCABULARY].sort();
  assert.deepEqual(actual, expected);
});

test("follow_up_updated specifically is present (the value the original migration draft omitted)", () => {
  assert.ok(RESIDENT_TIMELINE_EVENT_TYPES.includes("follow_up_updated"));
});

test("no duplicate values", () => {
  const unique = new Set(RESIDENT_TIMELINE_EVENT_TYPES);
  assert.equal(unique.size, RESIDENT_TIMELINE_EVENT_TYPES.length);
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

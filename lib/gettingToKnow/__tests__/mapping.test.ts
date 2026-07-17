// Pure-function tests for lib/gettingToKnow/mapping.ts. Run with:
//   npm run test:gettingToKnow
import assert from "node:assert/strict";
import {
  getDisplayGroupForInterestType,
  isConfirmedByResident,
  mapSimpleConfidenceToConfidence,
  mapSimpleLearnedTypeToInterestType,
  mapSimpleSourceToSourceType,
  SIMPLE_LEARNED_TYPE_OPTIONS,
} from "../mapping.ts";
import type { InterestType } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ALL_INTEREST_TYPES: InterestType[] = [
  "college",
  "sports_team",
  "hobby",
  "former_profession",
  "military_service",
  "hometown",
  "travel",
  "music",
  "books",
  "pets",
  "family",
  "community_activity",
  "food",
  "faith_or_tradition",
  "conversation_topic",
  "other",
];

// ─── Learned type → interest_type ─────────────────────────────────────

test("1. Favorite / Interest maps to hobby", () => {
  assert.equal(mapSimpleLearnedTypeToInterestType("favorite_interest"), "hobby");
});

test("2. Family / Important Person maps to family", () => {
  assert.equal(mapSimpleLearnedTypeToInterestType("family_important_person"), "family");
});

test("3. Conversation Cue maps to conversation_topic", () => {
  assert.equal(mapSimpleLearnedTypeToInterestType("conversation_cue"), "conversation_topic");
});

test("4. Preference, Routine, and Little Detail all fall back to 'other'", () => {
  assert.equal(mapSimpleLearnedTypeToInterestType("preference"), "other");
  assert.equal(mapSimpleLearnedTypeToInterestType("routine"), "other");
  assert.equal(mapSimpleLearnedTypeToInterestType("little_detail"), "other");
});

test("5. Every simple learned type maps to a valid, defined interest_type", () => {
  for (const option of SIMPLE_LEARNED_TYPE_OPTIONS) {
    const mapped = mapSimpleLearnedTypeToInterestType(option.value);
    assert.ok(ALL_INTEREST_TYPES.includes(mapped), `${option.value} -> ${mapped}`);
  }
});

// ─── Simple source → source_type ──────────────────────────────────────

test("6. Resident shared / Family shared map 1:1", () => {
  assert.equal(mapSimpleSourceToSourceType("resident_shared"), "resident_shared");
  assert.equal(mapSimpleSourceToSourceType("family_shared"), "family_shared");
});

test("7. Community staff shared maps to staff_conversation; Serve staff observed maps to staff_observation", () => {
  assert.equal(mapSimpleSourceToSourceType("community_staff_shared"), "staff_conversation");
  assert.equal(mapSimpleSourceToSourceType("serve_staff_observed"), "staff_observation");
});

test("8. Assessment maps to imported", () => {
  assert.equal(mapSimpleSourceToSourceType("assessment"), "imported");
});

// ─── Simple confidence → confidence + confirmed_by_resident ───────────

test("9. Observed -> unconfirmed, not confirmed by resident", () => {
  assert.equal(mapSimpleConfidenceToConfidence("observed"), "unconfirmed");
  assert.equal(isConfirmedByResident("observed"), false);
});

test("10. Shared by someone -> probable, not confirmed by resident", () => {
  assert.equal(mapSimpleConfidenceToConfidence("shared_by_someone"), "probable");
  assert.equal(isConfirmedByResident("shared_by_someone"), false);
});

test("11. Confirmed by resident -> confirmed, and is confirmed by resident", () => {
  assert.equal(mapSimpleConfidenceToConfidence("confirmed_by_resident"), "confirmed");
  assert.equal(isConfirmedByResident("confirmed_by_resident"), true);
});

// ─── interest_type → display group ────────────────────────────────────

test("12. Enjoys bucket covers hobby-like types", () => {
  for (const type of [
    "hobby",
    "sports_team",
    "music",
    "books",
    "food",
    "travel",
    "community_activity",
    "college",
  ] as InterestType[]) {
    assert.equal(getDisplayGroupForInterestType(type), "enjoys", type);
  }
});

test("13. Family bucket covers family and pets", () => {
  assert.equal(getDisplayGroupForInterestType("family"), "family");
  assert.equal(getDisplayGroupForInterestType("pets"), "family");
});

test("14. Conversation topic maps to the conversation_cue bucket", () => {
  assert.equal(getDisplayGroupForInterestType("conversation_topic"), "conversation_cue");
});

test("15. Background/catch-all types map to the preference bucket", () => {
  for (const type of [
    "hometown",
    "former_profession",
    "military_service",
    "faith_or_tradition",
    "other",
  ] as InterestType[]) {
    assert.equal(getDisplayGroupForInterestType(type), "preference", type);
  }
});

test("16. Every existing interest_type value resolves to exactly one display group", () => {
  for (const type of ALL_INTEREST_TYPES) {
    const group = getDisplayGroupForInterestType(type);
    assert.ok(
      ["enjoys", "family", "conversation_cue", "preference"].includes(group),
      `${type} -> ${group}`
    );
  }
});

test("17. Unknown/future interest_type values fall back to preference rather than throwing", () => {
  // @ts-expect-error deliberately testing a value outside the current union
  const group = getDisplayGroupForInterestType("some_future_type");
  assert.equal(group, "preference");
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

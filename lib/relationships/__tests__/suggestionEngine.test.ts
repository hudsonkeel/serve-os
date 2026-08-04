// Pure-function tests for ../suggestionEngine.ts — deterministic,
// never-fabricated suggestion generation for a logged Interaction. Run
// with: npm run test:relationships
import assert from "node:assert/strict";
import { generateInteractionSuggestions } from "../suggestionEngine.ts";
import type { GenerateSuggestionsInput } from "../suggestionEngine.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function baseInput(overrides: Partial<GenerateSuggestionsInput> = {}): GenerateSuggestionsInput {
  return {
    narrative: "",
    touchType: "call",
    interactionResult: null,
    hasExplicitNextAction: false,
    isResidentLinked: false,
    currentStage: "new_inquiry",
    existingResidentNeedsContent: "",
    ...overrides,
  };
}

test("1. blank narrative produces no suggestions at all", () => {
  const result = generateInteractionSuggestions(baseInput({ narrative: "   " }));
  assert.deepEqual(result, []);
});

test("2. a narrative always gets exactly one summary suggestion", () => {
  const result = generateInteractionSuggestions(baseInput({ narrative: "Spoke with Cary about pricing." }));
  const summaries = result.filter((s) => s.suggestionType === "summary");
  assert.equal(summaries.length, 1);
});

test("3. a narrative always gets exactly one working-note suggestion holding the full text", () => {
  const narrative = "Spoke with Cary about pricing. She'll think it over.";
  const result = generateInteractionSuggestions(baseInput({ narrative }));
  const notes = result.filter((s) => s.suggestionType === "working_note");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].payload.content, narrative);
});

test("4. a promise-like sentence produces a commitment suggestion", () => {
  const result = generateInteractionSuggestions(
    baseInput({ narrative: "Talked about the schedule. I will call back Thursday with pricing." }),
  );
  const commitments = result.filter((s) => s.suggestionType === "commitment");
  assert.equal(commitments.length, 1);
  assert.match(commitments[0].payload.description as string, /will call back Thursday/);
});

test("5. commitment responsible party defaults to 'serve' unless the sentence mentions family", () => {
  const serveResult = generateInteractionSuggestions(baseInput({ narrative: "I will send the pricing sheet today." }));
  assert.equal(serveResult.find((s) => s.suggestionType === "commitment")?.payload.responsiblePartyType, "serve");

  const familyResult = generateInteractionSuggestions(
    baseInput({ narrative: "The daughter agreed to discuss it with her mother this weekend." }),
  );
  assert.equal(familyResult.find((s) => s.suggestionType === "commitment")?.payload.responsiblePartyType, "family");
});

test("6. a sentence with no promise language produces no commitment suggestion", () => {
  const result = generateInteractionSuggestions(baseInput({ narrative: "We discussed the weather and the community events calendar." }));
  assert.equal(result.filter((s) => s.suggestionType === "commitment").length, 0);
});

test("7. a question in the narrative produces an open-question suggestion", () => {
  const result = generateInteractionSuggestions(
    baseInput({ narrative: "Had a good call. Does she still want the assessment scheduled for next week?" }),
  );
  const openLoops = result.filter((s) => s.suggestionType === "open_loop");
  assert.equal(openLoops.length, 1);
  assert.match(openLoops[0].payload.question as string, /still want the assessment/);
});

test("8. next-action suggested only when the result implies follow-up and none was already captured", () => {
  const withResult = generateInteractionSuggestions(
    baseInput({ narrative: "Left a message, no callback yet.", interactionResult: "follow_up_requested" }),
  );
  assert.equal(withResult.filter((s) => s.suggestionType === "next_action").length, 1);

  const alreadyHandled = generateInteractionSuggestions(
    baseInput({
      narrative: "Left a message, no callback yet.",
      interactionResult: "follow_up_requested",
      hasExplicitNextAction: true,
    }),
  );
  assert.equal(alreadyHandled.filter((s) => s.suggestionType === "next_action").length, 0);
});

test("9. next-action not suggested for a result that doesn't imply follow-up", () => {
  const result = generateInteractionSuggestions(baseInput({ narrative: "Great call.", interactionResult: "connected" }));
  assert.equal(result.filter((s) => s.suggestionType === "next_action").length, 0);
});

test("10. resident-need and service-opportunity suggestions only appear when resident-linked", () => {
  const narrative = "She mentioned needing medication reminders twice a day.";
  const external = generateInteractionSuggestions(baseInput({ narrative, isResidentLinked: false }));
  assert.equal(external.filter((s) => s.suggestionType === "resident_need").length, 0);
  assert.equal(external.filter((s) => s.suggestionType === "service_opportunity").length, 0);

  const residentLinked = generateInteractionSuggestions(baseInput({ narrative, isResidentLinked: true }));
  assert.ok(residentLinked.some((s) => s.suggestionType === "resident_need"));
});

test("11. resident-need suggestion is skipped when already represented in existing needs", () => {
  const narrative = "She mentioned needing medication reminders.";
  const result = generateInteractionSuggestions(
    baseInput({
      narrative,
      isResidentLinked: true,
      existingResidentNeedsContent: "Resident receives medication reminders daily.",
    }),
  );
  assert.equal(result.filter((s) => s.suggestionType === "resident_need").length, 0);
});

test("12. resident-need suggestions never fabricate a diagnosis", () => {
  const result = generateInteractionSuggestions(
    baseInput({ narrative: "She said her legs are bad and she cannot walk without her walker.", isResidentLinked: true }),
  );
  const needs = result.filter((s) => s.suggestionType === "resident_need");
  assert.ok(needs.length > 0);
  for (const need of needs) {
    assert.ok(!/diagnos/i.test(need.payload.sentence as string));
  }
});

test("13. stage-change suggested only when the result implies real movement and differs from current stage", () => {
  const moves = generateInteractionSuggestions(
    baseInput({ narrative: "She confirmed she wants to start service.", interactionResult: "service_interest_confirmed", currentStage: "discovery" }),
  );
  assert.equal(moves.find((s) => s.suggestionType === "stage_change")?.payload.toStage, "ready_to_start");

  const alreadyThere = generateInteractionSuggestions(
    baseInput({ narrative: "Confirmed again.", interactionResult: "service_interest_confirmed", currentStage: "ready_to_start" }),
  );
  assert.equal(alreadyThere.filter((s) => s.suggestionType === "stage_change").length, 0);
});

test("14. no stage-change suggestion for a result with no stage mapping", () => {
  const result = generateInteractionSuggestions(baseInput({ narrative: "Sent the pricing sheet.", interactionResult: "information_sent" }));
  assert.equal(result.filter((s) => s.suggestionType === "stage_change").length, 0);
});

test("15. generation is deterministic — same input twice produces identical output", () => {
  const input = baseInput({
    narrative: "I will call back Thursday. Does she want the assessment scheduled? She needs medication reminders.",
    interactionResult: "follow_up_requested",
    isResidentLinked: true,
  });
  const a = generateInteractionSuggestions(input);
  const b = generateInteractionSuggestions(input);
  assert.deepEqual(a, b);
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

// Pure-function tests for ../dedup.ts — the Working Note idempotency
// mechanism (no dedicated import/source column exists on
// resident_working_notes or relationship_working_notes, so provenance is
// embedded as a stable content tag). Run with:
//   npm run test:importResidentSourceNotes
import assert from "node:assert/strict";
import { hasImportTag, importTag, withImportTag } from "../dedup.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. importTag is deterministic for the same source/record", () => {
  assert.equal(
    importTag("resident_service_needs_photo_2026_07", 3),
    importTag("resident_service_needs_photo_2026_07", 3)
  );
});

test("2. importTag differs by record index", () => {
  assert.notEqual(
    importTag("resident_service_needs_photo_2026_07", 3),
    importTag("resident_service_needs_photo_2026_07", 4)
  );
});

test("3. withImportTag embeds the tag at the start of content", () => {
  const tagged = withImportTag("watermere_whiteboard_photo_2026_06_07", 6, "Some note body.");
  assert.ok(tagged.startsWith("[Import: watermere_whiteboard_photo_2026_06_07 #6]"));
  assert.ok(tagged.includes("Some note body."));
});

test("4. hasImportTag detects a previously-imported record (idempotency)", () => {
  const tagged = withImportTag("resident_service_needs_photo_2026_07", 1, "Shared needs note.");
  assert.equal(hasImportTag([tagged], "resident_service_needs_photo_2026_07", 1), true);
});

test("5. hasImportTag returns false when no existing note carries the tag (first run)", () => {
  assert.equal(hasImportTag(["An unrelated working note."], "resident_service_needs_photo_2026_07", 1), false);
});

test("6. hasImportTag does not cross-match a different record index from the same source", () => {
  const tagged = withImportTag("resident_service_needs_photo_2026_07", 1, "Note for record 1.");
  assert.equal(hasImportTag([tagged], "resident_service_needs_photo_2026_07", 2), false);
});

test("7. hasImportTag does not cross-match a different source with the same record index", () => {
  const tagged = withImportTag("resident_service_needs_photo_2026_07", 6, "Note for source 1 record 6.");
  assert.equal(hasImportTag([tagged], "watermere_whiteboard_photo_2026_06_07", 6), false);
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

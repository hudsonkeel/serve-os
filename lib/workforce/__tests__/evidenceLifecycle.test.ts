// Pure-function tests for the Evidence Management workflow's decision
// logic — see lib/workforce/evidenceLifecycle.ts. These functions mirror
// (but do not replace) the DB-level guarantees in
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql
// (assert_verified_evidence_immutable, reassign_unverified_evidence_subject,
// delete_unverified_evidence_and_document, assert_evidence_supersession_same_subject_and_requirement).
// The migration has not been applied against a live database in this
// environment (see the AxisCare integration doc's own note that no DB
// connection is available here), so these tests verify the same rules at
// the layer that's actually executable: the pure decision functions both
// the UI and the server actions call before ever reaching the DB.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/evidenceLifecycle.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildLifecycleTransitionPatch,
  buildSupersedingEvidenceIdentity,
  canEditInPlace,
  canHardDelete,
  canMarkEnteredInError,
  canReassign,
  canSupersede,
  getAvailableEvidenceActions,
  isEffectivelyExpired,
  resolveSupersedeEventType,
} from "../evidenceLifecycle.ts";
import type { PersonEvidence } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function evidence(overrides: Partial<PersonEvidence> = {}): PersonEvidence {
  return {
    id: "ev-1",
    subject_type: "workforce_member",
    subject_id: "member-1",
    requirement_id: "req-nar",
    document_id: "doc-1",
    verification_status: "unverified",
    lifecycle_status: "active",
    lifecycle_status_reason: null,
    lifecycle_status_changed_by: null,
    lifecycle_status_changed_at: null,
    result: null,
    source_system: "manual_upload",
    performed_at: null,
    effective_date: null,
    review_due_date: null,
    expiration_date: null,
    entered_by: "staff@example.com",
    verified_by: null,
    verified_at: null,
    notes: null,
    supersedes_evidence_id: null,
    numeric_score: null,
    authoritative_source_system: null,
    collection_method: null,
    verification_method: null,
    attestation_result: null,
    external_reference: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── 1. Editing unverified metadata ───────────────────────────────────────
test("canEditInPlace: unverified evidence may be edited in place", () => {
  assert.equal(canEditInPlace(evidence({ verification_status: "unverified" })), true);
});

test("getAvailableEvidenceActions: unverified evidence offers edit_details, reassign, and delete", () => {
  const actions = getAvailableEvidenceActions(evidence({ verification_status: "unverified" }));
  assert.deepEqual(actions, ["edit_details", "reassign", "delete"]);
});

// ─── 2. Reassigning unverified evidence atomically ────────────────────────
test("canReassign: unverified evidence with no supersession chain may be reassigned", () => {
  assert.equal(canReassign(evidence({ verification_status: "unverified", supersedes_evidence_id: null })), true);
});

test("canReassign: refuses a record that is itself a superseding replacement", () => {
  assert.equal(
    canReassign(evidence({ verification_status: "unverified", supersedes_evidence_id: "ev-old" })),
    false
  );
});

test("canReassign: refuses once verified — reassignment is unverified-only, matching reassign_unverified_evidence_subject()'s own guard", () => {
  assert.equal(canReassign(evidence({ verification_status: "verified" })), false);
});

// ─── 3. Preventing edits to verified evidence ─────────────────────────────
test("canEditInPlace: refuses verified evidence", () => {
  assert.equal(canEditInPlace(evidence({ verification_status: "verified" })), false);
});

test("canEditInPlace: refuses rejected evidence — a settled judgment either way", () => {
  assert.equal(canEditInPlace(evidence({ verification_status: "rejected" })), false);
});

test("getAvailableEvidenceActions: settled, current evidence offers only replace/correct/mark_entered_in_error — never edit_details", () => {
  const actions = getAvailableEvidenceActions(evidence({ verification_status: "verified", lifecycle_status: "active" }));
  assert.deepEqual(actions, ["replace", "correct", "mark_entered_in_error"]);
  assert.equal(actions.includes("edit_details"), false);
});

// ─── 4. Replacing expired evidence ────────────────────────────────────────
test("isEffectivelyExpired: a past expiration_date is expired even when lifecycle_status column still says active", () => {
  const e = evidence({ verification_status: "verified", lifecycle_status: "active", expiration_date: "2020-01-01" });
  assert.equal(isEffectivelyExpired(e), true);
});

test("isEffectivelyExpired: a future expiration_date is not expired", () => {
  const e = evidence({ verification_status: "verified", lifecycle_status: "active", expiration_date: "2099-01-01" });
  assert.equal(isEffectivelyExpired(e), false);
});

test("canSupersede: an effectively-expired-but-still-active record may still be superseded (renewed)", () => {
  const e = evidence({ verification_status: "verified", lifecycle_status: "active", expiration_date: "2020-01-01" });
  assert.equal(canSupersede(e), true);
});

test("getAvailableEvidenceActions: expired evidence offers upload_renewal and view_history only", () => {
  const e = evidence({ verification_status: "verified", lifecycle_status: "active", expiration_date: "2020-01-01" });
  assert.deepEqual(getAvailableEvidenceActions(e), ["upload_renewal", "view_history"]);
});

test("resolveSupersedeEventType: renewal produces evidence_renewed, everything else produces evidence_replaced", () => {
  assert.equal(resolveSupersedeEventType("renew"), "evidence_renewed");
  assert.equal(resolveSupersedeEventType("replace"), "evidence_replaced");
  assert.equal(resolveSupersedeEventType("correct"), "evidence_replaced");
  assert.equal(resolveSupersedeEventType("supersede"), "evidence_replaced");
});

// ─── 5. Preserving verified_by/verified_at on superseded evidence ────────
test("buildLifecycleTransitionPatch: a supersede transition never includes verification_status, verified_by, or verified_at", () => {
  const patch = buildLifecycleTransitionPatch("superseded", "manager@example.com", "Annual recheck renewal", () => "2026-06-01T00:00:00Z");
  const keys = Object.keys(patch);
  assert.deepEqual(keys.sort(), [
    "lifecycle_status",
    "lifecycle_status_changed_at",
    "lifecycle_status_changed_by",
    "lifecycle_status_reason",
  ]);
  assert.equal("verification_status" in patch, false);
  assert.equal("verified_by" in patch, false);
  assert.equal("verified_at" in patch, false);
  assert.equal("result" in patch, false);
});

test("buildLifecycleTransitionPatch: records the exact status, actor, reason, and timestamp requested", () => {
  const patch = buildLifecycleTransitionPatch("entered_in_error", "admin@example.com", "Wrong caregiver", () => "2026-06-02T00:00:00Z");
  assert.equal(patch.lifecycle_status, "entered_in_error");
  assert.equal(patch.lifecycle_status_changed_by, "admin@example.com");
  assert.equal(patch.lifecycle_status_reason, "Wrong caregiver");
  assert.equal(patch.lifecycle_status_changed_at, "2026-06-02T00:00:00Z");
});

// ─── 6. Preventing cross-subject (and cross-requirement) replacement ─────
test("buildSupersedingEvidenceIdentity: always copies subject and requirement from the record being replaced", () => {
  const old = evidence({ subject_id: "member-42", requirement_id: "req-emr" });
  const identity = buildSupersedingEvidenceIdentity(old);
  assert.deepEqual(identity, {
    subjectType: "workforce_member",
    subjectId: "member-42",
    requirementId: "req-emr",
  });
});

test("buildSupersedingEvidenceIdentity: return value has no way to express a different subject than the source record — structurally, not just by convention", () => {
  const old = evidence({ subject_id: "member-1", requirement_id: "req-nar" });
  const identity = buildSupersedingEvidenceIdentity(old);
  // The function's only input is the old record — there is no parameter
  // through which a caller could supply a different subject/requirement.
  assert.equal(buildSupersedingEvidenceIdentity.length, 1);
  assert.equal(identity.subjectId, old.subject_id);
  assert.equal(identity.requirementId, old.requirement_id);
});

// ─── 7. Preventing hard deletion of verified evidence ─────────────────────
test("canHardDelete: an unverified, never-relied-upon upload may be deleted", () => {
  assert.equal(canHardDelete(evidence({ verification_status: "unverified" }), false), true);
});

test("canHardDelete: refuses verified evidence regardless of whether anything supersedes it", () => {
  assert.equal(canHardDelete(evidence({ verification_status: "verified" }), false), false);
  assert.equal(canHardDelete(evidence({ verification_status: "verified" }), true), false);
});

test("canHardDelete: refuses rejected evidence too — settled judgments are never hard-deletable", () => {
  assert.equal(canHardDelete(evidence({ verification_status: "rejected" }), false), false);
});

test("canHardDelete: refuses an unverified record that has already been relied upon (something supersedes it)", () => {
  assert.equal(canHardDelete(evidence({ verification_status: "unverified" }), true), false);
});

// ─── mark entered in error: only for settled, current records ────────────
test("canMarkEnteredInError: available for verified, currently-active evidence", () => {
  assert.equal(canMarkEnteredInError(evidence({ verification_status: "verified", lifecycle_status: "active" })), true);
});

test("canMarkEnteredInError: unavailable for unverified evidence (use delete instead)", () => {
  assert.equal(canMarkEnteredInError(evidence({ verification_status: "unverified" })), false);
});

test("canMarkEnteredInError: unavailable once already superseded or entered in error", () => {
  assert.equal(canMarkEnteredInError(evidence({ verification_status: "verified", lifecycle_status: "superseded" })), false);
  assert.equal(canMarkEnteredInError(evidence({ verification_status: "verified", lifecycle_status: "entered_in_error" })), false);
});

// ─── 8. Complete audit-event creation ─────────────────────────────────────
// Every Evidence Management event type named in the DB's
// workforce_activity_event_type_check must actually be fired somewhere in
// the actions layer — a static, file-scanning check, same style as this
// repo's existing AXISCARE_SCHEDULE_ENABLED file-scan test.
test("every Evidence Management workforce_activity event type is fired somewhere in lib/actions/workforce.ts", () => {
  const actionsFile = path.resolve(import.meta.dirname, "../../actions/workforce.ts");
  const source = fs.readFileSync(actionsFile, "utf8");

  const requiredEventTypes = [
    "document_metadata_corrected",
    "document_reassigned",
    "accidental_upload_removed",
    "evidence_corrected",
    "evidence_marked_entered_in_error",
    "evidence_replaced", // via resolveSupersedeEventType(), not a literal
    "evidence_renewed", // via resolveSupersedeEventType(), not a literal
  ];

  // evidence_replaced/evidence_renewed are produced by
  // resolveSupersedeEventType() rather than written as literals in
  // workforce.ts — confirm that function call is present instead of the
  // literal strings for those two.
  const literalsToCheck = requiredEventTypes.filter((t) => t !== "evidence_replaced" && t !== "evidence_renewed");
  const missingLiterals = literalsToCheck.filter((eventType) => !source.includes(`"${eventType}"`));
  assert.deepEqual(missingLiterals, [], `Missing eventType literal(s) in lib/actions/workforce.ts: ${missingLiterals.join(", ")}`);

  assert.ok(
    source.includes("resolveSupersedeEventType"),
    "lib/actions/workforce.ts must call resolveSupersedeEventType() to fire evidence_replaced/evidence_renewed"
  );
});

test("every mutating Evidence Management action calls recordWorkforceActivity", () => {
  const actionsFile = path.resolve(import.meta.dirname, "../../actions/workforce.ts");
  const source = fs.readFileSync(actionsFile, "utf8");

  const actionFunctions = [
    "supersedeWorkforceEvidence",
    "markWorkforceEvidenceEnteredInError",
    "updateUnverifiedWorkforceEvidenceDetails",
    "reassignWorkforceEvidence",
    "deleteAccidentalWorkforceUpload",
  ];

  for (const fnName of actionFunctions) {
    const fnStart = source.indexOf(`export async function ${fnName}`);
    assert.ok(fnStart >= 0, `${fnName} not found in lib/actions/workforce.ts`);
    // Look from the function signature to the start of the *next* exported
    // function (or end of file) for a recordWorkforceActivity call — every
    // one of these functions ends with at least one such call on its
    // success path.
    const nextFnStart = source.indexOf("\nexport async function ", fnStart + 1);
    const window = source.slice(fnStart, nextFnStart === -1 ? source.length : nextFnStart);
    assert.ok(window.includes("recordWorkforceActivity"), `${fnName} does not call recordWorkforceActivity`);
  }
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

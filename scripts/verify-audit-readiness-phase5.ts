// Live Supabase verification for the Audit Readiness Operational UX
// Correction pass — specifically Governed Correction Mode's schema:
// audit_session_corrections / audit_session_item_corrections and the RPC
// add_audit_session_correction() (supabase/migrations/
// 20260902060000_add_audit_session_corrections.sql). Everything else in
// this pass (dashboard employee-level readiness/percentages, Needs
// Attention cards, evidence navigation, the review-and-lock summary) is
// either a pure function or a read composed entirely from functions
// Phase 4's own live verification already proved — this script does not
// re-prove those.
//
// REQUIRES 20260902060000 to be applied first — this script will fail
// immediately, with a clear message, if it isn't (it does not attempt to
// apply it itself).
//
// Unlike phase4's script, Correction Mode never touches
// workforce_compliance_actions/compliance_corrective_actions at all (by
// design — corrective-action resolution and audit correction are
// deliberately separate, unlinked mechanisms), so there is no collision
// risk against a real member's real open corrective actions here. This
// script still only ever writes its own test sessions/items/corrections,
// tagged with a deterministic generateTestMarker() value, and cleans up
// everything it creates.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-audit-readiness-phase5.ts
import { randomUUID } from "node:crypto";
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { addAuditSessionCorrection, type ItemCorrectionInput } from "../lib/data/auditSessionCorrections.ts";
import { getCorrectedSessionView } from "../lib/compliance/auditDrillView.ts";
import { listWorkforceMembers } from "../lib/data/workforceMembers.ts";
import { getWorkforceMemberProfile } from "../lib/workforce/roster.ts";

const RUN_MARKER = generateTestMarker("audit-readiness-phase5-verify");
const ACTOR = RUN_MARKER;

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

async function cleanupSession(supabase: ReturnType<typeof createServerClient>, sessionId: string) {
  const { data: corrections } = await supabase.from("audit_session_corrections").select("id").eq("session_id", sessionId);
  for (const c of corrections ?? []) {
    await supabase.from("audit_session_item_corrections").delete().eq("correction_id", c.id);
  }
  await supabase.from("audit_session_corrections").delete().eq("session_id", sessionId);
  await supabase.from("audit_session_items").delete().eq("session_id", sessionId);
  await supabase.from("audit_sessions").delete().eq("id", sessionId);
}

async function main() {
  const supabase = createServerClient();

  const preflight = await supabase.from("audit_session_corrections").select("id").limit(1);
  if (preflight.error) {
    console.error(
      "\naudit_session_corrections is not queryable — migration 20260902060000_add_audit_session_corrections.sql " +
        "has not been applied to this environment yet. Apply it, then re-run this script.\n",
      preflight.error.message
    );
    process.exit(1);
  }

  // ─── Section: rejects a non-completed session ───────────────────────────
  console.log("\n== add_audit_session_correction: non-completed session is rejected ==");

  let draftSessionId: string | undefined;
  try {
    const { data: draftSession, error: draftError } = await supabase
      .from("audit_sessions")
      .insert({ name: RUN_MARKER, description: RUN_MARKER, scope_domains: ["workforce"], auditor: ACTOR, created_by: ACTOR, status: "in_progress" })
      .select("id")
      .single();
    check("draft/in_progress test session created", !draftError && !!draftSession, draftError);
    draftSessionId = draftSession?.id as string | undefined;

    if (draftSessionId) {
      const { error: rejectError } = await supabase.rpc("add_audit_session_correction", {
        p_session_id: draftSessionId,
        p_actor: ACTOR,
        p_rationale: RUN_MARKER,
        p_item_corrections: [
          {
            audit_session_item_id: null,
            change_type: "added",
            requirement_id: randomUUID(),
            subject_type: "workforce_member",
            subject_id: randomUUID(),
            previous_finding: null,
            previous_notes: null,
            new_finding: "pass",
            new_notes: null,
          },
        ],
      });
      check(
        "correcting a session that is not completed is rejected",
        !!rejectError && (rejectError.message ?? "").includes("is not completed"),
        rejectError
      );
    }

    const { error: notFoundError } = await supabase.rpc("add_audit_session_correction", {
      p_session_id: randomUUID(),
      p_actor: ACTOR,
      p_rationale: RUN_MARKER,
      p_item_corrections: [
        {
          audit_session_item_id: null,
          change_type: "added",
          requirement_id: randomUUID(),
          subject_type: "workforce_member",
          subject_id: randomUUID(),
          previous_finding: null,
          previous_notes: null,
          new_finding: "pass",
          new_notes: null,
        },
      ],
    });
    check("correcting a nonexistent session is rejected", !!notFoundError && (notFoundError.message ?? "").includes("not found"), notFoundError);
  } finally {
    if (draftSessionId) await cleanupSession(supabase, draftSessionId);
  }

  // ─── Section: real completed session — required-field + FK guards, then
  // the happy path (edited + removed + added in one correction) ──────────
  console.log("\n== Building a real completed test session ==");

  const members = await listWorkforceMembers();
  if (members.length === 0) {
    console.log("skipped remaining sections — no workforce_members exist in this environment");
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exit(1);
    return;
  }
  const memberId = members[0].id;
  const profile = await getWorkforceMemberProfile(memberId);
  const requirements = profile?.employeeRecordAudit.registry.requirements ?? [];
  if (requirements.length < 3) {
    console.log("skipped remaining sections — chosen member has fewer than 3 evaluable requirements");
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exit(1);
    return;
  }
  const [reqToEdit, reqToRemove, reqToAdd] = requirements;

  let sessionId: string | undefined;
  try {
    const { data: session, error: sessionError } = await supabase
      .from("audit_sessions")
      .insert({ name: RUN_MARKER, description: RUN_MARKER, scope_domains: ["workforce"], auditor: ACTOR, created_by: ACTOR, status: "in_progress" })
      .select("id")
      .single();
    check("test session created", !sessionError && !!session, sessionError);
    sessionId = session?.id as string | undefined;
    if (!sessionId) return;

    const { data: itemToEdit, error: editItemError } = await supabase
      .from("audit_session_items")
      .insert({
        session_id: sessionId,
        requirement_id: reqToEdit.requirement.id,
        subject_type: "workforce_member",
        subject_id: memberId,
        finding: "fail",
        notes: `${RUN_MARKER} original`,
        created_by: ACTOR,
      })
      .select("id")
      .single();
    check("item to be edited recorded", !editItemError && !!itemToEdit, editItemError);

    const { data: itemToRemove, error: removeItemError } = await supabase
      .from("audit_session_items")
      .insert({
        session_id: sessionId,
        requirement_id: reqToRemove.requirement.id,
        subject_type: "workforce_member",
        subject_id: memberId,
        finding: "fail",
        notes: `${RUN_MARKER} entered in error`,
        created_by: ACTOR,
      })
      .select("id")
      .single();
    check("item to be removed recorded", !removeItemError && !!itemToRemove, removeItemError);

    const { error: completeError } = await supabase.rpc("complete_audit_session", {
      p_session_id: sessionId,
      p_summary: RUN_MARKER,
      p_actor: ACTOR,
    });
    check("test session completed", !completeError, completeError);

    // ─── Required-field and FK guards, against the real completed session ──
    console.log("\n== add_audit_session_correction: required-field + FK guards ==");

    const validItem = {
      audit_session_item_id: itemToEdit?.id ?? null,
      change_type: "edited",
      requirement_id: reqToEdit.requirement.id,
      subject_type: "workforce_member",
      subject_id: memberId,
      previous_finding: "fail",
      previous_notes: `${RUN_MARKER} original`,
      new_finding: "pass",
      new_notes: `${RUN_MARKER} corrected`,
    };

    const { error: blankActorError } = await supabase.rpc("add_audit_session_correction", {
      p_session_id: sessionId,
      p_actor: "   ",
      p_rationale: RUN_MARKER,
      p_item_corrections: [validItem],
    });
    check("a blank actor is rejected", !!blankActorError && (blankActorError.message ?? "").includes("actor"), blankActorError);

    const { error: blankRationaleError } = await supabase.rpc("add_audit_session_correction", {
      p_session_id: sessionId,
      p_actor: ACTOR,
      p_rationale: "",
      p_item_corrections: [validItem],
    });
    check("a blank rationale is rejected", !!blankRationaleError && (blankRationaleError.message ?? "").includes("rationale"), blankRationaleError);

    const { error: emptyArrayError } = await supabase.rpc("add_audit_session_correction", {
      p_session_id: sessionId,
      p_actor: ACTOR,
      p_rationale: RUN_MARKER,
      p_item_corrections: [],
    });
    check("an empty item-corrections array is rejected", !!emptyArrayError && (emptyArrayError.message ?? "").includes("At least one"), emptyArrayError);

    const { error: badFkError } = await supabase.rpc("add_audit_session_correction", {
      p_session_id: sessionId,
      p_actor: ACTOR,
      p_rationale: RUN_MARKER,
      p_item_corrections: [{ ...validItem, audit_session_item_id: randomUUID() }],
    });
    check(
      "an audit_session_item_id that doesn't belong to this session is rejected",
      !!badFkError && (badFkError.message ?? "").includes("does not belong to"),
      badFkError
    );

    // ─── Happy path: one edited + one removed + one added, in one call ─────
    console.log("\n== add_audit_session_correction: happy path (edited + removed + added) ==");

    const itemCorrections: ItemCorrectionInput[] = [
      {
        auditSessionItemId: itemToEdit!.id,
        changeType: "edited",
        requirementId: reqToEdit.requirement.id,
        subjectType: "workforce_member",
        subjectId: memberId,
        previousFinding: "fail",
        previousNotes: `${RUN_MARKER} original`,
        newFinding: "pass",
        newNotes: `${RUN_MARKER} corrected`,
      },
      {
        auditSessionItemId: itemToRemove!.id,
        changeType: "removed",
        requirementId: reqToRemove.requirement.id,
        subjectType: "workforce_member",
        subjectId: memberId,
        previousFinding: "fail",
        previousNotes: `${RUN_MARKER} entered in error`,
        newFinding: null,
        newNotes: null,
      },
      {
        auditSessionItemId: null,
        changeType: "added",
        requirementId: reqToAdd.requirement.id,
        subjectType: "workforce_member",
        subjectId: memberId,
        previousFinding: null,
        previousNotes: null,
        newFinding: "needs_review",
        newNotes: `${RUN_MARKER} added`,
      },
    ];

    const { correction, error: correctionError } = await addAuditSessionCorrection({
      sessionId,
      actor: ACTOR,
      rationale: `${RUN_MARKER} — correcting a mis-recorded finding`,
      itemCorrections,
    });
    check("the multi-item correction succeeds", !correctionError && !!correction, correctionError);

    // ─── getCorrectedSessionView reflects all three changes ────────────────
    console.log("\n== getCorrectedSessionView ==");

    const view = await getCorrectedSessionView(sessionId);
    const editedEntry = view.items.find((v) => v.item?.id === itemToEdit?.id);
    check("the edited item's effective finding is the corrected value", editedEntry?.effectiveFinding === "pass", editedEntry);
    check("the edited item is flagged isCorrected", editedEntry?.isCorrected === true, editedEntry);
    check("the edited item's original finding is still readable off the raw item", editedEntry?.item?.finding === "fail", editedEntry?.item);

    const removedEntry = view.items.find((v) => v.item?.id === itemToRemove?.id);
    check("the removed item is flagged isRemoved", removedEntry?.isRemoved === true, removedEntry);
    check(
      "the removed item's original values are still present for history, not deleted",
      removedEntry?.item?.finding === "fail" && removedEntry?.item?.notes === `${RUN_MARKER} entered in error`,
      removedEntry?.item
    );

    const addedEntry = view.items.find((v) => v.isAdded && v.requirement?.id === reqToAdd.requirement.id);
    check("the added finding appears, flagged isAdded, with no original item", addedEntry?.item === null, addedEntry);
    check("the added finding's effective finding matches what was submitted", addedEntry?.effectiveFinding === "needs_review", addedEntry);

    const effectiveIds = view.items.filter((v) => !v.isRemoved).map((v) => v.item?.id ?? "added");
    check(
      "the effective (non-removed) set excludes the removed item and includes the edited + added ones",
      !effectiveIds.includes(itemToRemove!.id) && effectiveIds.includes(itemToEdit!.id) && effectiveIds.includes("added"),
      effectiveIds
    );

    check("exactly one correction event is recorded for this session", view.corrections.length === 1, view.corrections);
    check("the correction event's rationale is preserved", view.corrections[0]?.rationale.includes(RUN_MARKER), view.corrections[0]);
  } finally {
    console.log("\n== Cleanup ==");
    if (sessionId) {
      await cleanupSession(supabase, sessionId);
      check("cleanup completed without throwing", true);
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Phase 5 verification crashed:", err);
  process.exit(1);
});

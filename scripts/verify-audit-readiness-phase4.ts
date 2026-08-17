// Live Supabase verification for Audit Readiness v0.1 Phase 4 (the Audit
// Drill UI + its supporting composition/data-layer additions:
// lib/compliance/auditDrillView.ts, getComplianceCorrectiveActionById(),
// and the workforce-native corrective-action path
// createWorkforceCorrectiveActionFromFindingAction wraps).
//
// Follows this codebase's established live-verification convention (see
// scripts/verify-audit-readiness-phase1a.ts): every write is tagged with a
// deterministic generateTestMarker() value and deleted before this script
// exits. Exercises lib/data + lib/compliance functions directly (the same
// functions app/audit-readiness/drills/* calls) rather than the "use
// server" action wrappers in lib/actions/auditReadiness.ts, which depend on
// a Next.js request-scoped auth session that does not exist when run as a
// standalone script — every prior verify script in this series has the
// same scope boundary. The manual browser walkthrough (this phase's other
// required verification step) is what proves the action layer's
// permission/existence checks end-to-end.
//
// Uses one real, existing workforce_member (read-only pick) rather than a
// fabricated one — amendment 2's existence check is specifically about
// accepting a real subject and rejecting a fake one, so a fabricated
// subject would prove nothing.
//
// SAFETY: syncComplianceAction() is an idempotent upsert-by-issue — if the
// chosen (member, requirement) pair already has a real open
// workforce_compliance_actions row (this environment's seeded members
// mostly do, across most of the 11 Employee Record Audit requirements),
// this call returns/touches that REAL row, not a fresh one, and this
// script's cleanup must never delete it. This script therefore only
// exercises the corrective-action-creation path against a requirement it
// has first confirmed has NO existing open action for the chosen member,
// and only ever deletes the resulting row after confirming its created_at
// is from this run — never a pre-existing row. If no collision-free
// requirement exists for this member, that section is skipped with a
// message rather than risk touching real data.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-audit-readiness-phase4.ts
import { randomUUID } from "node:crypto";
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { getWorkforceMemberById, listWorkforceMembers } from "../lib/data/workforceMembers.ts";
import { getAuditSessionById, getAuditSessionItems, recordAuditSessionItem } from "../lib/data/auditSessions.ts";
import { syncComplianceAction } from "../lib/data/workforceComplianceActions.ts";
import {
  composeAuditSessionItemView,
  getAuditDrillScopeOptions,
  getRequirementsForSubject,
} from "../lib/compliance/auditDrillView.ts";

const RUN_MARKER = generateTestMarker("audit-readiness-phase4-verify");
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

async function main() {
  const supabase = createServerClient();

  // ─── Section: amendment 2's underlying existence-check primitive ───────
  console.log("\n== Subject-existence check primitive ==");

  const fakeMember = await getWorkforceMemberById(randomUUID());
  check("a random, non-existent workforce_member id resolves null", fakeMember === null, fakeMember);

  const members = await listWorkforceMembers();
  if (members.length === 0) {
    console.log("skipped remaining sections — no workforce_members exist in this environment");
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exit(1);
    return;
  }
  const realMemberId = members[0].id;
  const realMember = await getWorkforceMemberById(realMemberId);
  check("a real workforce_member id resolves the row (the same lookup the amendment-2 guard uses)", !!realMember, realMemberId);

  // ─── Section: getAuditDrillScopeOptions / getRequirementsForSubject ────
  console.log("\n== auditDrillView composition (read-only) ==");

  const scopeOptions = await getAuditDrillScopeOptions();
  const workforceScope = scopeOptions.find((o) => o.domainId === "workforce");
  check("workforce scope option is configured", workforceScope?.configured === true, workforceScope);
  check("emergency_preparedness scope option is honestly not configured (no seeded requirements yet)", scopeOptions.find((o) => o.domainId === "emergency_preparedness")?.configured === false);
  check("client_readiness scope option is honestly not configured (no seeded requirements yet)", scopeOptions.find((o) => o.domainId === "client_readiness")?.configured === false);

  const { subjectLabel, requirements, openComplianceActions } = await getRequirementsForSubject("workforce_member", realMemberId);
  check("getRequirementsForSubject returns a non-empty subject label", subjectLabel.length > 0, subjectLabel);
  check(
    "getRequirementsForSubject returns the 11-requirement Employee Record Audit set, not the narrower 2-requirement registry",
    requirements.length === 11,
    requirements.length
  );
  if (requirements.length === 0) {
    console.log("skipped remaining sections — subject has no evaluable requirements");
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exit(1);
    return;
  }

  // Only requirements with no real open action for this member are safe to
  // use below — see the SAFETY note at the top of this file.
  const openActionRequirementIds = new Set(openComplianceActions.map((a) => a.requirement_id));
  const collisionFree = requirements.filter((r) => !openActionRequirementIds.has(r.requirement.id));
  console.log(`(${collisionFree.length} of ${requirements.length} requirements have no existing open compliance action for this member)`);

  if (collisionFree.length < 2) {
    console.log("skipped remaining sections — fewer than 2 requirements are collision-free for this member; nothing safe to write against without risking a real open compliance action");
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures > 0) process.exit(1);
    return;
  }
  const [reqOne, reqTwo] = collisionFree;

  // ─── Section: record findings + create a workforce corrective action ──
  console.log("\n== Audit Drill: record findings, create corrective action ==");

  let sessionId: string | undefined;
  let passItemId: string | undefined;
  let failItemId: string | undefined;
  let correctiveActionId: string | undefined;
  // Only true once we've confirmed the corrective action row is one this
  // run actually created (not a real pre-existing row the upsert matched
  // onto) — cleanup only ever deletes it when this is true.
  let correctiveActionIsFreshlyCreated = false;

  try {
    const { data: session, error: sessionError } = await supabase
      .from("audit_sessions")
      .insert({ name: RUN_MARKER, description: RUN_MARKER, scope_domains: ["workforce"], auditor: ACTOR, created_by: ACTOR, status: "in_progress" })
      .select("id")
      .single();
    check("audit_sessions row created", !sessionError && !!session, sessionError);
    sessionId = session?.id as string | undefined;
    if (!sessionId) return;

    const { item: passItem, error: passError } = await recordAuditSessionItem({
      sessionId,
      requirementId: reqOne.requirement.id,
      subjectType: "workforce_member",
      subjectId: realMemberId,
      evidenceId: reqOne.latestEvidence?.id ?? null,
      finding: "pass",
      notes: RUN_MARKER,
      createdBy: ACTOR,
    });
    check("recordAuditSessionItem (pass) succeeds against a real subject/requirement", !passError && !!passItem, passError);
    passItemId = passItem?.id;

    const { item: failItem, error: failError } = await recordAuditSessionItem({
      sessionId,
      requirementId: reqTwo.requirement.id,
      subjectType: "workforce_member",
      subjectId: realMemberId,
      evidenceId: reqTwo.latestEvidence?.id ?? null,
      finding: "fail",
      notes: RUN_MARKER,
      createdBy: ACTOR,
    });
    check("recordAuditSessionItem (fail) succeeds against a real subject/requirement", !failError && !!failItem, failError);
    failItemId = failItem?.id;

    const beforeSync = Date.now();
    const { action: correctiveAction, error: correctiveError } = await syncComplianceAction({
      workforceMemberId: realMemberId,
      requirementId: reqTwo.requirement.id,
      actionType: "evidence_requires_review",
      title: RUN_MARKER,
      reason: RUN_MARKER,
      priority: "normal",
      dueAt: null,
      actor: ACTOR,
    });
    check(
      "createWorkforceCorrectiveActionFromFindingAction's underlying syncComplianceAction call succeeds (the workforce-native path, since compliance_corrective_actions structurally excludes workforce_member)",
      !correctiveError && !!correctiveAction,
      correctiveError
    );
    correctiveActionId = correctiveAction?.id;
    // Belt-and-suspenders on top of the pre-check above: only ever treat
    // this as safe to delete if its created_at is from this run. Anything
    // older means the upsert matched a real pre-existing row despite the
    // pre-check (e.g. a race with a concurrent sync) — leave it alone.
    if (correctiveAction) {
      const createdAtMs = new Date(correctiveAction.created_at).getTime();
      correctiveActionIsFreshlyCreated = createdAtMs >= beforeSync - 5000;
      check("the corrective action's created_at confirms it is a fresh row from this run, not a pre-existing one", correctiveActionIsFreshlyCreated, correctiveAction.created_at);
    }

    if (passItemId) {
      const passItemRow = (await getAuditSessionItems(sessionId)).find((i) => i.id === passItemId);
      if (passItemRow) {
        const view = await composeAuditSessionItemView(passItemRow);
        check("composeAuditSessionItemView resolves the requirement for the pass item", view.requirement?.id === reqOne.requirement.id, view.requirement);
        check("composeAuditSessionItemView resolves the subject label for a workforce_member item", view.subjectLabel === subjectLabel, view.subjectLabel);
        check("composeAuditSessionItemView finds no workforce corrective action for the pass item", view.workforceCorrectiveAction === null, view.workforceCorrectiveAction);
      }
    }
    if (failItemId && correctiveActionId) {
      const failItemRow = (await getAuditSessionItems(sessionId)).find((i) => i.id === failItemId);
      if (failItemRow) {
        const view = await composeAuditSessionItemView(failItemRow);
        check(
          "composeAuditSessionItemView resolves the just-created workforce corrective action by (subject, requirement) match — not by any FK column",
          view.workforceCorrectiveAction?.id === correctiveActionId,
          view.workforceCorrectiveAction
        );
        check("composeAuditSessionItemView's compliance_corrective_actions-side field stays null for a workforce_member item (the FK structurally excludes it)", view.correctiveAction === null, view.correctiveAction);
      }
    }

    // ─── Section: complete the session, then the historical/reopen path ──
    console.log("\n== Complete session, verify historical read path ==");

    const { data: completedRaw, error: completeError } = await supabase
      .rpc("complete_audit_session", { p_session_id: sessionId, p_summary: RUN_MARKER, p_actor: ACTOR })
      .single();
    const completed = completedRaw as { status?: string } | null;
    check("complete_audit_session succeeds", !completeError && completed?.status === "completed", completeError);

    const { error: secondCompleteError } = await supabase.rpc("complete_audit_session", { p_session_id: sessionId, p_summary: "second attempt", p_actor: ACTOR });
    check("a second completion attempt is rejected", !!secondCompleteError, secondCompleteError);

    // The exact read path app/audit-readiness/drills/[id]/page.tsx uses for
    // a completed session — amendment 1's guarantee: this must return
    // precisely what was recorded, unaffected by anything computed live.
    const reopenedSession = await getAuditSessionById(sessionId);
    check("getAuditSessionById returns the completed session (the 'reopen' read path)", reopenedSession?.status === "completed", reopenedSession);

    const reopenedItems = await getAuditSessionItems(sessionId);
    check("getAuditSessionItems returns both recorded items after completion", reopenedItems.length === 2, reopenedItems.length);
    const reopenedPass = reopenedItems.find((i) => i.id === passItemId);
    const reopenedFail = reopenedItems.find((i) => i.id === failItemId);
    check("the reopened pass item's finding is exactly what was recorded", reopenedPass?.finding === "pass", reopenedPass);
    check("the reopened fail item's finding is exactly what was recorded", reopenedFail?.finding === "fail", reopenedFail);

    if (reopenedFail) {
      const historicalView = await composeAuditSessionItemView(reopenedFail);
      check(
        "composeAuditSessionItemView still resolves the corrective action for a completed session's item",
        historicalView.workforceCorrectiveAction?.id === correctiveActionId,
        historicalView.workforceCorrectiveAction
      );
    }
  } finally {
    // ─── Cleanup ───────────────────────────────────────────────────────────
    console.log("\n== Cleanup ==");
    if (correctiveActionId && correctiveActionIsFreshlyCreated) {
      const { error } = await supabase.from("workforce_compliance_actions").delete().eq("id", correctiveActionId);
      check("cleanup: test workforce_compliance_actions row deleted", !error, error);
    } else if (correctiveActionId) {
      console.log(`left workforce_compliance_actions row ${correctiveActionId} untouched — it did not verify as freshly created by this run`);
    }
    if (sessionId) {
      const { error: itemsError } = await supabase.from("audit_session_items").delete().eq("session_id", sessionId);
      check("cleanup: test audit_session_items rows deleted", !itemsError, itemsError);
      const { error: sessionDeleteError } = await supabase.from("audit_sessions").delete().eq("id", sessionId);
      check("cleanup: test audit_sessions row deleted", !sessionDeleteError, sessionDeleteError);
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Phase 4 verification crashed:", err);
  process.exit(1);
});

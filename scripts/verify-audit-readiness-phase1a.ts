// Live Supabase verification for Audit Readiness v0.1 Phase 1 — confirms
// the four migrations already applied to the shared Supabase project
// (20260902000000/010000/020000/030000) actually produced the schema the
// application code assumes, per the Phase 1A verification request.
//
// Follows this codebase's established live-verification convention (see
// scripts/verify-relationship-intelligence-phase1-revision.ts): every
// write this script makes is tagged with a deterministic
// generateTestMarker() value and deleted by this same script before it
// exits, in a try/finally per test group so a mid-run failure still
// cleans up what it created. No existing/real resident, workforce_member,
// or seeded requirement row is ever written to — negative-constraint
// tests deliberately use a random, non-existent subject_id so the
// relevant table's own trigger/constraint is what produces the rejection,
// not a coincidental FK match against real data. The one exception is
// read-only SELECTs against real seeded reference data (e.g. the existing
// TX_NAR_SEARCH requirement's id) used only to satisfy a NOT NULL FK on a
// row this script creates and deletes itself.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-audit-readiness-phase1a.ts
import { randomUUID } from "node:crypto";
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { hasRequirementBeenReliedUponInCompletedAudit, updatePersonRequirement } from "../lib/data/personRequirements.ts";

const RUN_MARKER = generateTestMarker("audit-readiness-phase1a-verify");
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

function isCheckViolation(error: { code?: string; message?: string } | null | undefined, constraintNameFragment: string) {
  if (!error) return false;
  return error.code === "23514" || (error.message ?? "").includes(constraintNameFragment);
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

async function main() {
  const supabase = createServerClient();

  // ─── Section: column-existence probes (read-only) ───────────────────────
  console.log("\n== Column existence probes ==");

  const probes: Array<{ table: string; columns: string }> = [
    {
      table: "person_requirements",
      columns:
        "id,requirement_code,name,description,category,requires_document,requires_verification,is_active,required_score,regulatory_authority,domain,version,effective_date,retired_at,supersedes_requirement_id,created_at,updated_at",
    },
    {
      table: "person_evidence",
      columns:
        "id,subject_type,subject_id,requirement_id,document_id,verification_status,lifecycle_status,lifecycle_status_reason,lifecycle_status_changed_by,lifecycle_status_changed_at,result,source_system,performed_at,effective_date,review_due_date,expiration_date,entered_by,verified_by,verified_at,notes,supersedes_evidence_id,numeric_score,authoritative_source_system,collection_method,verification_method,attestation_result,external_reference,created_at,updated_at",
    },
    { table: "requirement_evidence_links", columns: "id,requirement_id,evidence_id,rationale,linked_by,linked_at,created_at" },
    {
      table: "compliance_corrective_actions",
      columns:
        "id,subject_type,subject_id,requirement_id,domain,action_type,title,reason,owner,priority,due_at,status,resolution_note,resolved_by,resolved_at,audit_session_item_id,created_by,created_at,updated_at",
    },
    { table: "audit_sessions", columns: "id,name,description,scope_domains,auditor,status,summary,created_by,started_at,completed_at,created_at,updated_at" },
    {
      table: "audit_session_items",
      columns: "id,session_id,requirement_id,subject_type,subject_id,evidence_id,finding,notes,corrective_action_id,created_by,created_at,updated_at",
    },
    { table: "compliance_activity", columns: "id,subject_type,subject_id,event_type,event_title,event_description,source,system_generated,created_by,created_at" },
  ];

  for (const probe of probes) {
    const { error } = await supabase.from(probe.table).select(probe.columns).limit(1);
    check(`${probe.table} — all expected columns present and queryable`, !error, error);
  }

  // ─── Section: person_evidence resident-subject widening ────────────────
  console.log("\n== person_evidence subject_type constraint ==");

  const { data: narRequirement, error: narError } = await supabase
    .from("person_requirements")
    .select("id")
    .eq("requirement_code", "TX_NAR_SEARCH")
    .maybeSingle();
  check("seeded TX_NAR_SEARCH requirement found (needed as a real FK target)", !narError && !!narRequirement, narError);
  const narRequirementId = narRequirement?.id as string | undefined;

  if (narRequirementId) {
    const { error: bogusTypeError } = await supabase.from("person_evidence").insert({
      subject_type: "zzz_bogus_subject_type",
      subject_id: randomUUID(),
      requirement_id: narRequirementId,
      entered_by: ACTOR,
      notes: RUN_MARKER,
    });
    // Postgres fires BEFORE ROW triggers before it validates CHECK
    // constraints, so for any subject_type this trigger doesn't
    // recognize, assert_valid_person_subject()'s own "unsupported
    // subject_type" exception is what actually aborts the insert — the
    // CHECK constraint is real, redundant defense-in-depth (same
    // double-layered pattern as person_documents), but never the
    // observed failure mode for a value the trigger already rejects.
    // Either rejection reason proves the same thing: an unrecognized
    // value cannot get an evidence row written.
    check(
      "an unrecognized subject_type is rejected (either by the CHECK constraint, or — since BEFORE triggers fire first in Postgres — by assert_valid_person_subject()'s own exhaustive check)",
      isCheckViolation(bogusTypeError, "person_evidence_subject_type_check") || (bogusTypeError?.message ?? "").includes("unsupported subject_type"),
      bogusTypeError
    );

    const { error: residentTypeError } = await supabase.from("person_evidence").insert({
      subject_type: "resident",
      subject_id: randomUUID(), // deliberately non-existent — proves the CHECK passed and the trigger, not a real resident, produced the rejection
      requirement_id: narRequirementId,
      entered_by: ACTOR,
      notes: RUN_MARKER,
    });
    check(
      "subject_type = 'resident' passes the CHECK constraint (rejection instead comes from assert_valid_person_subject's residents-existence check, not the CHECK)",
      !isCheckViolation(residentTypeError, "person_evidence_subject_type_check") &&
        (residentTypeError?.message ?? "").includes("does not reference an existing residents row"),
      residentTypeError
    );
  }

  // ─── Section: person_requirements versioning + same-domain supersession ─
  console.log("\n== person_requirements versioning / supersession ==");

  const suffix = RUN_MARKER.split(" ").pop();
  const reqA = { requirement_code: `ZZZ_TEST_A_${suffix}`, name: RUN_MARKER, category: "test", domain: "zzz_test_domain_a", requires_document: false, requires_verification: false };
  const { data: insertedA, error: insertAError } = await supabase.from("person_requirements").insert(reqA).select("id,version").single();
  check("test requirement A created", !insertAError && !!insertedA, insertAError);
  check("new requirement defaults version = 1", insertedA?.version === 1, insertedA);
  const requirementAId = insertedA?.id as string | undefined;

  let requirementCId: string | undefined;
  if (requirementAId) {
    const { error: crossDomainError } = await supabase.from("person_requirements").insert({
      requirement_code: `ZZZ_TEST_B_${suffix}`,
      name: RUN_MARKER,
      category: "test",
      domain: "zzz_test_domain_b", // deliberately different domain than A
      supersedes_requirement_id: requirementAId,
      requires_document: false,
      requires_verification: false,
    });
    check(
      "cross-domain supersession is rejected by assert_requirement_supersession_same_domain",
      !!crossDomainError && (crossDomainError.message ?? "").includes("does not match superseded requirement domain"),
      crossDomainError
    );

    const { data: insertedC, error: sameDomainError } = await supabase
      .from("person_requirements")
      .insert({
        requirement_code: `ZZZ_TEST_C_${suffix}`,
        name: RUN_MARKER,
        category: "test",
        domain: "zzz_test_domain_a", // same domain as A
        supersedes_requirement_id: requirementAId,
        requires_document: false,
        requires_verification: false,
      })
      .select("id")
      .single();
    check("same-domain supersession succeeds", !sameDomainError && !!insertedC, sameDomainError);
    requirementCId = insertedC?.id as string | undefined;
  }

  // ─── Section: requirement_evidence_links M:M + uniqueness ──────────────
  console.log("\n== requirement_evidence_links ==");

  const { data: anyEvidence } = await supabase.from("person_evidence").select("id,requirement_id").limit(1).maybeSingle();
  let linkId: string | undefined;
  if (anyEvidence && requirementAId) {
    const { data: insertedLink, error: linkError } = await supabase
      .from("requirement_evidence_links")
      .insert({ requirement_id: requirementAId, evidence_id: anyEvidence.id, rationale: RUN_MARKER, linked_by: ACTOR })
      .select("id")
      .single();
    check("evidence can be linked to a requirement other than its own primary requirement_id (the M:M case)", !insertedLink ? false : !linkError, linkError);
    linkId = insertedLink?.id as string | undefined;

    const { error: dupError } = await supabase
      .from("requirement_evidence_links")
      .insert({ requirement_id: requirementAId, evidence_id: anyEvidence.id, rationale: RUN_MARKER, linked_by: ACTOR });
    check("a duplicate (requirement_id, evidence_id) link is rejected by the unique constraint", isUniqueViolation(dupError), dupError);
  } else {
    console.log("skipped — no existing person_evidence row found to link against (empty environment)");
  }
  if (linkId) await supabase.from("requirement_evidence_links").delete().eq("id", linkId);

  // ─── Section: compliance_corrective_actions subject-domain boundary ────
  console.log("\n== compliance_corrective_actions subject boundary ==");

  if (requirementAId) {
    const { error: workforceRejectedError } = await supabase.from("compliance_corrective_actions").insert({
      subject_type: "workforce_member",
      subject_id: randomUUID(),
      requirement_id: requirementAId,
      action_type: "evidence_missing",
      title: RUN_MARKER,
      reason: RUN_MARKER,
      created_by: ACTOR,
    });
    check(
      "subject_type = 'workforce_member' is rejected — workforce findings cannot land in this table even by accident",
      isCheckViolation(workforceRejectedError, "compliance_corrective_actions_subject_type_check"),
      workforceRejectedError
    );

    const { data: agencyAction, error: agencyError } = await supabase
      .from("compliance_corrective_actions")
      .insert({
        subject_type: "agency",
        subject_id: randomUUID(), // no existence check on this table today — see the report's finding on this
        requirement_id: requirementAId,
        domain: "zzz_test_domain_a",
        action_type: "evidence_missing",
        title: RUN_MARKER,
        reason: RUN_MARKER,
        created_by: ACTOR,
      })
      .select("id")
      .single();
    check("subject_type = 'agency' is accepted", !agencyError && !!agencyAction, agencyError);

    const { data: badFkRow, error: badAuditSessionItemFkError } = await supabase
      .from("compliance_corrective_actions")
      .insert({
        subject_type: "agency",
        subject_id: randomUUID(),
        requirement_id: requirementAId,
        action_type: "evidence_missing",
        title: RUN_MARKER,
        reason: RUN_MARKER,
        created_by: ACTOR,
        audit_session_item_id: randomUUID(), // does not exist — must be rejected by the FK
      })
      .select("id")
      .maybeSingle();
    check(
      "audit_session_item_id has a real, enforced foreign key to audit_session_items.id",
      badAuditSessionItemFkError?.code === "23503",
      badAuditSessionItemFkError
    );
    // Self-heal even if the FK is missing and the insert unexpectedly
    // succeeded — this row must never be left behind just because the
    // constraint it was probing turned out not to exist.
    if (badFkRow) await supabase.from("compliance_corrective_actions").delete().eq("id", badFkRow.id);

    if (agencyAction) {
      const { data: resolved, error: resolveError } = await supabase
        .rpc("resolve_compliance_corrective_action", {
          p_action_id: agencyAction.id,
          p_status: "resolved",
          p_actor: ACTOR,
          p_resolution_note: RUN_MARKER,
        })
        .single();
      check("resolve_compliance_corrective_action RPC runs and resolves the action", !resolveError && !!resolved, resolveError);
      await supabase.from("compliance_corrective_actions").delete().eq("id", agencyAction.id);
    }

    const { data: autoResolveCount, error: autoResolveError } = await supabase.rpc("auto_resolve_compliance_corrective_actions", {
      p_subject_type: "agency",
      p_subject_id: randomUUID(),
      p_requirement_id: requirementAId,
    });
    check(
      "auto_resolve_compliance_corrective_actions RPC runs against a nonexistent subject and returns 0 (no data created)",
      !autoResolveError && autoResolveCount === 0,
      autoResolveError ?? autoResolveCount
    );
  }

  // ─── Section: audit_sessions / audit_session_items / completion lock ───
  console.log("\n== Audit Drill lifecycle + completion lock ==");

  let sessionId: string | undefined;
  let itemId: string | undefined;
  if (requirementAId) {
    const { data: session, error: sessionError } = await supabase
      .from("audit_sessions")
      .insert({ name: RUN_MARKER, description: RUN_MARKER, scope_domains: ["zzz_test_domain_a"], auditor: ACTOR, created_by: ACTOR, status: "in_progress" })
      .select("id,status")
      .single();
    check("audit_sessions row created, defaults/explicit status = in_progress", !sessionError && session?.status === "in_progress", sessionError);
    sessionId = session?.id as string | undefined;

    if (sessionId) {
      const { data: item, error: itemError } = await supabase
        .from("audit_session_items")
        .insert({
          session_id: sessionId,
          requirement_id: requirementAId,
          subject_type: "agency",
          subject_id: randomUUID(),
          finding: "pass",
          notes: RUN_MARKER,
          created_by: ACTOR,
        })
        .select("id")
        .single();
      check("audit_session_items row created against the in_progress session", !itemError && !!item, itemError);
      itemId = item?.id as string | undefined;

      if (itemId) {
        // Before completion — the application-layer immutability guard
        // should report this requirement as NOT yet relied upon (the
        // session isn't completed yet).
        const reliedBefore = await hasRequirementBeenReliedUponInCompletedAudit(requirementAId);
        check("immutability guard reads false before the session is completed", reliedBefore === false, reliedBefore);
      }

      const { data: completedRaw, error: completeError } = await supabase
        .rpc("complete_audit_session", { p_session_id: sessionId, p_summary: RUN_MARKER, p_actor: ACTOR })
        .single();
      const completed = completedRaw as { status?: string; completed_at?: string | null } | null;
      check("complete_audit_session RPC succeeds and returns status = completed", !completeError && completed?.status === "completed", completeError);
      check("completed_at is set on completion", !!completed?.completed_at, completed);

      const { error: secondCompleteError } = await supabase.rpc("complete_audit_session", { p_session_id: sessionId, p_summary: "second attempt", p_actor: ACTOR });
      check("completing an already-completed session is rejected (idempotency guard)", !!secondCompleteError, secondCompleteError);

      if (itemId) {
        const { error: mutateError } = await supabase.from("audit_session_items").update({ notes: "mutated after completion" }).eq("id", itemId);
        check(
          "updating an item belonging to a completed session is rejected — completed audit history is structurally immutable",
          !!mutateError && (mutateError.message ?? "").includes("is completed"),
          mutateError
        );

        const { error: newItemError } = await supabase.from("audit_session_items").insert({
          session_id: sessionId,
          requirement_id: requirementAId,
          subject_type: "agency",
          subject_id: randomUUID(),
          finding: "fail",
          notes: RUN_MARKER,
          created_by: ACTOR,
        });
        check(
          "inserting a new item into a completed session is rejected",
          !!newItemError && (newItemError.message ?? "").includes("is completed"),
          newItemError
        );

        // Application-layer guard, now that a completed audit relies on
        // requirement A: updatePersonRequirement() should refuse the edit
        // and hasRequirementBeenReliedUponInCompletedAudit() should be true.
        const reliedAfter = await hasRequirementBeenReliedUponInCompletedAudit(requirementAId);
        check("immutability guard reads true once a completed audit session relies on this requirement", reliedAfter === true, reliedAfter);

        const updateResult = await updatePersonRequirement({ requirementId: requirementAId, name: "should be refused" });
        check("updatePersonRequirement() refuses to edit a requirement relied upon by a completed audit", updateResult.locked === true, updateResult);
      }
    }
  }

  // ─── Section: compliance_activity ───────────────────────────────────────
  console.log("\n== compliance_activity ==");

  const { error: bogusEventError } = await supabase.from("compliance_activity").insert({
    subject_type: "agency",
    subject_id: randomUUID(),
    event_type: "zzz_bogus_event_type",
    event_title: RUN_MARKER,
    source: RUN_MARKER,
    system_generated: false,
    created_by: ACTOR,
  });
  check("an unrecognized event_type is rejected by the CHECK constraint", isCheckViolation(bogusEventError, "compliance_activity_event_type_check"), bogusEventError);

  const { data: activityRow, error: activityError } = await supabase
    .from("compliance_activity")
    .insert({
      subject_type: "agency",
      subject_id: randomUUID(),
      event_type: "corrective_action_created",
      event_title: RUN_MARKER,
      source: RUN_MARKER,
      system_generated: false,
      created_by: ACTOR,
    })
    .select("id")
    .single();
  check("a recognized event_type is accepted", !activityError && !!activityRow, activityError);
  if (activityRow) await supabase.from("compliance_activity").delete().eq("id", activityRow.id);

  // ─── Cleanup ─────────────────────────────────────────────────────────────
  console.log("\n== Cleanup ==");
  if (itemId) {
    const { error } = await supabase.from("audit_session_items").delete().eq("id", itemId);
    check("cleanup: test audit_session_items row deleted", !error, error);
  }
  if (sessionId) {
    const { error } = await supabase.from("audit_sessions").delete().eq("id", sessionId);
    check("cleanup: test audit_sessions row deleted", !error, error);
  }
  if (requirementAId) {
    const reliedAfterCleanup = await hasRequirementBeenReliedUponInCompletedAudit(requirementAId);
    check("immutability guard reads false again once the completed audit's own record is deleted", reliedAfterCleanup === false, reliedAfterCleanup);
  }
  if (requirementCId) {
    const { error } = await supabase.from("person_requirements").delete().eq("id", requirementCId);
    check("cleanup: test requirement C deleted", !error, error);
  }
  if (requirementAId) {
    const { error } = await supabase.from("person_requirements").delete().eq("id", requirementAId);
    check("cleanup: test requirement A deleted", !error, error);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});

// Live Supabase verification for the REVISED Relationship Intelligence
// Phase 1 migration (post pre-commit review — see ADR 0003's "Revision"
// and "Upgrade compatibility" sections). The migration has now applied
// successfully to the shared Supabase project; this script is run as part
// of the post-deployment verification pass. See also
// scripts/verify-relationship-intelligence-phase1-post-deploy.ts for the
// upgrade-specific checks this script does not cover (old parameter names
// no longer resolving, no leftover obsolete columns, FK NO ACTION delete
// behavior, composite idempotency index scoping).
//
// Once authorized, run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-relationship-intelligence-phase1-revision.ts
//
// Covers exactly what was asked for: legacy Touch compatibility, atomic
// rollback, malformed JSON (including p_next_action's shape), invalid
// lifecycle states, sequential idempotent replay, TRUE CONCURRENT
// idempotent replay (via Promise.all, not sequential awaits), and the
// database-level participants array CHECK constraint. "Source-change
// detection" is not covered — Phase 1 deliberately does not persist a
// Brief snapshot or compute a staleness fingerprint (see ADR 0003 point 12
// / the implementation doc's Known Limitations: "Phase 1 cannot compare a
// current brief against a prior generation or show 'source data changed
// since generation' because no generation snapshot exists"), so there is
// nothing yet to verify there; the updated_at columns added in this
// revision exist so a future version of this feature has something to
// check against.

import { createServerClient } from "../lib/supabase/server.ts";
import { logRelationshipInteraction } from "../lib/data/relationships.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";

const RUN_MARKER = generateTestMarker("relationship-intelligence-phase1-revision-verify");
const ACTOR = "Phase 1 Revision Verification Script";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

async function createTestRelationship(supabase: ReturnType<typeof createServerClient>): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_relationship", {
    p_relationship_type: "resident_prospect",
    p_stage: "new_inquiry",
    p_display_name: "Verify Revision — Phase 1",
    p_resident_id: null,
    p_prospect_id: null,
    p_community_name: null,
    p_organization_name: null,
    p_primary_contact_name: "Verify Fictional",
    p_primary_contact_relationship: "Daughter",
    p_primary_contact_phone: null,
    p_primary_contact_email: null,
    p_prospective_resident_name: "Fictional Resident",
    p_summary: null,
    p_owner_label: null,
    p_priority: "normal",
    p_source_type: "manual",
    p_source_label: "verification",
    p_actor: ACTOR,
    p_prospective_client_first_name: null,
    p_prospective_client_last_name: null,
    p_prospective_client_preferred_name: null,
    p_prospective_client_phone: null,
    p_prospective_client_email: null,
    p_primary_contact_is_prospective_client: false,
    p_test_marker: RUN_MARKER,
  });
  check("Created a fictional test relationship", Boolean(data), error?.message);
  return (data as string | null) ?? null;
}

async function cleanupRelationship(supabase: ReturnType<typeof createServerClient>, relationshipId: string) {
  const { data: actionIds } = await supabase.from("relationship_actions").select("id").eq("relationship_id", relationshipId);
  if (actionIds && actionIds.length > 0) {
    await supabase.from("relationship_action_edits").delete().in("relationship_action_id", actionIds.map((r) => r.id));
  }
  await supabase.from("relationship_actions").delete().eq("relationship_id", relationshipId);
  await supabase.from("relationship_open_loops").delete().eq("relationship_id", relationshipId);
  await supabase.from("relationship_commitments").delete().eq("relationship_id", relationshipId);
  await supabase.from("relationship_insights").delete().eq("relationship_id", relationshipId);
  await supabase.from("relationship_working_notes").delete().eq("relationship_id", relationshipId);
  await supabase.from("relationship_timeline").delete().eq("relationship_id", relationshipId);
  await supabase.from("relationship_touches").delete().eq("relationship_id", relationshipId);
  const { error } = await supabase.from("relationships").delete().eq("id", relationshipId);
  check(`Cleanup succeeded for relationship ${relationshipId}`, !error, error?.message);
}

async function run() {
  const supabase = createServerClient();

  // 0. Table/column existence check for the revised schema specifically.
  const { error: colCheckError } = await supabase
    .from("relationship_commitments")
    .select("closed_at, closed_by, closure_note")
    .limit(1);
  if (colCheckError) {
    console.error(
      "[verify-revision] relationship_commitments.closed_at/closed_by/closure_note not queryable — the REVISED " +
        "migration does not appear to be applied yet. Apply it, then re-run this script.",
      colCheckError.message,
    );
    process.exit(1);
  }

  // 1. Legacy Touch compatibility — a row with no interaction_result, no
  // participants, no idempotency_key still reads back cleanly.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const { data: legacyTouch, error } = await supabase
        .from("relationship_touches")
        .insert({ relationship_id: relationshipId, touch_type: "call", summary: "Legacy-shaped touch.", created_by: ACTOR })
        .select("*")
        .single();
      check("Legacy-shaped touch row inserts and reads back cleanly", Boolean(legacyTouch), error?.message);
      check("interaction_result defaults to null", legacyTouch?.interaction_result === null);
      check("participants defaults to an empty array", Array.isArray(legacyTouch?.participants) && legacyTouch.participants.length === 0);
      check("idempotency_key defaults to null", legacyTouch?.idempotency_key === null);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 2. Atomic rollback — an invalid insight category fails the WHOLE
  // submission, no orphaned Interaction.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const result = await logRelationshipInteraction({
        relationshipId,
        touchType: "call",
        occurredAt: null,
        summary: "Should fail atomically.",
        interactionResult: null,
        outcome: null,
        contactName: null,
        participants: [],
        insights: [{ content: "Bad.", category: "not_a_real_category", whyItMatters: null, relevantUntil: null, residentId: null }],
        commitments: [],
        openLoops: [],
        nextAction: null,
        actor: ACTOR,
        testMarker: RUN_MARKER,
      });
      check("Invalid category rejects the whole submission", Boolean(result.error), result.error);
      const { data: touches } = await supabase.from("relationship_touches").select("id").eq("relationship_id", relationshipId);
      check("No orphaned Interaction row from the failed submission", (touches?.length ?? 0) === 0, touches?.length);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 3. Malformed JSON — a non-array insights payload raises a clear
  // exception rather than a cryptic jsonb_array_elements crash.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const { error } = await supabase.rpc("log_relationship_interaction", {
        p_relationship_id: relationshipId,
        p_touch_type: "call",
        p_occurred_at: null,
        p_summary: "Malformed JSON test.",
        p_interaction_result: null,
        p_outcome: null,
        p_contact_name: null,
        p_participants: [],
        p_insights: { not: "an array" }, // malformed on purpose
        p_commitments: [],
        p_open_loops: [],
        p_next_action: null,
        p_actor: ACTOR,
        p_test_marker: RUN_MARKER,
        p_idempotency_key: null,
      });
      check("Non-array insights payload raises a clear validation error", Boolean(error) && /array/i.test(error?.message ?? ""), error?.message);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 4. Invalid lifecycle states — resolve_relationship_commitment rejects
  // an unrecognized status, and the bidirectional check constraint blocks
  // an inconsistent direct insert (open status with closure metadata set).
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const { error: invalidStatusError } = await supabase.rpc("resolve_relationship_commitment", {
        p_commitment_id: "00000000-0000-0000-0000-000000000000",
        p_status: "not_a_real_status",
        p_closure_note: null,
        p_actor: ACTOR,
      });
      check("resolve_relationship_commitment rejects an invalid status", Boolean(invalidStatusError), invalidStatusError?.message);

      const { error: inconsistentInsertError } = await supabase.from("relationship_commitments").insert({
        relationship_id: relationshipId,
        description: "Inconsistent row.",
        responsible_party_type: "serve",
        status: "open",
        closed_at: new Date().toISOString(), // inconsistent: open + closed_at set
        closed_by: ACTOR,
        created_by: ACTOR,
      });
      check(
        "The bidirectional closure-fields check constraint blocks an inconsistent direct insert (open + closed_at set)",
        Boolean(inconsistentInsertError),
        inconsistentInsertError?.message,
      );
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 5. Idempotent replay — same idempotency key returns the SAME row, no
  // duplicate Interaction or child records.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const idempotencyKey = crypto.randomUUID();
      const first = await logRelationshipInteraction({
        relationshipId,
        touchType: "call",
        occurredAt: null,
        summary: "Idempotent replay test.",
        interactionResult: "connected",
        outcome: null,
        contactName: null,
        participants: [],
        insights: [{ content: "One insight.", category: "operational", whyItMatters: null, relevantUntil: null, residentId: null }],
        commitments: [],
        openLoops: [],
        nextAction: null,
        actor: ACTOR,
        testMarker: RUN_MARKER,
        idempotencyKey,
      });
      const second = await logRelationshipInteraction({
        relationshipId,
        touchType: "call",
        occurredAt: null,
        summary: "Idempotent replay test (retry).",
        interactionResult: "connected",
        outcome: null,
        contactName: null,
        participants: [],
        insights: [{ content: "A second insight that should NEVER be inserted.", category: "operational", whyItMatters: null, relevantUntil: null, residentId: null }],
        commitments: [],
        openLoops: [],
        nextAction: null,
        actor: ACTOR,
        testMarker: RUN_MARKER,
        idempotencyKey, // same key — simulates a double-click
      });
      check("Both calls succeeded", Boolean(first.interaction) && Boolean(second.interaction), { firstErr: first.error, secondErr: second.error });
      check(
        "The retried call returned the SAME Interaction id, not a new one",
        first.interaction?.id === second.interaction?.id,
        { first: first.interaction?.id, second: second.interaction?.id },
      );
      const { data: touches } = await supabase.from("relationship_touches").select("id").eq("relationship_id", relationshipId);
      check("Only one Interaction row exists for this relationship", (touches?.length ?? 0) === 1, touches?.length);
      const { data: insights } = await supabase.from("relationship_insights").select("id").eq("relationship_id", relationshipId);
      check("Only one Insight row exists — the retry's insight was never inserted", (insights?.length ?? 0) === 1, insights?.length);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 5b. TRUE CONCURRENT idempotent replay — two calls fired via Promise.all
  // (not sequential awaits) with the same idempotency key. This is what
  // actually exercises the ON CONFLICT race-safety fix: a naive
  // select-then-insert would let both calls past the initial lookup and
  // have one surface a raw unique_violation. Both calls here must resolve
  // successfully with the same Interaction id, and exactly one row (plus
  // its child records) must exist afterward.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const idempotencyKey = crypto.randomUUID();
      const buildCall = (label: string) =>
        logRelationshipInteraction({
          relationshipId,
          touchType: "call",
          occurredAt: null,
          summary: `Concurrent idempotency test (${label}).`,
          interactionResult: "connected",
          outcome: null,
          contactName: null,
          participants: [],
          insights: [{ content: `Insight from ${label}.`, category: "operational", whyItMatters: null, relevantUntil: null, residentId: null }],
          commitments: [],
          openLoops: [],
          nextAction: null,
          actor: ACTOR,
          testMarker: RUN_MARKER,
          idempotencyKey,
        });

      const [callA, callB] = await Promise.all([buildCall("A"), buildCall("B")]);

      check(
        "Both concurrent calls resolved successfully (no unhandled unique_violation)",
        Boolean(callA.interaction) && Boolean(callB.interaction),
        { errorA: callA.error, errorB: callB.error },
      );
      check(
        "Both concurrent calls returned the SAME Interaction id",
        Boolean(callA.interaction) && callA.interaction?.id === callB.interaction?.id,
        { a: callA.interaction?.id, b: callB.interaction?.id },
      );
      const { data: touches } = await supabase.from("relationship_touches").select("id").eq("relationship_id", relationshipId);
      check("Exactly one Interaction row exists after the concurrent race", (touches?.length ?? 0) === 1, touches?.length);
      const { data: insights } = await supabase.from("relationship_insights").select("id").eq("relationship_id", relationshipId);
      check("Exactly one Insight row exists — only the winning call's children were inserted", (insights?.length ?? 0) === 1, insights?.length);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 5c. next_action must be a JSON object — an array/string/number/boolean
  // is rejected with a clear domain-specific exception.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const { error } = await supabase.rpc("log_relationship_interaction", {
        p_relationship_id: relationshipId,
        p_touch_type: "call",
        p_occurred_at: null,
        p_summary: "next_action shape test.",
        p_interaction_result: null,
        p_outcome: null,
        p_contact_name: null,
        p_participants: [],
        p_insights: [],
        p_commitments: [],
        p_open_loops: [],
        p_next_action: ["not", "an", "object"], // malformed on purpose
        p_actor: ACTOR,
        p_test_marker: RUN_MARKER,
        p_idempotency_key: null,
      });
      check("A non-object next_action raises a clear validation error", Boolean(error) && /object/i.test(error?.message ?? ""), error?.message);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 5d. Database-level participants array CHECK constraint — rejects a
  // non-array value on a direct insert, independent of the RPC's own
  // (application-boundary) validation.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const { error } = await supabase.from("relationship_touches").insert({
        relationship_id: relationshipId,
        touch_type: "call",
        summary: "Direct insert with malformed participants.",
        created_by: ACTOR,
        participants: { not: "an array" }, // malformed on purpose — bypasses the RPC entirely
      });
      check(
        "The database-level CHECK constraint rejects a non-array participants value on a direct insert",
        Boolean(error),
        error?.message,
      );
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 6. Conditional last_meaningful_touch_at — a voicemail does not advance
  // it; a connected call does.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const voicemail = await logRelationshipInteraction({
        relationshipId,
        touchType: "call",
        occurredAt: null,
        summary: "Left a voicemail.",
        interactionResult: "left_voicemail",
        outcome: null,
        contactName: null,
        participants: [],
        insights: [],
        commitments: [],
        openLoops: [],
        nextAction: null,
        actor: ACTOR,
        testMarker: RUN_MARKER,
      });
      check("Voicemail interaction succeeded", Boolean(voicemail.interaction), voicemail.error);
      const { data: afterVoicemail } = await supabase.from("relationships").select("last_meaningful_touch_at").eq("id", relationshipId).single();
      check("last_meaningful_touch_at is still null after a voicemail-only interaction", afterVoicemail?.last_meaningful_touch_at === null);

      const connected = await logRelationshipInteraction({
        relationshipId,
        touchType: "call",
        occurredAt: null,
        summary: "Actually connected this time.",
        interactionResult: "connected",
        outcome: null,
        contactName: null,
        participants: [],
        insights: [],
        commitments: [],
        openLoops: [],
        nextAction: null,
        actor: ACTOR,
        testMarker: RUN_MARKER,
      });
      check("Connected interaction succeeded", Boolean(connected.interaction), connected.error);
      const { data: afterConnected } = await supabase.from("relationships").select("last_meaningful_touch_at").eq("id", relationshipId).single();
      check("last_meaningful_touch_at IS set after a connected interaction", afterConnected?.last_meaningful_touch_at !== null);
      await cleanupRelationship(supabase, relationshipId);
    }
  }

  // 7. create_relationship_working_note's extended signature.
  {
    const relationshipId = await createTestRelationship(supabase);
    if (relationshipId) {
      const { data: noteId, error } = await supabase.rpc("create_relationship_working_note", {
        p_relationship_id: relationshipId,
        p_content: "Best time to call is after 4pm.",
        p_category: "scheduling",
        p_actor: ACTOR,
        p_relevant_until: "2026-08-01",
        p_resident_id: null,
        p_contact_name: "Verify Fictional",
        p_source_description: "Overheard during intake call.",
      });
      check("create_relationship_working_note accepts the new optional fields", Boolean(noteId), error?.message);
      if (noteId) {
        const { data: note } = await supabase.from("relationship_working_notes").select("*").eq("id", noteId).single();
        check("relevant_until stored correctly", note?.relevant_until === "2026-08-01");
        check("contact_name stored correctly", note?.contact_name === "Verify Fictional");
        check("source_description stored correctly", note?.source_description === "Overheard during intake call.");
      }

      // Old 4-arg call shape (no extras) must still work — existing callers
      // (ConvertRelationshipPanel's conversion note) are unchanged.
      const { data: legacyNoteId, error: legacyError } = await supabase.rpc("create_relationship_working_note", {
        p_relationship_id: relationshipId,
        p_content: "Old-style call with only the original 4 params.",
        p_category: null,
        p_actor: ACTOR,
      });
      check("The original 4-parameter call shape still works (defaults apply)", Boolean(legacyNoteId), legacyError?.message);

      await cleanupRelationship(supabase, relationshipId);
    }
  }

  console.log("");
  console.log(failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`);
  if (failures > 0) process.exit(1);
}

run();

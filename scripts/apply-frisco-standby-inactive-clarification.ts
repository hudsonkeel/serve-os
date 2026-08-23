// Applies the 2026-08-23 Frisco Needs Review business-rule clarification:
//
// 1. Recomputes computed_lifecycle for every ALREADY-STORED
//    axiscare_client_operational_state row from its own already-synced
//    raw fields (status_active, class_codes, has_contact_info,
//    start_date), using the corrected classifyAxisCareClientLifecycle().
//    No live AxisCare call — every input already exists from the last
//    sync, so this is a pure, deterministic recompute, exactly what the
//    next real sync run would produce for these unchanged raw fields.
//
// 2. Records two governed resident_serve_relationship_corrections rows
//    (the same sanctioned mechanism already used for Carole Holt) for
//    Patricia Arends and Edward Dorr — their AxisCare class signals don't
//    carry an explicit "Active No Visits" flag, so the class-mapping fix
//    alone doesn't reach them. Per explicit human confirmation (Hud Keel,
//    2026-08-23): both are established Serve clients with no current
//    service schedule. This uses the existing governed correction RPC,
//    never a fake class mapping and never a direct table edit.
//
// Read-only reporting first, then writes. Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/apply-frisco-standby-inactive-clarification.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { classifyAxisCareClientLifecycle, hasServiceStarted, STANDBY_INACTIVE_CORRECTION_MARKER } from "../lib/integrations/axiscare/clientLifecycle.ts";
import { correctResidentServeRelationship } from "../lib/data/residentServeRelationshipCorrections.ts";

const PATRICIA_ARENDS_RESIDENT_ID = "5dade59a-b5a1-40f0-a56b-62978fa78065";
const PATRICIA_ARENDS_AXISCARE_ID = "34";
const EDWARD_DORR_RESIDENT_ID = "a81b976b-4f0d-4fc3-8729-3e4dee98c137";
const EDWARD_DORR_AXISCARE_ID = "37";

const ACTOR_RATIONALE_SUFFIX =
  `${STANDBY_INACTIVE_CORRECTION_MARKER} Confirmed by Hud Keel, 2026-08-23 (Frisco Needs Review investigation): this AxisCare record's class signals don't carry an explicit standby-class flag, but the person is explicitly confirmed as an established Serve client with the necessary signed agreement/relationship already in place and no current scheduled visits. Serve deliberately keeps such clients Inactive in AxisCare until service is requested (activating a client in AxisCare has a real cost); the client can be switched to Active and served immediately on request. This is inactive_client (established, standby), not a former/discharged client and not a prospect. Recorded via the governed correction mechanism because the AxisCare class-code signal alone is not explicit enough here — never a fabricated class mapping. The leading marker is a machine-readable tag (see clientLifecycle.ts) telling Discharge/Transfer's applicability check this is not a discharge event.`;

async function main() {
  const supabase = createServerClient();

  // ─── Step 1: recompute stored lifecycle for every row, in place ──────
  const { data: rows, error } = await supabase.from("axiscare_client_operational_state").select("*");
  if (error) throw new Error(error.message);

  console.log(`\n=== Recomputing computed_lifecycle for ${rows?.length ?? 0} stored AxisCare operational-state row(s) ===\n`);

  let changed = 0;
  for (const row of rows ?? []) {
    const hasStartDate = hasServiceStarted(row.start_date);
    const newLifecycle = classifyAxisCareClientLifecycle({
      status: { active: row.status_active, label: row.status_label ?? "" },
      classes: (row.class_codes ?? []).map((code: string) => ({ code, label: "" })),
      hasContactInfo: row.has_contact_info,
      hasStartDate,
    });

    if (newLifecycle !== row.computed_lifecycle) {
      changed += 1;
      console.log(`  ${row.vendor_display_name ?? row.axiscare_client_id}: ${row.computed_lifecycle} -> ${newLifecycle}  (class_codes=${JSON.stringify(row.class_codes)})`);
      const { error: updateError } = await supabase
        .from("axiscare_client_operational_state")
        .update({ computed_lifecycle: newLifecycle, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateError) throw new Error(`Could not update row ${row.id}: ${updateError.message}`);
    }
  }
  console.log(`\n${changed} row(s) reclassified.`);

  // ─── Step 2: governed corrections for Patricia Arends and Edward Dorr ──
  console.log("\n=== Recording governed corrections for Patricia Arends and Edward Dorr ===\n");

  const { data: latestCorrections } = await supabase
    .from("resident_serve_relationship_corrections")
    .select("resident_id, new_value, rationale")
    .in("resident_id", [PATRICIA_ARENDS_RESIDENT_ID, EDWARD_DORR_RESIDENT_ID])
    .order("created_at", { ascending: false });
  const latestByResident = new Map<string, { newValue: string; rationale: string }>();
  for (const c of latestCorrections ?? []) {
    if (!latestByResident.has(c.resident_id as string)) {
      latestByResident.set(c.resident_id as string, { newValue: c.new_value as string, rationale: c.rationale as string });
    }
  }

  const targets = [
    { residentId: PATRICIA_ARENDS_RESIDENT_ID, axiscareId: PATRICIA_ARENDS_AXISCARE_ID, name: "Patricia Arends" },
    { residentId: EDWARD_DORR_RESIDENT_ID, axiscareId: EDWARD_DORR_AXISCARE_ID, name: "Edward Dorr" },
  ];

  for (const t of targets) {
    const latest = latestByResident.get(t.residentId);
    if (latest?.rationale?.includes(STANDBY_INACTIVE_CORRECTION_MARKER)) {
      console.log(`  ${t.name}: already carries the standby marker — skipping (idempotent).`);
      continue;
    }
    const previousValue = (latest?.newValue ?? "needs_review") as
      | "prospect"
      | "active_client"
      | "inactive_client"
      | "no_current_relationship"
      | "needs_review";
    const result = await correctResidentServeRelationship({
      residentId: t.residentId,
      previousValue,
      newValue: "inactive_client",
      actor: `Hud Keel (governed confirmation — Frisco Standby Client Business-Rule Clarification, explicit authorization for ${t.name} / AxisCare #${t.axiscareId})`,
      rationale: ACTOR_RATIONALE_SUFFIX,
    });
    if (result.error) throw new Error(`Could not record correction for ${t.name}: ${result.error}`);
    console.log(`  ${t.name}: recorded correction ${previousValue} -> inactive_client`);
  }

  console.log("\nDONE.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

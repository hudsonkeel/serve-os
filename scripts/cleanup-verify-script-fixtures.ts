// Production hygiene correction — deletes disposable test fixtures left
// behind by earlier live verify-script runs (some were interrupted
// before their own `finally` cleanup could run). Identifies fixtures via
// ONLY deterministic markers those scripts themselves wrote — never
// name-pattern matching alone (name/timestamp patterns are logged as
// corroboration, never as the deciding evidence):
//
//   - residents.source_system = 'verify-script-fixture'
//   - resident_serve_relationship_corrections.actor = 'verify-script'
//   - person_vendor_identity_links.resolved_by = 'verify-script'
//   - resident_timeline.created_by = 'verify-script'
//   - roster_import_runs.imported_by = 'verify-script'
//
// Logs the full inventory with evidence BEFORE deleting anything, then
// deletes in FK-safe order:
//   person_vendor_identity_link_decisions
//     -> person_vendor_identity_links
//     -> resident_serve_relationship_corrections
//     -> resident_timeline
//     -> roster_source_rows
//     -> roster_import_runs
//     -> residents
//
// Sanity-checked against Maria Matos / Karen Mabry (must never appear in
// the fixture set) both before and after.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/cleanup-verify-script-fixtures.ts
import { createServerClient } from "../lib/supabase/server.ts";

async function inventoryFixtureResidentIds(supabase: ReturnType<typeof createServerClient>): Promise<{ ids: Set<string>; evidence: Map<string, string[]> }> {
  const ids = new Set<string>();
  const evidence = new Map<string, string[]>();
  function add(id: string, note: string) {
    ids.add(id);
    const list = evidence.get(id) ?? [];
    list.push(note);
    evidence.set(id, list);
  }

  const { data: directFixtures, error: e1 } = await supabase.from("residents").select("id").eq("source_system", "verify-script-fixture");
  if (e1) throw new Error(`Marker query (source_system) failed: ${e1.message}`);
  for (const r of directFixtures ?? []) add(r.id as string, "source_system='verify-script-fixture'");

  const { data: corrections, error: e2 } = await supabase.from("resident_serve_relationship_corrections").select("resident_id, rationale").eq("actor", "verify-script");
  if (e2) throw new Error(`Marker query (corrections) failed: ${e2.message}`);
  for (const c of corrections ?? []) add(c.resident_id as string, `resident_serve_relationship_corrections.actor='verify-script' (rationale: "${c.rationale}")`);

  const { data: links, error: e3 } = await supabase.from("person_vendor_identity_links").select("subject_id, subject_type, source_system, vendor_record_id").eq("resolved_by", "verify-script");
  if (e3) throw new Error(`Marker query (links) failed: ${e3.message}`);
  for (const l of links ?? []) {
    if (l.subject_type === "resident" && l.subject_id) {
      add(l.subject_id as string, `person_vendor_identity_links.resolved_by='verify-script' (source_system='${l.source_system}', vendor_record_id='${l.vendor_record_id}')`);
    }
  }

  const { data: timelineRows, error: e4 } = await supabase.from("resident_timeline").select("resident_id, event_title").eq("created_by", "verify-script");
  if (e4) throw new Error(`Marker query (timeline) failed: ${e4.message}`);
  for (const t of timelineRows ?? []) add(t.resident_id as string, `resident_timeline.created_by='verify-script' ("${t.event_title}")`);

  return { ids, evidence };
}

async function main() {
  const supabase = createServerClient();

  // ═══ Sanity check BEFORE: Maria Matos / Karen Mabry must never appear ═══
  const { data: before } = await supabase.from("residents").select("id, first_name, last_name, source_system").or("last_name.ilike.%Matos%,last_name.ilike.%Mabry%");
  console.log("=== Sanity check (before): real Matos/Mabry records ===");
  for (const r of before ?? []) console.log(`- ${r.first_name} ${r.last_name}  source_system=${r.source_system}`);

  const { ids: residentIds, evidence } = await inventoryFixtureResidentIds(supabase);
  const { data: residentRows } = residentIds.size > 0
    ? await supabase.from("residents").select("id, first_name, last_name, community_name, serve_relationship_status, source_system, created_at").in("id", [...residentIds])
    : { data: [] };

  for (const r of before ?? []) {
    if (residentIds.has(r.id as string)) {
      throw new Error(`REFUSING TO PROCEED: a real Matos/Mabry record (${r.first_name} ${r.last_name}, id=${r.id}) matched a fixture evidence marker. This must never happen — aborting without deleting anything.`);
    }
  }

  console.log(`\n=== INVENTORY: ${residentIds.size} disposable fixture resident(s), evidence-confirmed ===\n`);
  for (const r of residentRows ?? []) {
    console.log(`- ${r.first_name} ${r.last_name}  [${r.community_name ?? "no community"} / ${r.serve_relationship_status}]  id=${r.id}  created_at=${r.created_at}`);
    for (const ev of evidence.get(r.id as string) ?? []) console.log(`    evidence: ${ev}`);
  }

  const { data: leftoverRuns } = await supabase.from("roster_import_runs").select("id, source_filename, imported_by, status, imported_at").eq("imported_by", "verify-script");
  console.log(`\n=== INVENTORY: ${leftoverRuns?.length ?? 0} disposable roster_import_runs (imported_by='verify-script') ===\n`);
  for (const run of leftoverRuns ?? []) {
    console.log(`- ${run.source_filename}  status=${run.status}  imported_at=${run.imported_at}  id=${run.id}`);
  }

  if (residentIds.size === 0 && (leftoverRuns?.length ?? 0) === 0) {
    console.log("\nNothing to clean up.");
    return;
  }

  console.log("\n=== DELETING (FK-safe order) ===");

  // 1. person_vendor_identity_link_decisions -> person_vendor_identity_links
  //    for every link tied to a fixture resident.
  if (residentIds.size > 0) {
    const { data: linksToDelete } = await supabase
      .from("person_vendor_identity_links")
      .select("id")
      .eq("subject_type", "resident")
      .in("subject_id", [...residentIds]);
    const linkIds = (linksToDelete ?? []).map((l) => l.id as string);
    if (linkIds.length > 0) {
      const { error: decErr, count: decCount } = await supabase.from("person_vendor_identity_link_decisions").delete({ count: "exact" }).in("link_id", linkIds);
      if (decErr) throw new Error(`Could not delete person_vendor_identity_link_decisions: ${decErr.message}`);
      console.log(`Deleted ${decCount ?? 0} person_vendor_identity_link_decisions row(s).`);

      const { error: linkErr } = await supabase.from("person_vendor_identity_links").delete().in("id", linkIds);
      if (linkErr) throw new Error(`Could not delete person_vendor_identity_links: ${linkErr.message}`);
      console.log(`Deleted ${linkIds.length} person_vendor_identity_links row(s).`);
    }

    // 2. resident_serve_relationship_corrections
    const { error: corrErr, count: corrCount } = await supabase.from("resident_serve_relationship_corrections").delete({ count: "exact" }).in("resident_id", [...residentIds]);
    if (corrErr) throw new Error(`Could not delete resident_serve_relationship_corrections: ${corrErr.message}`);
    console.log(`Deleted ${corrCount ?? 0} resident_serve_relationship_corrections row(s).`);

    // 3. resident_timeline
    const { error: timelineErr, count: timelineCount } = await supabase.from("resident_timeline").delete({ count: "exact" }).in("resident_id", [...residentIds]);
    if (timelineErr) throw new Error(`Could not delete resident_timeline: ${timelineErr.message}`);
    console.log(`Deleted ${timelineCount ?? 0} resident_timeline row(s).`);
  }

  // 4/5. roster_source_rows -> roster_import_runs
  if (leftoverRuns && leftoverRuns.length > 0) {
    const runIds = leftoverRuns.map((r) => r.id as string);
    // Fixture residents matched by these roster rows are already covered
    // by the resident deletion below (matched_resident_id has no FK
    // constraint back to residents on this column — confirmed by the
    // Community Roster Import phase's own design — so ordering between
    // this block and the resident deletion doesn't matter).
    const { error: rowsErr, count: rowsCount } = await supabase.from("roster_source_rows").delete({ count: "exact" }).in("import_run_id", runIds);
    if (rowsErr) throw new Error(`Could not delete roster_source_rows: ${rowsErr.message}`);
    console.log(`Deleted ${rowsCount ?? 0} roster_source_rows row(s).`);

    const { error: runsErr } = await supabase.from("roster_import_runs").delete().in("id", runIds);
    if (runsErr) throw new Error(`Could not delete roster_import_runs: ${runsErr.message}`);
    console.log(`Deleted ${runIds.length} roster_import_runs row(s).`);
  }

  // 6. residents (last, after every dependent row is gone)
  if (residentIds.size > 0) {
    const { error: residentErr } = await supabase.from("residents").delete().in("id", [...residentIds]);
    if (residentErr) throw new Error(`Could not delete residents: ${residentErr.message}`);
    console.log(`Deleted ${residentIds.size} residents row(s).`);
  }

  // ═══ Verification AFTER ═══
  console.log("\n=== VERIFICATION (after) ===");
  const { ids: remainingIds } = await inventoryFixtureResidentIds(supabase);
  console.log(`Remaining fixture residents by evidence markers: ${remainingIds.size} (expected 0)`);

  const { data: remainingRuns } = await supabase.from("roster_import_runs").select("id").eq("imported_by", "verify-script");
  console.log(`Remaining verify-script roster_import_runs: ${remainingRuns?.length ?? 0} (expected 0)`);

  const { data: after } = await supabase.from("residents").select("id, first_name, last_name, source_system, serve_relationship_status").or("last_name.ilike.%Matos%,last_name.ilike.%Mabry%");
  console.log("\n=== Sanity check (after): real Matos/Mabry records — must be unchanged ===");
  for (const r of after ?? []) console.log(`- ${r.first_name} ${r.last_name}  source_system=${r.source_system}  relationship=${r.serve_relationship_status}`);

  if (remainingIds.size !== 0 || (remainingRuns?.length ?? 0) !== 0) {
    throw new Error("Cleanup incomplete — some fixture rows remain after deletion.");
  }
  console.log("\nCLEANUP COMPLETE.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

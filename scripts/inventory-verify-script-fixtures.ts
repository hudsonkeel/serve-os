// Production hygiene — READ-ONLY inventory of disposable test fixtures
// left behind by this session's live verify scripts. Does not delete
// anything. Uses only deterministic markers those scripts themselves
// write (never name-pattern matching alone):
//   - residents.source_system = 'verify-script-fixture' (direct-insert
//     fixtures used by every roster/add-client verify script)
//   - resident_serve_relationship_corrections.actor = 'verify-script'
//     (RPC-created fixtures — Add New Client's createResidentManual calls)
//   - person_vendor_identity_links.resolved_by = 'verify-script'
//     (any resident touched by a simulated identity-link confirmation)
//   - resident_timeline.created_by = 'verify-script'
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/inventory-verify-script-fixtures.ts
import { createServerClient } from "../lib/supabase/server.ts";

async function main() {
  const supabase = createServerClient();

  const residentIds = new Set<string>();
  const evidenceByResident = new Map<string, string[]>();

  function addEvidence(id: string, note: string) {
    residentIds.add(id);
    const list = evidenceByResident.get(id) ?? [];
    list.push(note);
    evidenceByResident.set(id, list);
  }

  // ── Marker 1: direct-insert fixture residents ──────────────────────
  const { data: directFixtures, error: directErr } = await supabase
    .from("residents")
    .select("id, first_name, last_name, community_name, source_system, created_at")
    .eq("source_system", "verify-script-fixture");
  if (directErr) throw new Error(`Marker 1 query failed: ${directErr.message}`);
  for (const r of directFixtures ?? []) addEvidence(r.id as string, "source_system='verify-script-fixture'");

  // ── Marker 2: RPC-created fixtures via a verify-script correction ──
  const { data: corrections, error: corrErr } = await supabase
    .from("resident_serve_relationship_corrections")
    .select("resident_id, actor, rationale, created_at")
    .eq("actor", "verify-script");
  if (corrErr) throw new Error(`Marker 2 query failed: ${corrErr.message}`);
  for (const c of corrections ?? []) addEvidence(c.resident_id as string, `resident_serve_relationship_corrections.actor='verify-script' (rationale: "${c.rationale}")`);

  // ── Marker 3: any resident touched by a verify-script identity link ─
  const { data: links, error: linkErr } = await supabase
    .from("person_vendor_identity_links")
    .select("id, subject_id, subject_type, source_system, vendor_record_id, resolved_by, link_role")
    .eq("resolved_by", "verify-script");
  if (linkErr) throw new Error(`Marker 3 query failed: ${linkErr.message}`);
  for (const l of links ?? []) {
    if (l.subject_type === "resident" && l.subject_id) {
      addEvidence(l.subject_id as string, `person_vendor_identity_links.resolved_by='verify-script' (source_system='${l.source_system}', vendor_record_id='${l.vendor_record_id}', role='${l.link_role}')`);
    }
  }

  // ── Marker 4: resident_timeline rows written by a verify script ────
  const { data: timelineRows, error: timelineErr } = await supabase
    .from("resident_timeline")
    .select("resident_id, event_title, created_by, created_at")
    .eq("created_by", "verify-script");
  if (timelineErr) throw new Error(`Marker 4 query failed: ${timelineErr.message}`);
  for (const t of timelineRows ?? []) addEvidence(t.resident_id as string, `resident_timeline.created_by='verify-script' ("${t.event_title}")`);

  console.log(`\n=== ${residentIds.size} disposable fixture resident(s) identified by deterministic markers ===\n`);

  if (residentIds.size > 0) {
    const { data: residentRows } = await supabase
      .from("residents")
      .select("id, first_name, last_name, community_name, community_code, serve_relationship_status, source_system, created_at")
      .in("id", [...residentIds]);

    for (const r of residentRows ?? []) {
      console.log(`- ${r.first_name} ${r.last_name}  [${r.community_name ?? "no community"} / ${r.serve_relationship_status}]  id=${r.id}`);
      console.log(`  created_at=${r.created_at}  source_system=${r.source_system}`);
      for (const ev of evidenceByResident.get(r.id as string) ?? []) console.log(`  evidence: ${ev}`);
    }

    // Flag any resident id referenced in the evidence markers that no
    // longer resolves to a live residents row (already-orphaned links
    // etc.) — surfaced separately so they aren't silently missed.
    const foundIds = new Set((residentRows ?? []).map((r) => r.id as string));
    const orphanedIds = [...residentIds].filter((id) => !foundIds.has(id));
    if (orphanedIds.length > 0) {
      console.log(`\n=== ${orphanedIds.length} additional id(s) referenced by verify-script evidence but with NO matching residents row (already orphaned) ===`);
      for (const id of orphanedIds) {
        console.log(`- id=${id}`);
        for (const ev of evidenceByResident.get(id) ?? []) console.log(`  evidence: ${ev}`);
      }
    }
  }

  // ── Sanity check: confirm zero roster_import_runs from verify scripts ─
  const { data: leftoverRuns } = await supabase.from("roster_import_runs").select("id, source_filename, imported_by").eq("imported_by", "verify-script");
  console.log(`\nleftover verify-script roster_import_runs: ${leftoverRuns?.length ?? 0}`);

  // ── Sanity check: confirm Maria Matos / Karen Mabry are untouched ──
  const { data: mariaKaren } = await supabase
    .from("residents")
    .select("id, first_name, last_name, source_system, serve_relationship_status")
    .or("last_name.ilike.%Matos%,last_name.ilike.%Mabry%");
  console.log(`\n=== Sanity check: residents matching Matos/Mabry (must show real source_system, none should be in the fixture list above) ===`);
  for (const r of mariaKaren ?? []) {
    console.log(`- ${r.first_name} ${r.last_name}  source_system=${r.source_system}  relationship=${r.serve_relationship_status}  in_fixture_list=${residentIds.has(r.id as string)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

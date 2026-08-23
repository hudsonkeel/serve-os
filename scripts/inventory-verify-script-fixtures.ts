// Production hygiene — READ-ONLY inventory of disposable test fixtures
// left behind by this session's live verify scripts. Does not delete
// anything. Uses only deterministic markers those scripts themselves
// write (never name-pattern matching alone — name/timestamp patterns are
// never the deciding evidence).
//
// Two marker conventions are checked everywhere an "actor" column exists,
// since both are in live use across this codebase's verify scripts (see
// docs/engineering/TEST_DATA_HYGIENE.md):
//   - the literal string 'verify-script' (the older convention)
//   - any value starting with '__SERVE_TEST__' (isTestMarker() from
//     lib/relationships/testMarker.ts — the newer, generateTestMarker()
//     convention every verify script written since has used)
//
// Two distinct fixture classes are reported separately:
//
//   CLASS A — whole synthetic residents (safe to delete entirely, incl.
//   every dependent row): identified by a marker on the resident's OWN
//   creation path —
//     - residents.source_system = 'verify-script-fixture'
//     - resident_serve_relationship_corrections.actor
//     - person_vendor_identity_links.resolved_by
//     - resident_timeline.created_by
//     - resident_triage_classifications.actor
//
//   CLASS B — contaminated evidence/document/link ROWS that may be
//   attached to a REAL resident (a verify script wrote test evidence
//   against a live resident id instead of a disposable fixture). These
//   must never trigger deletion of the resident itself — only the
//   marked rows are fixtures:
//     - person_evidence.entered_by / verified_by
//     - person_documents.uploaded_by
//     - requirement_evidence_links.linked_by
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/inventory-verify-script-fixtures.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { PREFIX as TEST_MARKER_PREFIX } from "../lib/relationships/testMarker.ts";

type Supabase = ReturnType<typeof createServerClient>;

// Matches the literal legacy marker OR any '__SERVE_TEST__'-prefixed value.
// Underscores in the prefix are escaped for ILIKE (Postgres treats a bare
// '_' as a single-character wildcard, which would otherwise over-match).
const ESCAPED_TEST_MARKER_PREFIX = TEST_MARKER_PREFIX.replace(/_/g, "\\_");
const FIXTURE_ACTOR_OR = (column: string) => `${column}.eq.verify-script,${column}.ilike.${ESCAPED_TEST_MARKER_PREFIX}%`;

async function inventoryClassA(supabase: Supabase): Promise<{ ids: Set<string>; evidence: Map<string, string[]> }> {
  const ids = new Set<string>();
  const evidence = new Map<string, string[]>();
  function add(id: string, note: string) {
    ids.add(id);
    const list = evidence.get(id) ?? [];
    list.push(note);
    evidence.set(id, list);
  }

  const { data: directFixtures, error: e1 } = await supabase
    .from("residents")
    .select("id")
    .eq("source_system", "verify-script-fixture");
  if (e1) throw new Error(`Marker query (source_system) failed: ${e1.message}`);
  for (const r of directFixtures ?? []) add(r.id as string, "source_system='verify-script-fixture'");

  const { data: corrections, error: e2 } = await supabase
    .from("resident_serve_relationship_corrections")
    .select("resident_id, actor, rationale")
    .or(FIXTURE_ACTOR_OR("actor"));
  if (e2) throw new Error(`Marker query (corrections) failed: ${e2.message}`);
  for (const c of corrections ?? []) add(c.resident_id as string, `resident_serve_relationship_corrections.actor='${c.actor}' (rationale: "${c.rationale}")`);

  const { data: links, error: e3 } = await supabase
    .from("person_vendor_identity_links")
    .select("subject_id, subject_type, source_system, vendor_record_id, resolved_by")
    .or(FIXTURE_ACTOR_OR("resolved_by"));
  if (e3) throw new Error(`Marker query (links) failed: ${e3.message}`);
  for (const l of links ?? []) {
    if (l.subject_type === "resident" && l.subject_id) {
      add(l.subject_id as string, `person_vendor_identity_links.resolved_by='${l.resolved_by}' (source_system='${l.source_system}', vendor_record_id='${l.vendor_record_id}')`);
    }
  }

  const { data: timelineRows, error: e4 } = await supabase
    .from("resident_timeline")
    .select("resident_id, event_title, created_by")
    .or(FIXTURE_ACTOR_OR("created_by"));
  if (e4) throw new Error(`Marker query (timeline) failed: ${e4.message}`);
  for (const t of timelineRows ?? []) add(t.resident_id as string, `resident_timeline.created_by='${t.created_by}' ("${t.event_title}")`);

  const { data: triageRows, error: e5 } = await supabase
    .from("resident_triage_classifications")
    .select("resident_id, actor, level_code")
    .or(FIXTURE_ACTOR_OR("actor"));
  if (e5) throw new Error(`Marker query (triage classifications) failed: ${e5.message}`);
  for (const t of triageRows ?? []) add(t.resident_id as string, `resident_triage_classifications.actor='${t.actor}' (level_code='${t.level_code}')`);

  return { ids, evidence };
}

type ContaminatedRow = { id: string; subjectId: string; note: string };

async function inventoryClassB(supabase: Supabase): Promise<{ evidenceRows: ContaminatedRow[]; documentRows: ContaminatedRow[]; linkRows: ContaminatedRow[] }> {
  const { data: evidenceRows, error: e1 } = await supabase
    .from("person_evidence")
    .select("id, subject_type, subject_id, entered_by, verified_by, notes")
    .eq("subject_type", "resident")
    .or(`${FIXTURE_ACTOR_OR("entered_by")},${FIXTURE_ACTOR_OR("verified_by")}`);
  if (e1) throw new Error(`Marker query (person_evidence) failed: ${e1.message}`);

  const { data: documentRows, error: e2 } = await supabase
    .from("person_documents")
    .select("id, subject_type, subject_id, uploaded_by, original_filename")
    .eq("subject_type", "resident")
    .or(FIXTURE_ACTOR_OR("uploaded_by"));
  if (e2) throw new Error(`Marker query (person_documents) failed: ${e2.message}`);

  const evidenceIds = (evidenceRows ?? []).map((e) => e.id as string);
  const { data: linkRows, error: e3 } =
    evidenceIds.length > 0
      ? await supabase.from("requirement_evidence_links").select("id, evidence_id, linked_by, rationale").in("evidence_id", evidenceIds)
      : { data: [], error: null as null };
  if (e3) throw new Error(`Marker query (requirement_evidence_links) failed: ${e3.message}`);
  // A link can also carry its own marker directly (linked_by) even if the
  // evidence row somehow didn't — check both sources of truth.
  const { data: linkRowsByOwnMarker, error: e4 } = await supabase
    .from("requirement_evidence_links")
    .select("id, evidence_id, linked_by, rationale")
    .or(FIXTURE_ACTOR_OR("linked_by"));
  if (e4) throw new Error(`Marker query (requirement_evidence_links, own marker) failed: ${e4.message}`);

  const allLinkRows = new Map([...(linkRows ?? []), ...(linkRowsByOwnMarker ?? [])].map((l) => [l.id as string, l]));

  return {
    evidenceRows: (evidenceRows ?? []).map((e) => ({
      id: e.id as string,
      subjectId: e.subject_id as string,
      note: `entered_by='${e.entered_by}' verified_by='${e.verified_by}' notes='${e.notes}'`,
    })),
    documentRows: (documentRows ?? []).map((d) => ({
      id: d.id as string,
      subjectId: d.subject_id as string,
      note: `uploaded_by='${d.uploaded_by}' original_filename='${d.original_filename}'`,
    })),
    linkRows: [...allLinkRows.values()].map((l) => ({
      id: l.id as string,
      subjectId: l.evidence_id as string,
      note: `linked_by='${l.linked_by}' rationale='${l.rationale}'`,
    })),
  };
}

async function main() {
  const supabase = createServerClient();

  const { ids: classAIds, evidence: classAEvidence } = await inventoryClassA(supabase);

  console.log(`\n=== CLASS A: ${classAIds.size} disposable fixture resident(s) — safe to delete entirely ===\n`);
  if (classAIds.size > 0) {
    const { data: residentRows } = await supabase
      .from("residents")
      .select("id, first_name, last_name, community_name, community_code, serve_relationship_status, source_system, created_at")
      .in("id", [...classAIds]);

    for (const r of residentRows ?? []) {
      console.log(`- ${r.first_name} ${r.last_name}  [${r.community_name ?? "no community"} / ${r.serve_relationship_status}]  id=${r.id}`);
      console.log(`  created_at=${r.created_at}  source_system=${r.source_system}`);
      for (const ev of classAEvidence.get(r.id as string) ?? []) console.log(`  evidence: ${ev}`);
    }

    const foundIds = new Set((residentRows ?? []).map((r) => r.id as string));
    const orphanedIds = [...classAIds].filter((id) => !foundIds.has(id));
    if (orphanedIds.length > 0) {
      console.log(`\n=== ${orphanedIds.length} additional id(s) referenced by fixture evidence but with NO matching residents row (already orphaned) ===`);
      for (const id of orphanedIds) {
        console.log(`- id=${id}`);
        for (const ev of classAEvidence.get(id) ?? []) console.log(`  evidence: ${ev}`);
      }
    }
  }

  const { evidenceRows, documentRows, linkRows } = await inventoryClassB(supabase);
  // Only report Class B rows whose subject isn't already a Class A
  // fixture (those are already covered by the whole-resident deletion).
  const classBEvidenceOnRealResidents = evidenceRows.filter((r) => !classAIds.has(r.subjectId));
  const contaminatedSubjectIds = new Set(classBEvidenceOnRealResidents.map((r) => r.subjectId));

  console.log(`\n=== CLASS B: ${classBEvidenceOnRealResidents.length} contaminated evidence row(s), ${documentRows.filter((d) => !classAIds.has(d.subjectId)).length} document row(s), ${linkRows.length} link row(s) — resident itself is NEVER deleted ===\n`);
  if (contaminatedSubjectIds.size > 0) {
    const { data: subjectRows } = await supabase
      .from("residents")
      .select("id, first_name, last_name, source_system, serve_relationship_status")
      .in("id", [...contaminatedSubjectIds]);
    for (const s of subjectRows ?? []) {
      console.log(`- ${s.first_name} ${s.last_name}  [source_system=${s.source_system} / rel=${s.serve_relationship_status}]  id=${s.id}  (RESIDENT ROW ITSELF IS REAL/PRESERVED)`);
      for (const ev of classBEvidenceOnRealResidents.filter((r) => r.subjectId === s.id)) console.log(`  person_evidence id=${ev.id}: ${ev.note}`);
      for (const doc of documentRows.filter((d) => d.subjectId === s.id)) console.log(`  person_documents id=${doc.id}: ${doc.note}`);
    }
    if (linkRows.length > 0) {
      console.log(`  requirement_evidence_links to remove:`);
      for (const l of linkRows) console.log(`    id=${l.id}: ${l.note}`);
    }
  }

  // ── Sanity check: confirm zero roster_import_runs from verify scripts ─
  const { data: leftoverRuns } = await supabase.from("roster_import_runs").select("id, source_filename, imported_by").or(FIXTURE_ACTOR_OR("imported_by"));
  console.log(`\nleftover fixture roster_import_runs: ${leftoverRuns?.length ?? 0}`);

  // ── Sanity check: confirm zero synthetic axiscare_client_canonical_snapshot rows ─
  const { data: snapshotRows } = await supabase
    .from("axiscare_client_canonical_snapshot")
    .select("id, axiscare_client_id")
    .ilike("axiscare_client_id", `%${ESCAPED_TEST_MARKER_PREFIX}%`);
  console.log(`leftover fixture axiscare_client_canonical_snapshot rows: ${snapshotRows?.length ?? 0}`);

  // ── Sanity check: protected real residents must never appear above ──
  const { data: protectedResidents } = await supabase
    .from("residents")
    .select("id, first_name, last_name, source_system, serve_relationship_status")
    .or("last_name.ilike.%Matos%,last_name.ilike.%Mabry%,last_name.ilike.%Dunaway%,last_name.ilike.%Maxwell%,last_name.ilike.%Owens%");
  console.log(`\n=== Sanity check: protected real residents (must show real source_system; none should be Class A; Class B contamination, if any, is reported explicitly) ===`);
  for (const r of protectedResidents ?? []) {
    const contaminated = contaminatedSubjectIds.has(r.id as string);
    console.log(`- ${r.first_name} ${r.last_name}  source_system=${r.source_system}  relationship=${r.serve_relationship_status}  in_class_a_fixture_list=${classAIds.has(r.id as string)}  has_class_b_contamination=${contaminated}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

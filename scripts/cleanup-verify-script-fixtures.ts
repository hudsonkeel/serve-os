// Production hygiene correction — deletes disposable test fixtures left
// behind by earlier live verify-script runs (some were interrupted before
// their own `finally` cleanup could run). Identifies fixtures via ONLY
// deterministic markers those scripts themselves wrote — never
// name-pattern matching alone (name/timestamp patterns are logged as
// corroboration, never as the deciding evidence).
//
// Two marker conventions are checked everywhere an "actor" column exists
// (see docs/engineering/TEST_DATA_HYGIENE.md):
//   - the literal string 'verify-script' (older convention)
//   - any value starting with '__SERVE_TEST__' (isTestMarker() from
//     lib/relationships/testMarker.ts — the newer convention)
//
// Two distinct fixture classes are handled differently:
//
//   CLASS A — whole synthetic residents. Deleted entirely, including
//   every dependent row, in FK-safe order:
//     person_vendor_identity_link_decisions
//       -> person_vendor_identity_links
//       -> requirement_evidence_links (for the resident's own evidence)
//       -> person_evidence
//       -> person_documents
//       -> resident_serve_relationship_corrections
//       -> resident_timeline
//       -> resident_triage_classifications
//       -> roster_source_rows -> roster_import_runs (separate leg)
//       -> residents (last)
//   Once a resident is confirmed synthetic via any resident-level marker,
//   ALL of its evidence/documents/links are deleted unconditionally (no
//   marker filter needed on those tables for this class — nothing
//   legitimate can be attached to a resident that never existed).
//
//   CLASS B — contaminated evidence/document/link ROWS that may be
//   attached to a REAL resident. The resident itself is NEVER deleted or
//   otherwise modified for this class — only the individually
//   marker-matched rows are removed:
//     requirement_evidence_links -> person_evidence -> person_documents
//
// Sanity-checked against every protected real resident (Maria Matos,
// Karen Mabry, Ann Dunaway, Arlene Maxwell, Lucille Owens) both before and
// after — refuses to proceed if any of them ever matches a Class A marker.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/cleanup-verify-script-fixtures.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { PREFIX as TEST_MARKER_PREFIX } from "../lib/relationships/testMarker.ts";

type Supabase = ReturnType<typeof createServerClient>;

// Underscores in the prefix are escaped for ILIKE (Postgres treats a bare
// '_' as a single-character wildcard, which would otherwise over-match).
const ESCAPED_TEST_MARKER_PREFIX = TEST_MARKER_PREFIX.replace(/_/g, "\\_");
const FIXTURE_ACTOR_OR = (column: string) => `${column}.eq.verify-script,${column}.ilike.${ESCAPED_TEST_MARKER_PREFIX}%`;

const PROTECTED_NAME_FILTER =
  "last_name.ilike.%Matos%,last_name.ilike.%Mabry%,last_name.ilike.%Dunaway%,last_name.ilike.%Maxwell%,last_name.ilike.%Owens%";

async function inventoryClassAIds(supabase: Supabase): Promise<{ ids: Set<string>; evidence: Map<string, string[]> }> {
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

async function inventoryClassBRowIds(supabase: Supabase, excludeSubjectIds: Set<string>): Promise<{ evidenceIds: string[]; documentIds: string[]; linkIds: string[]; subjectIds: Set<string> }> {
  const { data: evidenceRows, error: e1 } = await supabase
    .from("person_evidence")
    .select("id, subject_id")
    .eq("subject_type", "resident")
    .or(`${FIXTURE_ACTOR_OR("entered_by")},${FIXTURE_ACTOR_OR("verified_by")}`);
  if (e1) throw new Error(`Marker query (person_evidence) failed: ${e1.message}`);

  const { data: documentRows, error: e2 } = await supabase
    .from("person_documents")
    .select("id, subject_id")
    .eq("subject_type", "resident")
    .or(FIXTURE_ACTOR_OR("uploaded_by"));
  if (e2) throw new Error(`Marker query (person_documents) failed: ${e2.message}`);

  const filteredEvidence = (evidenceRows ?? []).filter((e) => !excludeSubjectIds.has(e.subject_id as string));
  const filteredDocuments = (documentRows ?? []).filter((d) => !excludeSubjectIds.has(d.subject_id as string));
  const evidenceIds = filteredEvidence.map((e) => e.id as string);

  const { data: linkRowsByEvidence } = evidenceIds.length > 0
    ? await supabase.from("requirement_evidence_links").select("id").in("evidence_id", evidenceIds)
    : { data: [] };
  const { data: linkRowsByOwnMarker, error: e4 } = await supabase.from("requirement_evidence_links").select("id").or(FIXTURE_ACTOR_OR("linked_by"));
  if (e4) throw new Error(`Marker query (requirement_evidence_links) failed: ${e4.message}`);

  const linkIds = [...new Set([...(linkRowsByEvidence ?? []).map((l) => l.id as string), ...(linkRowsByOwnMarker ?? []).map((l) => l.id as string)])];

  const subjectIds = new Set<string>([...filteredEvidence.map((e) => e.subject_id as string), ...filteredDocuments.map((d) => d.subject_id as string)]);

  return { evidenceIds, documentIds: filteredDocuments.map((d) => d.id as string), linkIds, subjectIds };
}

async function main() {
  const supabase = createServerClient();

  // ═══ Sanity check BEFORE: protected real residents must never appear ═══
  const { data: before } = await supabase.from("residents").select("id, first_name, last_name, source_system").or(PROTECTED_NAME_FILTER);
  console.log("=== Sanity check (before): protected real residents ===");
  for (const r of before ?? []) console.log(`- ${r.first_name} ${r.last_name}  source_system=${r.source_system}`);

  const { ids: classAIds, evidence: classAEvidence } = await inventoryClassAIds(supabase);

  for (const r of before ?? []) {
    if (classAIds.has(r.id as string)) {
      throw new Error(`REFUSING TO PROCEED: a protected real resident (${r.first_name} ${r.last_name}, id=${r.id}) matched a Class A fixture marker. This must never happen — aborting without deleting anything.`);
    }
  }

  const { data: residentRows } = classAIds.size > 0
    ? await supabase.from("residents").select("id, first_name, last_name, community_name, serve_relationship_status, source_system, created_at").in("id", [...classAIds])
    : { data: [] };

  console.log(`\n=== CLASS A INVENTORY: ${classAIds.size} disposable fixture resident(s), evidence-confirmed ===\n`);
  for (const r of residentRows ?? []) {
    console.log(`- ${r.first_name} ${r.last_name}  [${r.community_name ?? "no community"} / ${r.serve_relationship_status}]  id=${r.id}  created_at=${r.created_at}`);
    for (const ev of classAEvidence.get(r.id as string) ?? []) console.log(`    evidence: ${ev}`);
  }

  const { evidenceIds: classBEvidenceIds, documentIds: classBDocumentIds, linkIds: classBLinkIds, subjectIds: classBSubjectIds } = await inventoryClassBRowIds(supabase, classAIds);

  console.log(`\n=== CLASS B INVENTORY: ${classBEvidenceIds.length} contaminated person_evidence row(s), ${classBDocumentIds.length} person_documents row(s), ${classBLinkIds.length} requirement_evidence_links row(s) across ${classBSubjectIds.size} real resident(s) — resident row(s) themselves are NEVER touched ===\n`);
  if (classBSubjectIds.size > 0) {
    const { data: subjectRows } = await supabase.from("residents").select("id, first_name, last_name, source_system").in("id", [...classBSubjectIds]);
    for (const s of subjectRows ?? []) console.log(`- ${s.first_name} ${s.last_name}  source_system=${s.source_system}  id=${s.id}  (preserved — only its test-marked evidence/document/link rows are removed)`);
    for (const r of before ?? []) {
      if (classBSubjectIds.has(r.id as string)) {
        console.log(`  NOTE: this subject is also a protected name — confirmed the resident row itself is unaffected by this cleanup.`);
      }
    }
  }

  const { data: leftoverRuns } = await supabase.from("roster_import_runs").select("id, source_filename, imported_by, status, imported_at").or(FIXTURE_ACTOR_OR("imported_by"));
  console.log(`\n=== INVENTORY: ${leftoverRuns?.length ?? 0} disposable roster_import_runs ===\n`);
  for (const run of leftoverRuns ?? []) console.log(`- ${run.source_filename}  status=${run.status}  imported_at=${run.imported_at}  id=${run.id}`);

  const nothingToDo = classAIds.size === 0 && (leftoverRuns?.length ?? 0) === 0 && classBEvidenceIds.length === 0 && classBDocumentIds.length === 0 && classBLinkIds.length === 0;
  if (nothingToDo) {
    console.log("\nNothing to clean up.");
    return;
  }

  console.log("\n=== DELETING (FK-safe order) ===");

  // ── CLASS A: whole synthetic residents + everything under them ──────
  if (classAIds.size > 0) {
    const { data: linksToDelete } = await supabase.from("person_vendor_identity_links").select("id").eq("subject_type", "resident").in("subject_id", [...classAIds]);
    const linkIdsToDelete = (linksToDelete ?? []).map((l) => l.id as string);
    if (linkIdsToDelete.length > 0) {
      const { error: decErr, count: decCount } = await supabase.from("person_vendor_identity_link_decisions").delete({ count: "exact" }).in("link_id", linkIdsToDelete);
      if (decErr) throw new Error(`Could not delete person_vendor_identity_link_decisions: ${decErr.message}`);
      console.log(`Deleted ${decCount ?? 0} person_vendor_identity_link_decisions row(s).`);

      const { error: linkErr } = await supabase.from("person_vendor_identity_links").delete().in("id", linkIdsToDelete);
      if (linkErr) throw new Error(`Could not delete person_vendor_identity_links: ${linkErr.message}`);
      console.log(`Deleted ${linkIdsToDelete.length} person_vendor_identity_links row(s).`);
    }

    const { data: residentEvidenceRows } = await supabase.from("person_evidence").select("id").eq("subject_type", "resident").in("subject_id", [...classAIds]);
    const residentEvidenceIds = (residentEvidenceRows ?? []).map((e) => e.id as string);
    if (residentEvidenceIds.length > 0) {
      const { error: linkDelErr, count: linkDelCount } = await supabase.from("requirement_evidence_links").delete({ count: "exact" }).in("evidence_id", residentEvidenceIds);
      if (linkDelErr) throw new Error(`Could not delete requirement_evidence_links (Class A): ${linkDelErr.message}`);
      console.log(`Deleted ${linkDelCount ?? 0} requirement_evidence_links row(s) (Class A residents).`);

      const { error: evDelErr, count: evDelCount } = await supabase.from("person_evidence").delete({ count: "exact" }).in("id", residentEvidenceIds);
      if (evDelErr) throw new Error(`Could not delete person_evidence (Class A): ${evDelErr.message}`);
      console.log(`Deleted ${evDelCount ?? 0} person_evidence row(s) (Class A residents).`);
    }

    const { error: docDelErr, count: docDelCount } = await supabase.from("person_documents").delete({ count: "exact" }).eq("subject_type", "resident").in("subject_id", [...classAIds]);
    if (docDelErr) throw new Error(`Could not delete person_documents (Class A): ${docDelErr.message}`);
    console.log(`Deleted ${docDelCount ?? 0} person_documents row(s) (Class A residents).`);

    const { error: corrErr, count: corrCount } = await supabase.from("resident_serve_relationship_corrections").delete({ count: "exact" }).in("resident_id", [...classAIds]);
    if (corrErr) throw new Error(`Could not delete resident_serve_relationship_corrections: ${corrErr.message}`);
    console.log(`Deleted ${corrCount ?? 0} resident_serve_relationship_corrections row(s).`);

    const { error: timelineErr, count: timelineCount } = await supabase.from("resident_timeline").delete({ count: "exact" }).in("resident_id", [...classAIds]);
    if (timelineErr) throw new Error(`Could not delete resident_timeline: ${timelineErr.message}`);
    console.log(`Deleted ${timelineCount ?? 0} resident_timeline row(s).`);

    const { error: triageErr, count: triageCount } = await supabase.from("resident_triage_classifications").delete({ count: "exact" }).in("resident_id", [...classAIds]);
    if (triageErr) throw new Error(`Could not delete resident_triage_classifications: ${triageErr.message}`);
    console.log(`Deleted ${triageCount ?? 0} resident_triage_classifications row(s).`);
  }

  // ── roster_source_rows -> roster_import_runs (separate leg) ─────────
  if (leftoverRuns && leftoverRuns.length > 0) {
    const runIds = leftoverRuns.map((r) => r.id as string);
    const { error: rowsErr, count: rowsCount } = await supabase.from("roster_source_rows").delete({ count: "exact" }).in("import_run_id", runIds);
    if (rowsErr) throw new Error(`Could not delete roster_source_rows: ${rowsErr.message}`);
    console.log(`Deleted ${rowsCount ?? 0} roster_source_rows row(s).`);

    const { error: runsErr } = await supabase.from("roster_import_runs").delete().in("id", runIds);
    if (runsErr) throw new Error(`Could not delete roster_import_runs: ${runsErr.message}`);
    console.log(`Deleted ${runIds.length} roster_import_runs row(s).`);
  }

  // ── residents (last, after every dependent row is gone) ─────────────
  if (classAIds.size > 0) {
    const { error: residentErr } = await supabase.from("residents").delete().in("id", [...classAIds]);
    if (residentErr) throw new Error(`Could not delete residents: ${residentErr.message}`);
    console.log(`Deleted ${classAIds.size} residents row(s).`);
  }

  // ── CLASS B: contaminated rows only — never the resident ─────────────
  if (classBLinkIds.length > 0) {
    const { error, count } = await supabase.from("requirement_evidence_links").delete({ count: "exact" }).in("id", classBLinkIds);
    if (error) throw new Error(`Could not delete requirement_evidence_links (Class B): ${error.message}`);
    console.log(`Deleted ${count ?? 0} requirement_evidence_links row(s) (Class B contamination).`);
  }
  if (classBEvidenceIds.length > 0) {
    const { error, count } = await supabase.from("person_evidence").delete({ count: "exact" }).in("id", classBEvidenceIds);
    if (error) throw new Error(`Could not delete person_evidence (Class B): ${error.message}`);
    console.log(`Deleted ${count ?? 0} person_evidence row(s) (Class B contamination).`);
  }
  if (classBDocumentIds.length > 0) {
    const { error, count } = await supabase.from("person_documents").delete({ count: "exact" }).in("id", classBDocumentIds);
    if (error) throw new Error(`Could not delete person_documents (Class B): ${error.message}`);
    console.log(`Deleted ${count ?? 0} person_documents row(s) (Class B contamination).`);
  }

  // ═══ Verification AFTER ═══
  console.log("\n=== VERIFICATION (after) ===");
  const { ids: remainingClassAIds } = await inventoryClassAIds(supabase);
  console.log(`Remaining Class A fixture residents: ${remainingClassAIds.size} (expected 0)`);

  const { evidenceIds: remainingBEvidence, documentIds: remainingBDocuments, linkIds: remainingBLinks } = await inventoryClassBRowIds(supabase, remainingClassAIds);
  console.log(`Remaining Class B contaminated rows: evidence=${remainingBEvidence.length} documents=${remainingBDocuments.length} links=${remainingBLinks.length} (expected 0 each)`);

  const { data: remainingRuns } = await supabase.from("roster_import_runs").select("id").or(FIXTURE_ACTOR_OR("imported_by"));
  console.log(`Remaining fixture roster_import_runs: ${remainingRuns?.length ?? 0} (expected 0)`);

  const { data: after } = await supabase.from("residents").select("id, first_name, last_name, source_system, serve_relationship_status").or(PROTECTED_NAME_FILTER);
  console.log("\n=== Sanity check (after): protected real residents — must be unchanged ===");
  for (const r of after ?? []) console.log(`- ${r.first_name} ${r.last_name}  source_system=${r.source_system}  relationship=${r.serve_relationship_status}`);

  if (remainingClassAIds.size !== 0 || (remainingRuns?.length ?? 0) !== 0 || remainingBEvidence.length !== 0 || remainingBDocuments.length !== 0 || remainingBLinks.length !== 0) {
    throw new Error("Cleanup incomplete — some fixture rows remain after deletion.");
  }
  console.log("\nCLEANUP COMPLETE.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

// Script-compatible data layer for Watermere roster reconciliation —
// relative imports with explicit .ts extensions (matches lib/data/
// relationships.ts's convention), so scripts/importWatermereRoster.ts can
// import it directly without the Next.js "@/" alias.
import { createServerClient } from "../supabase/server.ts";
import type { LiveResident, PersonOutcome } from "../residents/roster/types.ts";

// ─── Community Roster Import + Reconciliation phase additions ─────────────
//
// Everything below is new, additive, and used only by the web-based import
// path (lib/actions/communityRosterImport.ts) — nothing above this line is
// changed, so scripts/importWatermereRoster.ts is completely unaffected.

export async function loadLiveWatermereResidents(communityCode: string): Promise<LiveResident[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, middle_name, preferred_name, display_name, full_name, unit_number, building, community_code, is_active")
    .eq("community_code", communityCode)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load live residents: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    preferredName: r.preferred_name as string | null,
    displayName: r.display_name as string | null,
    fullName: r.full_name as string | null,
    unitNumber: r.unit_number as string | null,
    building: r.building as string | null,
    communityCode: r.community_code as string | null,
    isActive: r.is_active as boolean,
  }));
}

export interface CreateImportRunInput {
  communityCode: string;
  sourceFilename: string;
  sourceHash: string;
  sourceEffectiveDate: string | null;
  importedBy: string;
  mode: "dry_run" | "apply";
}

export async function createImportRun(input: CreateImportRunInput): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_import_runs")
    .insert({
      community_code: input.communityCode,
      source_filename: input.sourceFilename,
      source_hash: input.sourceHash,
      source_effective_date: input.sourceEffectiveDate,
      imported_by: input.importedBy,
      mode: input.mode,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[residentRoster:createImportRun:error]", { message: error.message, code: error.code });
    return { error: "Could not create the import run record." };
  }
  return { id: data.id as string };
}

export interface UpdateImportRunCountsInput {
  runId: string;
  totalSourceRows: number;
  matchedCount: number;
  apartmentChangeCount: number;
  newResidentCount: number;
  ambiguousCount: number;
  duplicateSourceCount: number;
  absentExistingCount: number;
  noOpCount: number;
  appliedAt: string | null;
}

export async function updateImportRunCounts(input: UpdateImportRunCountsInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("roster_import_runs")
    .update({
      total_source_rows: input.totalSourceRows,
      matched_count: input.matchedCount,
      apartment_change_count: input.apartmentChangeCount,
      new_resident_count: input.newResidentCount,
      ambiguous_count: input.ambiguousCount,
      duplicate_source_count: input.duplicateSourceCount,
      absent_existing_count: input.absentExistingCount,
      no_op_count: input.noOpCount,
      applied_at: input.appliedAt,
    })
    .eq("id", input.runId);

  if (error) {
    console.error("[residentRoster:updateImportRunCounts:error]", { message: error.message, code: error.code });
    return { error: "Could not update the import run record." };
  }
  return {};
}

export async function insertSourceRows(
  runId: string,
  outcomes: readonly PersonOutcome[],
): Promise<{ error?: string }> {
  if (outcomes.length === 0) return {};
  const supabase = createServerClient();
  const { error } = await supabase.from("roster_source_rows").insert(
    outcomes.map((o) => ({
      import_run_id: runId,
      source_sheet: o.person.sourceSheet,
      source_row_number: o.person.sourceRowNumber,
      raw_payload: { displayLabel: o.person.displayLabel, apartment: o.person.apartment },
      normalized_payload: { lastName: o.person.lastName, firstName: o.person.firstName, apartment: o.person.apartment },
      resolution_status: o.classification,
      matched_resident_id: o.residentId,
      match_method: o.matchMethod,
      match_confidence: o.matchConfidence,
      review_notes: [o.reason, o.directoryDiscrepancy].filter(Boolean).join(" "),
    })),
  );

  if (error) {
    console.error("[residentRoster:insertSourceRows:error]", { message: error.message, code: error.code });
    return { error: "Could not record source rows for this import run." };
  }
  return {};
}

export interface ApplyApartmentChangeInput {
  residentId: string;
  newUnitNumber: string;
  newBuilding: string | null;
  communityCode: string;
  importRunId: string;
  actor: string;
}

export async function applyRosterApartmentChange(input: ApplyApartmentChangeInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("apply_roster_apartment_change", {
    p_resident_id: input.residentId,
    p_new_unit_number: input.newUnitNumber,
    p_new_building: input.newBuilding,
    p_community_code: input.communityCode,
    p_import_run_id: input.importRunId,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentRoster:applyRosterApartmentChange:error]", { residentId: input.residentId, message: error.message, code: error.code });
    return { error: "Could not apply this apartment change." };
  }
  return {};
}

export interface ApplyNewResidentInput {
  firstName: string;
  lastName: string;
  displayName: string;
  fullName: string;
  communityName: string;
  communityCode: string;
  unitNumber: string;
  building: string | null;
  phone: string | null;
  // The true, unmodified source value — distinct from `phone` (validated/
  // normalized for storage, null when invalid). Previously both columns
  // were written from the same normalized value, so `phone_raw` never
  // actually held the raw source string; see
  // supabase/migrations/20260807000000_create_resident_data_integrity.sql.
  phoneRaw: string | null;
  sourceSystem: string;
  sourceFile: string;
  importBatch: string;
  importRunId: string;
  actor: string;
}

export async function applyRosterNewResident(input: ApplyNewResidentInput): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("apply_roster_new_resident", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_display_name: input.displayName,
    p_full_name: input.fullName,
    p_community_name: input.communityName,
    p_community_code: input.communityCode,
    p_unit_number: input.unitNumber,
    p_building: input.building,
    p_phone: input.phone,
    p_phone_raw: input.phoneRaw,
    p_source_system: input.sourceSystem,
    p_source_file: input.sourceFile,
    p_import_batch: input.importBatch,
    p_import_run_id: input.importRunId,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentRoster:applyRosterNewResident:error]", { message: error.message, code: error.code });
    return { error: "Could not create this resident." };
  }
  return { id: data as string };
}

export interface RecordAbsenceInput {
  residentId: string;
  importRunId: string;
  communityCode: string;
  lastKnownUnitNumber: string | null;
  actor: string;
}

export async function recordRosterAbsence(input: RecordAbsenceInput): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("record_roster_absence", {
    p_resident_id: input.residentId,
    p_import_run_id: input.importRunId,
    p_community_code: input.communityCode,
    p_last_known_unit_number: input.lastKnownUnitNumber,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentRoster:recordRosterAbsence:error]", { residentId: input.residentId, message: error.message, code: error.code });
    return { error: "Could not record this roster absence." };
  }
  return { id: data as string };
}

export async function getOpenAbsenceReviewByResident(residentId: string): Promise<{ id: string } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_absence_reviews")
    .select("id")
    .eq("resident_id", residentId)
    .eq("status", "requires_review")
    .maybeSingle();

  if (error) {
    console.error("[residentRoster:getOpenAbsenceReviewByResident:error]", { residentId, message: error.message, code: error.code });
    return null;
  }
  return data ? { id: data.id as string } : null;
}

export interface ResolveAbsenceInput {
  reviewId: string;
  disposition: "moved_out" | "deceased" | "transferred" | "still_active" | "unknown";
  disposition_reason: string | null;
  disposition_effective_date: string | null;
  decidedBy: string;
}

export async function resolveRosterAbsence(input: ResolveAbsenceInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_roster_absence", {
    p_review_id: input.reviewId,
    p_disposition: input.disposition,
    p_disposition_reason: input.disposition_reason,
    p_disposition_effective_date: input.disposition_effective_date,
    p_decided_by: input.decidedBy,
  });

  if (error) {
    console.error("[residentRoster:resolveRosterAbsence:error]", { reviewId: input.reviewId, message: error.message, code: error.code });
    return { error: "Could not resolve this roster absence review." };
  }
  return {};
}

// community_id-based candidate loader — the web import path's counterpart
// to loadLiveWatermereResidents() above, which is keyed by the legacy
// community_code text field. Community-scoped at the SQL level (section
// 111): never fetch-all-then-filter.
export async function loadLiveResidentsForCommunity(communityId: string): Promise<LiveResident[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, middle_name, preferred_name, display_name, full_name, unit_number, building, community_code, is_active, date_of_birth, phone, phone_raw")
    .eq("community_id", communityId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load live residents: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    preferredName: r.preferred_name as string | null,
    displayName: r.display_name as string | null,
    fullName: r.full_name as string | null,
    unitNumber: r.unit_number as string | null,
    building: r.building as string | null,
    communityCode: r.community_code as string | null,
    isActive: r.is_active as boolean,
    dateOfBirth: r.date_of_birth as string | null,
    phone: (r.phone as string | null) ?? (r.phone_raw as string | null),
  }));
}

// The web import path's counterpart to loadLiveResidentsForCommunity()
// above, scoped to every OTHER community — the batch, single-pass source
// for the cross-community "possible move" surfacing (section 20, 101),
// never a per-row query.
export async function loadLiveResidentsExcludingCommunity(communityId: string): Promise<LiveResident[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, middle_name, preferred_name, display_name, full_name, unit_number, building, community_code, is_active, date_of_birth, phone, phone_raw")
    .neq("community_id", communityId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load cross-community residents: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    middleName: r.middle_name as string | null,
    preferredName: r.preferred_name as string | null,
    displayName: r.display_name as string | null,
    fullName: r.full_name as string | null,
    unitNumber: r.unit_number as string | null,
    building: r.building as string | null,
    communityCode: r.community_code as string | null,
    isActive: r.is_active as boolean,
    dateOfBirth: r.date_of_birth as string | null,
    phone: (r.phone as string | null) ?? (r.phone_raw as string | null),
  }));
}

export interface CreateCommunityRosterImportRunInput {
  communityId: string;
  communityCode: string;
  sourceFilename: string;
  sourceHash: string;
  storagePath: string;
  importedBy: string;
}

// The web import path's run creation — always source_type='community_roster'
// (section 30, never a per-community literal like 'firewheel_roster'),
// always status='analyzing' (the new, additive lifecycle value), always
// mode='apply' (there is no separate "dry run" concept in the web flow —
// analysis itself never mutates canonical data, so the old dry_run/apply
// distinction doesn't apply the same way; commit is its own later, gated
// step regardless).
export async function createCommunityRosterImportRun(
  input: CreateCommunityRosterImportRunInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_import_runs")
    .insert({
      community_id: input.communityId,
      community_code: input.communityCode,
      source_type: "community_roster",
      source_filename: input.sourceFilename,
      source_hash: input.sourceHash,
      storage_path: input.storagePath,
      imported_by: input.importedBy,
      mode: "apply",
      status: "analyzing",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[residentRoster:createCommunityRosterImportRun:error]", { message: error.message, code: error.code });
    return { error: "Could not create the roster import record." };
  }
  return { id: data.id as string };
}

export async function updateRosterImportRunStoragePath(runId: string, storagePath: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from("roster_import_runs").update({ storage_path: storagePath }).eq("id", runId);
  if (error) {
    console.error("[residentRoster:updateRosterImportRunStoragePath:error]", { runId, message: error.message, code: error.code });
    return { error: "Could not record the uploaded file's storage location." };
  }
  return {};
}

export async function getRosterImportRunStoragePath(runId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("roster_import_runs").select("storage_path").eq("id", runId).maybeSingle();
  if (error || !data) return null;
  return data.storage_path as string | null;
}

export type RosterImportRunStatus = "completed" | "failed" | "analyzing" | "pending_review" | "partially_committed" | "committed" | "cancelled";

export async function updateRosterImportRunStatus(
  runId: string,
  status: RosterImportRunStatus,
  extra?: { totalSourceRows?: number; appliedAt?: string | null }
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const update: Record<string, unknown> = { status };
  if (extra?.totalSourceRows !== undefined) update.total_source_rows = extra.totalSourceRows;
  if (extra?.appliedAt !== undefined) update.applied_at = extra.appliedAt;

  const { error } = await supabase.from("roster_import_runs").update(update).eq("id", runId);
  if (error) {
    console.error("[residentRoster:updateRosterImportRunStatus:error]", { runId, message: error.message, code: error.code });
    return { error: "Could not update the roster import record." };
  }
  return {};
}

// A prior COMMITTED run with the same file hash for the same community —
// section 25/92/93's idempotent-re-upload check. Only committed runs
// count (an abandoned/cancelled analysis of the same file should not
// block trying again).
export async function findCommittedRosterImportRunByHash(
  communityId: string,
  sourceHash: string
): Promise<{ id: string; importedAt: string } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_import_runs")
    .select("id, imported_at")
    .eq("community_id", communityId)
    .eq("source_hash", sourceHash)
    .in("status", ["committed", "partially_committed"])
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[residentRoster:findCommittedRosterImportRunByHash:error]", { message: error.message, code: error.code });
    return null;
  }
  return data ? { id: data.id as string, importedAt: data.imported_at as string } : null;
}

export interface RosterImportRunSummary {
  id: string;
  communityId: string | null;
  communityCode: string;
  sourceFilename: string;
  importedAt: string;
  importedBy: string;
  status: RosterImportRunStatus;
  totalSourceRows: number | null;
  matchedCount: number | null;
  newResidentCount: number | null;
  ambiguousCount: number | null;
  finalizedBy: string | null;
  appliedAt: string | null;
  // Pass 3 — rows still review_state in ('pending','deferred') for this
  // run. Undefined when the caller didn't ask for it (getRosterImportRunById
  // never computes this; listCommunityRosterImportRuns always does, in one
  // batch query, never per-row).
  unresolvedCount?: number;
}

function toRunSummary(row: Record<string, unknown>): RosterImportRunSummary {
  return {
    id: row.id as string,
    communityId: row.community_id as string | null,
    communityCode: row.community_code as string,
    sourceFilename: row.source_filename as string,
    importedAt: row.imported_at as string,
    importedBy: row.imported_by as string,
    status: row.status as RosterImportRunStatus,
    totalSourceRows: row.total_source_rows as number | null,
    matchedCount: row.matched_count as number | null,
    newResidentCount: row.new_resident_count as number | null,
    ambiguousCount: row.ambiguous_count as number | null,
    finalizedBy: row.finalized_by as string | null,
    appliedAt: row.applied_at as string | null,
  };
}

export async function getRosterImportRunById(runId: string): Promise<RosterImportRunSummary | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("roster_import_runs").select("*").eq("id", runId).maybeSingle();
  if (error || !data) return null;
  return toRunSummary(data);
}

// History list (section 32) — community-scoped when a communityId is
// given, cross-community for an authorized All Communities context.
// Pass 3 — also attaches each run's unresolvedCount via ONE additional
// batch query over every returned run's rows (grouped in JS, never
// per-run), so the list can surface "needs attention" without an N+1.
export async function listCommunityRosterImportRuns(communityId?: string): Promise<RosterImportRunSummary[]> {
  const supabase = createServerClient();
  let query = supabase.from("roster_import_runs").select("*").eq("source_type", "community_roster");
  if (communityId) query = query.eq("community_id", communityId);
  const { data, error } = await query.order("imported_at", { ascending: false }).limit(100);

  if (error) {
    console.error("[residentRoster:listCommunityRosterImportRuns:error]", { message: error.message, code: error.code });
    return [];
  }
  const runs = (data ?? []).map(toRunSummary);
  if (runs.length === 0) return runs;

  const { data: rowStates, error: rowError } = await supabase
    .from("roster_source_rows")
    .select("import_run_id, review_state")
    .in("import_run_id", runs.map((r) => r.id))
    .in("review_state", ["pending", "deferred"]);

  if (rowError) {
    console.error("[residentRoster:listCommunityRosterImportRuns:unresolvedCount:error]", { message: rowError.message });
    return runs;
  }

  const unresolvedByRun = new Map<string, number>();
  for (const row of rowStates ?? []) {
    const runId = row.import_run_id as string;
    unresolvedByRun.set(runId, (unresolvedByRun.get(runId) ?? 0) + 1);
  }
  return runs.map((r) => ({ ...r, unresolvedCount: unresolvedByRun.get(r.id) ?? 0 }));
}

// Pass 3 — Finalize Import. Never re-applies any row's already-durable
// decision; only records the run's closing status/summary once every row
// has reached a review_state a human has actually chosen (committed/
// invalid/deferred/pending are all legitimate closing states — partial
// finalization is explicitly allowed).
export async function finalizeRosterImportRun(
  runId: string,
  input: { status: RosterImportRunStatus; finalizedBy: string }
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("roster_import_runs")
    .update({ status: input.status, finalized_by: input.finalizedBy, applied_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) {
    console.error("[residentRoster:finalizeRosterImportRun:error]", { runId, message: error.message, code: error.code });
    return { error: "Could not finalize this import." };
  }
  return {};
}

// Pass 3 — Cancel. Only ever called once the caller has confirmed zero
// rows have reached review_state='committed' (nothing canonical was ever
// touched) — deletes the run's source rows and the run itself, matching
// the original governing plan's "discard, not soft-cancel" design for
// this specific pre-commit window.
export async function deleteRosterImportRun(runId: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error: rowsError } = await supabase.from("roster_source_rows").delete().eq("import_run_id", runId);
  if (rowsError) {
    console.error("[residentRoster:deleteRosterImportRun:rows:error]", { runId, message: rowsError.message, code: rowsError.code });
    return { error: "Could not cancel this import." };
  }
  const { error: runError } = await supabase.from("roster_import_runs").delete().eq("id", runId);
  if (runError) {
    console.error("[residentRoster:deleteRosterImportRun:run:error]", { runId, message: runError.message, code: runError.code });
    return { error: "Could not cancel this import." };
  }
  return {};
}

// Pass 3 — the Needs Review handoff reader (Part 6): every roster row
// across every run still review_state in ('pending','deferred'),
// community-scoped when a communityId is given. Data-model only, same as
// Pass 1/2 left it — not wired into the live /residents Needs Review tab
// in this pass (a separate, larger integration decision); exposed here
// so unresolved roster work is discoverable without hunting through each
// run individually.
export interface UnresolvedRosterSourceRow extends RosterSourceRow {
  readonly communityCode: string;
  readonly sourceFilename: string;
}

export async function getUnresolvedCommunityRosterSourceRows(communityId?: string): Promise<UnresolvedRosterSourceRow[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("roster_source_rows")
    .select("*, roster_import_runs!inner(community_id, community_code, source_filename)")
    .in("review_state", ["pending", "deferred"]);
  if (communityId) query = query.eq("roster_import_runs.community_id", communityId);

  const { data, error } = await query.order("source_row_number", { ascending: true }).limit(500);
  if (error) {
    console.error("[residentRoster:getUnresolvedCommunityRosterSourceRows:error]", { message: error.message, code: error.code });
    return [];
  }

  return (data ?? []).map((row) => {
    const run = row.roster_import_runs as { community_code: string; source_filename: string };
    return { ...toSourceRow(row), communityCode: run.community_code, sourceFilename: run.source_filename };
  });
}

export interface RosterSourceRowInsert {
  sourceRowNumber: number;
  sourceSheet: string;
  sourceRecordId: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  resolutionStatus: string;
  matchedResidentId: string | null;
  matchMethod: string | null;
  matchConfidence: string | null;
  reviewNotes: string | null;
  // Pass 2 — set only by the existing-source-link short-circuit (a
  // CONFIRMED person_vendor_identity_links row already exists for this
  // exact roster observation, discovered before analysis even runs): the
  // row is inserted already 'committed', never re-surfaced for review.
  // Every other row still defaults to 'pending' when omitted.
  reviewState?: string;
}

export async function insertCommunityRosterSourceRows(runId: string, rows: readonly RosterSourceRowInsert[]): Promise<{ error?: string }> {
  if (rows.length === 0) return {};
  const supabase = createServerClient();
  const { error } = await supabase.from("roster_source_rows").insert(
    rows.map((r) => ({
      import_run_id: runId,
      source_sheet: r.sourceSheet,
      source_row_number: r.sourceRowNumber,
      source_record_id: r.sourceRecordId,
      raw_payload: r.rawPayload,
      normalized_payload: r.normalizedPayload,
      resolution_status: r.resolutionStatus,
      matched_resident_id: r.matchedResidentId,
      match_method: r.matchMethod,
      match_confidence: r.matchConfidence,
      review_notes: r.reviewNotes,
      review_state: r.reviewState ?? "pending",
    }))
  );

  if (error) {
    console.error("[residentRoster:insertCommunityRosterSourceRows:error]", { message: error.message, code: error.code });
    return { error: "Could not record source rows for this import run." };
  }
  return {};
}

export interface RosterSourceRow {
  id: string;
  importRunId: string;
  sourceSheet: string;
  sourceRowNumber: number;
  sourceRecordId: string | null;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  resolutionStatus: string;
  matchedResidentId: string | null;
  matchMethod: string | null;
  matchConfidence: string | null;
  reviewNotes: string | null;
  reviewState: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

function toSourceRow(row: Record<string, unknown>): RosterSourceRow {
  return {
    id: row.id as string,
    importRunId: row.import_run_id as string,
    sourceSheet: row.source_sheet as string,
    sourceRowNumber: row.source_row_number as number,
    sourceRecordId: row.source_record_id as string | null,
    rawPayload: (row.raw_payload as Record<string, unknown>) ?? {},
    normalizedPayload: (row.normalized_payload as Record<string, unknown>) ?? {},
    resolutionStatus: row.resolution_status as string,
    matchedResidentId: row.matched_resident_id as string | null,
    matchMethod: row.match_method as string | null,
    matchConfidence: row.match_confidence as string | null,
    reviewNotes: row.review_notes as string | null,
    reviewState: row.review_state as string,
    decidedBy: row.decided_by as string | null,
    decidedAt: row.decided_at as string | null,
  };
}

export async function getRosterSourceRowsForRun(runId: string): Promise<RosterSourceRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("roster_source_rows")
    .select("*")
    .eq("import_run_id", runId)
    .order("source_row_number", { ascending: true });

  if (error) {
    console.error("[residentRoster:getRosterSourceRowsForRun:error]", { message: error.message, code: error.code });
    return [];
  }
  return (data ?? []).map(toSourceRow);
}

// Batch display-name lookup for the review page — every matched/
// suggested/ambiguous-candidate resident id across a whole run's rows,
// resolved in one query rather than per row.
export async function getResidentDisplayNamesByIds(residentIds: readonly string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(residentIds)];
  if (uniqueIds.length === 0) return new Map();
  const supabase = createServerClient();
  // community_name included so a cross-community suggestion
  // (Pass 3, 'possible_cross_community_match') reads as "Robert Chen ·
  // Watermere at Frisco" rather than an unlabeled name that looks like an
  // ordinary same-community match.
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, display_name, full_name, unit_number, community_name")
    .in("id", uniqueIds);

  if (error) {
    console.error("[residentRoster:getResidentDisplayNamesByIds:error]", { message: error.message, code: error.code });
    return new Map();
  }

  return new Map(
    (data ?? []).map((r) => {
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(" ") || (r.display_name as string | null) || (r.full_name as string | null) || "Unnamed Resident";
      const location = r.unit_number ? `Unit ${r.unit_number}` : (r.community_name as string | null);
      const withLocation = location ? `${name} · ${location}` : name;
      return [r.id as string, withLocation];
    })
  );
}

// Cross-community-aware variant for rows where the suggestion is
// explicitly about a DIFFERENT community — always shows the community
// name (never just the unit, which would be misleadingly silent about
// where this person actually lives).
export async function getResidentDisplayNamesWithCommunityByIds(residentIds: readonly string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(residentIds)];
  if (uniqueIds.length === 0) return new Map();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, display_name, full_name, community_name")
    .in("id", uniqueIds);

  if (error) {
    console.error("[residentRoster:getResidentDisplayNamesWithCommunityByIds:error]", { message: error.message, code: error.code });
    return new Map();
  }

  return new Map(
    (data ?? []).map((r) => {
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(" ") || (r.display_name as string | null) || (r.full_name as string | null) || "Unnamed Resident";
      const community = r.community_name as string | null;
      return [r.id as string, community ? `${name} · ${community}` : name];
    })
  );
}

export async function getRosterSourceRowById(sourceRowId: string): Promise<RosterSourceRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("roster_source_rows").select("*").eq("id", sourceRowId).maybeSingle();
  if (error || !data) return null;
  return toSourceRow(data);
}

// Pass 2 — the durable write behind every review decision (confirm/
// reject/defer/mark invalid/create resident). Written the moment a human
// decides, never held only in React state (section 58-61's own
// requirement), so a page refresh or a second operator always sees the
// current real decision, not a stale or conflicting prompt.
export async function updateRosterSourceRowDecision(
  sourceRowId: string,
  input: { reviewState: string; matchedResidentId?: string | null; decidedBy: string; reviewNotes?: string | null }
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const update: Record<string, unknown> = {
    review_state: input.reviewState,
    decided_by: input.decidedBy,
    decided_at: new Date().toISOString(),
  };
  if (input.matchedResidentId !== undefined) update.matched_resident_id = input.matchedResidentId;
  if (input.reviewNotes !== undefined) update.review_notes = input.reviewNotes;

  const { error } = await supabase.from("roster_source_rows").update(update).eq("id", sourceRowId);
  if (error) {
    console.error("[residentRoster:updateRosterSourceRowDecision:error]", { sourceRowId, message: error.message, code: error.code });
    return { error: "Could not record this review decision." };
  }
  return {};
}

// Pass 2 — records which reconciliation rule version produced a run's
// suggestions (Part 2 item 5: deterministic, versioned). Set once, at
// analysis time; never touched by a later per-row review decision.
export async function updateRosterImportRunMatchingRuleVersion(runId: string, version: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.from("roster_import_runs").update({ matching_rule_version: version }).eq("id", runId);
  if (error) {
    console.error("[residentRoster:updateRosterImportRunMatchingRuleVersion:error]", { runId, message: error.message, code: error.code });
    return { error: "Could not record the matching rule version." };
  }
  return {};
}
